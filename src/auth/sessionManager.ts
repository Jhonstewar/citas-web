import { ApiError, toApiError } from '../api/ApiError';
import type { AuthTokensResponse } from '../api/contracts';
import type { TokenStatus } from '../api/httpClient';
import { createSingleFlight } from './singleFlight';

/**
 * Estado de sesión del cliente, fuera de React para poder probarlo sin DOM.
 *
 * - El ACCESS token vive solo EN MEMORIA (nunca `localStorage`/`sessionStorage`).
 * - El REFRESH token ya no pasa por JavaScript (D36): viaja en la cookie `HttpOnly` `fcv_refresh`
 *   que el servidor emite en el login, rota en cada renovación y borra en el logout. Este módulo
 *   no lo ve ni lo guarda.
 * - Recargar la página (F5) borra la memoria, pero no la cookie: al arrancar, `restore()` pide
 *   una renovación y, si el servidor la acepta, la sesión continúa.
 */

/**
 * Estado observable por React:
 * - `checking`: aún no se sabe si hay sesión (arranque, esperando a `restore()`);
 * - `authenticated`: hay access token en memoria;
 * - `anonymous`: no hay sesión (el servidor lo dijo: 401/400 en el refresh, o hubo logout);
 * - `unavailable`: el arranque no obtuvo veredicto (red caída, 5xx). No se sabe si hay sesión,
 *   así que no se trata como "sin sesión": las rutas protegidas ofrecen reintentar en vez de
 *   mandar al login.
 */
export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'unavailable';

/** Llamadas al backend que necesita la sesión. Se inyectan para poder probarla. Sin cuerpo (D36). */
export interface SessionApi {
  refresh: () => Promise<AuthTokensResponse>;
  logout: () => Promise<void>;
}

export interface SessionManager {
  /** Access token vigente, o `null` si no hay sesión. */
  getAccessToken: () => string | null;
  /** Hay sesión abierta. */
  isAuthenticated: () => boolean;
  /** Estado de sesión, incluido "comprobando" durante el arranque. Es lo que React observa. */
  getStatus: () => SessionStatus;
  /**
   * Relación de un access token con la sesión vigente: es el actual, uno anterior ya renovado
   * de esta misma sesión, o uno de una sesión que ya se cerró.
   */
  tokenStatus: (accessToken: string) => TokenStatus;
  /** Registra los tokens de un login: abre una sesión nueva. */
  signIn: (tokens: AuthTokensResponse) => void;
  /**
   * Cierra la sesión local de inmediato y pide al servidor que revoque la familia del refresh
   * token y borre la cookie. La sesión local se cierra aunque esa petición falle.
   */
  signOut: () => void;
  /**
   * Cierra la sesión solo si `rejectedAccessToken` sigue siendo el vigente.
   * Un 401 que llega tarde, de una sesión ya cerrada, no puede cerrar la actual.
   */
  expire: (rejectedAccessToken: string) => void;
  /**
   * Renueva el access token (HU-003).
   * - `true`: hay un access token nuevo listo.
   * - `false`: la renovación fue rechazada y la sesión terminó (CA-07).
   * - Lanza `ApiError` si no hubo veredicto (red caída, 5xx): la sesión sigue
   *   abierta, porque un corte de red no invalida el refresh token.
   */
  refreshSession: () => Promise<boolean>;
  /**
   * Arranque (F5): intenta recuperar la sesión con la cookie. Se ejecuta UNA vez por gestor
   * (llamadas repetidas, p. ej. el doble montaje de `StrictMode`, reciben la misma promesa) y
   * comparte la renovación en vuelo. Nunca rechaza: sin veredicto (red caída, 5xx) el estado
   * pasa a `unavailable` y el error queda en `getRestoreFailure()`.
   */
  restore: () => Promise<void>;
  /**
   * Reintenta el arranque tras un `unavailable`: vuelve a `checking` y pide otra renovación.
   * En cualquier otro estado no hace nada (ya hay veredicto o ya se está comprobando).
   */
  retryRestore: () => Promise<void>;
  /** Error del arranque sin veredicto; `null` salvo en el estado `unavailable`. */
  getRestoreFailure: () => ApiError | null;
  /** Suscripción a cambios, con la firma que espera `useSyncExternalStore`. */
  subscribe: (listener: () => void) => () => void;
}

/** El servidor rechazó el refresh token: la sesión ya no es recuperable. */
function isRejection(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.kind === 'session' || cause.kind === 'validation');
}

