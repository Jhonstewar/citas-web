import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { App } from '../App';
import type { AuthTokensResponse, Role } from '../api/contracts';

/**
 * Backend simulado para las pruebas de pantallas de S3: se sustituye `fetch` y cada ruta
 * responde según un guion. Una petición fuera del guion falla como error de red, y queda
 * registrada para poder afirmarlo.
 */

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | undefined;
  body: unknown;
}

export type Reply = Response | ((call: Call) => Response | Promise<Response>);

/**
 * Guion por ruta (`'GET /api/me'`). Una lista se consume en orden (la última respuesta se repite
 * si se agota); una función responde siempre.
 */
export type Script = Record<string, Reply | Reply[]>;

export function json(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function problem(
  status: number,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ title: 'Error', status, detail, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function tokens(n: number): AuthTokensResponse {
  return {
    accessToken: `access-${n}`,
    refreshToken: `refresh-${n}`,
    tokenType: 'Bearer',
    expiresIn: 900,
  };
}

export function userWith(role: Role, overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firstNames: role === 'USER' ? 'Laura' : role === 'PROFESSIONAL' ? 'Andrés' : 'Marta',
    lastNames: role === 'USER' ? 'Gómez' : role === 'PROFESSIONAL' ? 'Rincón' : 'Ruiz',
    documentType: 'CC',
    documentNumber: '1001',
    email: 'persona@fcv.test',
    phone: '3001234567',
    roles: [role],
    ...overrides,
  };
}

export function installBackend(script: Script): Call[] {
  const calls: Call[] = [];
  const queues = new Map<string, Reply[]>();
  for (const [key, value] of Object.entries(script)) {
    queues.set(key, Array.isArray(value) ? [...value] : [value]);
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call: Call = {
        method,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        authorization: headers.Authorization,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      };
      calls.push(call);
      const queue = queues.get(`${method} ${parsed.pathname}`);
      if (queue === undefined || queue.length === 0) {
        throw new Error(`Petición fuera del guion: ${method} ${parsed.pathname}`);
      }
      if (queue.length > 1) {
        const next = queue.shift() as Reply;
        return typeof next === 'function' ? next(call) : next;
      }
      // La última respuesta se repite: un Response solo se lee una vez, así que se clona.
      const last = queue[0] as Reply;
      return typeof last === 'function' ? last(call) : last.clone();
    }),
  );
  return calls;
}

/** Lleva la aplicación a `path` como si el usuario escribiera la URL. */
export function goTo(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

/**
 * Inicia sesión por el formulario real y espera a que el marco muestre al usuario.
 * El guion debe incluir `POST /api/auth/login` y `GET /api/me`.
 */
export async function renderLoggedIn(fullName: string, path?: string) {
  window.history.replaceState(null, '', '/login');
  const view = render(<App />);
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
    target: { value: 'persona@fcv.test' },
  });
  fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: 'Clave-Secreta#2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByText(fullName);
  // Espera a que "/" termine de redirigir al inicio del rol; si no, esa redirección podría
  // llegar después de `goTo` y pisar la ruta pedida.
  await waitFor(() => {
    expect(['/', '/login']).not.toContain(window.location.pathname);
  });
  if (path !== undefined) goTo(path);
  return view;
}

/** Guion base de sesión para un rol. */
export function sessionScript(role: Role, overrides: Record<string, unknown> = {}): Script {
  return {
    'POST /api/auth/login': json(200, tokens(1)),
    'GET /api/me': json(200, userWith(role, overrides)),
    'POST /api/auth/logout': noContent(),
  };
}
