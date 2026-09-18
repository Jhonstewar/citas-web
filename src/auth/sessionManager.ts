import { ApiError } from '../api/ApiError';
import type { AuthTokensResponse, RefreshRequest } from '../api/contracts';
import type { TokenStatus } from '../api/httpClient';
import { createSingleFlight } from './singleFlight';

/**
 * Estado de sesión del cliente, fuera de React para poder probarlo sin DOM.
 *
 * Los tokens se guardan EN MEMORIA, no en `localStorage`: así no persisten al
 * cerrar la pestaña. Consecuencia esperada y aceptada: recargar la página
 * cierra la sesión hasta que el backend ofrezca refresh token en cookie
 * HttpOnly.
 */

/** Llamadas al backend que necesita la sesión. Se inyectan para poder probarla. */
export interface SessionApi {
  refresh: (payload: RefreshRequest) => Promise<AuthTokensResponse>;
  logout: (payload: RefreshRequest) => Promise<void>;
}

export interface SessionManager {
  /** Access token vigente, o `null` si no hay sesión. */
  getAccessToken: () => string | null;
  /** Hay sesión abierta. Es lo único que React necesita saber: el token no sale de aquí. */
  isAuthenticated: () => boolean;
  /**
   * Relación de un access token con la sesión vigente: es el actual, uno anterior ya renovado
   * de esta misma sesión, o uno de una sesión que ya se cerró.
   */
  tokenStatus: (accessToken: string) => TokenStatus;
  /** Registra los tokens de un login: abre una sesión nueva. */
  signIn: (tokens: AuthTokensResponse) => void;
  /** Cierra la sesión local y revoca en el servidor la familia del refresh token. */
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
  /** Suscripción a cambios, con la firma que espera `useSyncExternalStore`. */
  subscribe: (listener: () => void) => () => void;
}

/** El servidor rechazó el refresh token: la sesión ya no es recuperable. */
function isRejection(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.kind === 'session' || cause.kind === 'validation');
}

export function createSessionManager(api: SessionApi): SessionManager {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  // Cambia en cada login y cada logout. Una renovación que empezó en otra época
  // ya no pertenece a la sesión actual: ni aplica sus tokens ni la cierra.
  let epoch = 0;

  // Access tokens emitidos en la época actual. Distinguen un 401 de un token ya renovado de esta
  // sesión, que basta con reintentar, del de una sesión cerrada, que no puede reintentarse con
  // la identidad de la actual.
  const epochAccessTokens = new Set<string>();

  const listeners = new Set<() => void>();

  function replaceTokens(tokens: AuthTokensResponse | null): void {
    accessToken = tokens?.accessToken ?? null;
    refreshToken = tokens?.refreshToken ?? null;
    if (accessToken !== null) epochAccessTokens.add(accessToken);
    for (const listener of listeners) listener();
  }

  /** Abre una época nueva y descarta cualquier renovación de la anterior. */
  function startEpoch(tokens: AuthTokensResponse | null): void {
    epoch += 1;
    refreshFlight.reset();
    epochAccessTokens.clear();
    replaceTokens(tokens);
  }

  function signOut(): void {
    const token = refreshToken;
    if (token !== null && token !== '') {
      // Si la revocación falla, la sesión local se cierra igual.
      api.logout({ refreshToken: token }).catch(() => undefined);
    }
    startEpoch(null);
  }

  /*
   * Una sola renovación en vuelo: si varias peticiones reciben 401 a la vez,
   * todas esperan la misma promesa. No es solo eficiencia: el refresh token
   * ROTA en cada renovación (dec-002), así que dos renovaciones simultáneas
   * presentarían el mismo token y la segunda se leería como reuso, revocando
   * la familia completa y expulsando al usuario.
   */
  const refreshFlight = createSingleFlight(async (): Promise<boolean> => {
    const startedIn = epoch;
    // Se lee DENTRO de la operación: una renovación que arranca después de otra
    // debe usar el token ya rotado.
    const token = refreshToken;
    if (token === null || token === '') return false;

    try {
      const tokens = await api.refresh({ refreshToken: token });
      // Hubo logout (y quizá un login nuevo) mientras se esperaba. Aplicar estos
      // tokens resucitaría la sesión cerrada o pisaría la nueva. En el servidor
      // no quedan vivos: el logout revoca la familia aunque su token ya estuviera
      // rotado (citas-api `LogoutUseCase`).
      if (epoch !== startedIn) return false;
      replaceTokens(tokens);
      return true;
    } catch (cause) {
      if (epoch !== startedIn) return false;
      if (isRejection(cause)) {
        // El token ya no sirve en el servidor: no hay nada que revocar.
        startEpoch(null);
        return false;
      }
      throw cause;
    }
  });

  return {
    getAccessToken: () => accessToken,
    isAuthenticated: () => accessToken !== null,
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
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
