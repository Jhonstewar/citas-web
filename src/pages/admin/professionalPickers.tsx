import { MapPin, Star } from 'lucide-react';
import { useId } from 'react';
import type { Site, Specialty } from '../../api/contracts';
import { Checkbox } from '../../components/ChoiceControls';
import { Badge } from '../../components/StatusBadge';

export interface SpecialtySelection {
  specialtyIds: number[];
  primarySpecialtyId: number | null;
}

/**
 * Especialidades del profesional con una sola principal (HU-014). Al marcar la primera, queda
 * como principal; al desmarcar la principal, pasa a la siguiente marcada. Solo se ofrecen las
 * activas, más las inactivas que ya tuviera asignadas (visibles pero sin poder añadirse).
 */
export function SpecialtyPicker({
  specialties,
  value,
  onChange,
  error,
  disabled = false,
}: {
  specialties: readonly Specialty[];
  value: SpecialtySelection;
  onChange: (value: SpecialtySelection) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const groupId = useId();
  const errorId = useId();
  const visible = specialties.filter((item) => item.active || value.specialtyIds.includes(item.id));

  function toggle(id: number, checked: boolean) {
    const ids = checked ? [...value.specialtyIds, id] : value.specialtyIds.filter((item) => item !== id);
    let primary = value.primarySpecialtyId;
    if (checked && primary === null) primary = id;
    if (!checked && primary === id) primary = ids[0] ?? null;
    onChange({ specialtyIds: ids, primarySpecialtyId: primary });
  }

  return (
    <fieldset className="stack stack--sm" {...(error !== undefined ? { 'aria-describedby': errorId } : {})}>
      <legend className="field__label">Especialidades</legend>
      <p className="field__hint" id={groupId}>
        Marca una o varias y elige cuál es la principal.
      </p>
      {visible.length === 0 ? <p className="muted text-sm">No hay especialidades activas.</p> : null}
      <div className="grid grid--2">
        {visible.map((item) => {
          const checked = value.specialtyIds.includes(item.id);
          const isPrimary = value.primarySpecialtyId === item.id;
          return (
            <div key={item.id} className="stack stack--sm">
              <Checkbox
                label={item.name}
                description={
                  <span className="cluster">
                    <Badge>{item.durationMinutes} min</Badge>
                    {item.active ? null : <Badge tone="danger">Inactiva</Badge>}
                  </span>
                }
                checked={checked}
                disabled={disabled || (!item.active && !checked)}
                onChange={(event) => toggle(item.id, event.target.checked)}
              />
              {checked ? (
                <label className="primary-toggle">
                  <input
                    type="radio"
                    name={`principal-${groupId}`}
                    checked={isPrimary}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, primarySpecialtyId: item.id })}
                  />
                  {isPrimary ? <Star size={14} aria-hidden="true" /> : null}
                  Principal: {item.name}
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
      {error !== undefined ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Sedes del profesional (HU-015): una o ambas, como tarjetas con su dirección. */
export function SitePicker({
  sites,
  value,
  onChange,
  error,
  disabled = false,
}: {
  sites: readonly Site[];
  value: number[];
  onChange: (value: number[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const errorId = useId();
  return (
    <fieldset className="stack stack--sm" {...(error !== undefined ? { 'aria-describedby': errorId } : {})}>
      <legend className="field__label">Sedes</legend>
      <div className="grid grid--2">
        {sites.map((site) => (
          <Checkbox
            key={site.id}
            label={
              <span className="inline-icon">
                <MapPin size={14} aria-hidden="true" />
                {site.name}
              </span>
            }
            description={`${site.address} · ${site.city}`}
            checked={value.includes(site.id)}
            disabled={disabled}
            onChange={(event) =>
              onChange(event.target.checked ? [...value, site.id] : value.filter((id) => id !== site.id))
            }
          />
        ))}
      </div>
      {error !== undefined ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
