import { request } from './httpClient';
import {
  API_ROUTES,
  withQuery,
  type Block,
  type BlockRequest,
  type IsoDate,
  type Professional,
} from './contracts';

/** Agenda del PROFESSIONAL (HU-017..019). El titular sale siempre del token. */

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}

export function getMyProfile(signal?: AbortSignal): Promise<Professional> {
  return request(API_ROUTES.professional.me, withSignal(signal));
}

/** Bloques propios entre `from` y `to` (ambos incluidos; máximo 62 días). */
export function listBlocks(from: IsoDate, to: IsoDate, signal?: AbortSignal): Promise<Block[]> {
  return request(withQuery(API_ROUTES.professional.blocks, { from, to }), withSignal(signal));
}

export function createBlock(body: BlockRequest): Promise<Block> {
  return request(API_ROUTES.professional.blocks, { method: 'POST', body });
}

export function updateBlock(id: number, body: BlockRequest): Promise<Block> {
  return request(API_ROUTES.professional.block(id), { method: 'PUT', body });
}

export function deleteBlock(id: number): Promise<void> {
  return request(API_ROUTES.professional.block(id), { method: 'DELETE' });
}
