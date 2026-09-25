import type { InsurancePlan } from '../api/contracts';

/**
 * Etiqueta de un plan de afiliación con la EPS, el plan y el régimen: dos planes distintos pueden
 * llamarse igual en EPS diferentes, así que el nombre del plan por sí solo no los distingue.
 * La comparten el registro (HU-009, primer corte) y el perfil (segundo corte).
 */
export function planLabel(plan: InsurancePlan): string {
  return `${plan.eps.name} · ${plan.name} · ${plan.regime.name}`;
}