export function createSessionManager(api: SessionApi): SessionManager {
  let accessToken: string | null = null;

  // Mientras sea `true`, la ausencia de access token significa "aún no se sabe", no "sin
  // sesión": así una ruta protegida recargada con F5 no rebota al login antes de que el
  // servidor responda. Lo apagan el fin de `restore()` y cualquier login, logout o renovación.
  let checking = true;
  let restoration: Promise<void> | null = null;
  // Error del arranque cuando el servidor no dio veredicto (estado `unavailable`). Lo borra
  // cualquier veredicto posterior: login, logout, renovación o un reintento.
  let restoreFailure: ApiError | null = null;

  // Cambia en cada login y cada logout. Una renovación que empezó en otra época
  // ya no pertenece a la sesión actual: ni aplica sus tokens ni la cierra.
  let epoch = 0;

  // Access tokens emitidos en la época actual. Distinguen un 401 de un token ya renovado de esta
  // sesión, que basta con reintentar, del de una sesión cerrada, que no puede reintentarse con
  // la identidad de la actual.
  const epochAccessTokens = new Set<string>();

  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function replaceTokens(tokens: AuthTokensResponse | null): void {
    accessToken = tokens?.accessToken ?? null;
    if (accessToken !== null) epochAccessTokens.add(accessToken);
    notify();
  }

  /** Abre una época nueva y descarta cualquier renovación de la anterior. */
  function startEpoch(tokens: AuthTokensResponse | null): void {
    epoch += 1;
    checking = false;
    restoreFailure = null;
    refreshFlight.reset();
    epochAccessTokens.clear();
    replaceTokens(tokens);
  }

  function signOut(): void {
    // Siempre se pide la revocación: el cliente no puede saber si hay cookie (es `HttpOnly`) y
    // el servidor responde 204 igualmente. Si falla, la sesión local se cierra igual.
    api.logout().catch(() => undefined);
    startEpoch(null);
  }

  /*
   * Una sola renovación en vuelo: si varias peticiones reciben 401 a la vez,
   * todas esperan la misma promesa. No es solo eficiencia: el refresh token
   * ROTA en cada renovación (dec-002), así que dos renovaciones simultáneas
   * presentarían la misma cookie y la segunda se leería como reuso, revocando
   * la familia completa y expulsando al usuario. (Entre pestañas lo cubre
   * `refreshLock`, que envuelve `api.refresh` en `SessionProvider`.)
   */
  const refreshFlight = createSingleFlight(async (): Promise<boolean> => {
    const startedIn = epoch;
    try {
      const tokens = await api.refresh();
      // Hubo logout (y quizá un login nuevo) mientras se esperaba. Aplicar estos
      // tokens resucitaría la sesión cerrada o pisaría la nueva. En el servidor
      // no quedan vivos: el logout revoca la familia aunque su token ya estuviera
      // rotado (citas-api `LogoutUseCase`).
      if (epoch !== startedIn) return false;
      checking = false;
      restoreFailure = null;
      replaceTokens(tokens);
      return true;
    } catch (cause) {
      if (epoch !== startedIn) return false;
      if (isRejection(cause)) {
        // El servidor ya invalidó (y borró) la cookie: no hay nada que revocar.
        startEpoch(null);
        return false;
      }
      throw cause;
    }
  });

  function restore(): Promise<void> {
    if (restoration !== null) return restoration;
    // Un login o logout anterior ya decidió: no hay nada que restaurar.
    if (!checking) {
      restoration = Promise.resolve();
      return restoration;
    }
    const startedIn = epoch;
    restoration = refreshFlight
      .run()
      .then(
        () => undefined,
        (cause: unknown) => {
          // Sin veredicto del servidor (red caída, 5xx) no se sabe si hay sesión: se guarda el
          // error para ofrecer reintentar, en vez de dar la sesión por inexistente. Un 401/400
          // no llega aquí: `refreshFlight` lo resuelve como `false` (sin sesión).
          if (epoch === startedIn && checking) restoreFailure = toApiError(cause);
        },
      )
      .finally(() => {
        // Si entretanto hubo un login o un logout, ya decidieron el estado.
        if (epoch === startedIn && checking) {
          checking = false;
          notify();
        }
      });
    return restoration;
  }

  function retryRestore(): Promise<void> {
    if (getStatus() !== 'unavailable') return restoration ?? Promise.resolve();
    restoreFailure = null;
    checking = true;
    restoration = null;
    notify();
    return restore();
  }

  function getStatus(): SessionStatus {
    if (accessToken !== null) return 'authenticated';
    if (checking) return 'checking';
    return restoreFailure !== null ? 'unavailable' : 'anonymous';
  }

  return {
    getAccessToken: () => accessToken,
    isAuthenticated: () => accessToken !== null,
    getStatus,
    tokenStatus(token) {
      if (token === accessToken) return 'current';
      return epochAccessTokens.has(token) ? 'renewed' : 'foreign';
    },
    signIn: (tokens) => startEpoch(tokens),
    signOut,
    expire(rejectedAccessToken) {
      if (accessToken !== null && accessToken === rejectedAccessToken) signOut();
    },
    refreshSession: () => refreshFlight.run(),
    restore,
    retryRestore,
    getRestoreFailure: () => restoreFailure,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
