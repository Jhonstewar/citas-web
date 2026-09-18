import { ApiError } from '../api/ApiError';

/** Error local para rutas con un id inválido: se presenta igual que un 404 del backend. */
export function notFound(): ApiError {
  return new ApiError('not_found', 404, 'El recurso que buscas no existe.');
}
