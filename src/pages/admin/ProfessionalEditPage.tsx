import { IdCard, Lock, MapPin, Power, Stethoscope } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import {
  getProfessional,
  listSpecialties,
  setProfessionalActive,
  updateProfessional,
  updateProfessionalSites,
  updateProfessionalSpecialties,
} from '../../api/adminApi';
import { getSites } from '../../api/catalogApi';
import type { Professional, Site, Specialty } from '../../api/contracts';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { SubmitButton } from '../../components/SubmitButton';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toastContext';
import { notFound } from '../../lib/notFound';
import { useResource } from '../../lib/useResource';
import { SitePicker, SpecialtyPicker, type SpecialtySelection } from './professionalPickers';

interface EditData {
  professional: Professional;
  specialties: Specialty[];
  sites: Site[];
}

/**
 * Edición de un profesional (HU-013..016) en tres secciones independientes: datos personales
 * (PUT solo `firstNames`, `lastNames`, `phone`; código y matrícula son de solo lectura,
 * INC-015), especialidades con principal y sedes; además, activar/desactivar.
 */
export function ProfessionalEditPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const data = useResource(
    (signal) =>
      // Un id no numérico no se pide al backend (evita GET /NaN).
      !Number.isInteger(id) || id <= 0
        ? Promise.reject(notFound())
        : Promise.all([getProfessional(id, signal), listSpecialties(signal), getSites(signal)]).then(
        ([professional, specialties, sites]): EditData => ({ professional, specialties, sites }),
      ),
    [id],
  );
  const [toggling, setToggling] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const back = { to: '/admin/profesionales', label: 'Profesionales' };

  if (data.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Editar profesional" back={back} />
        <LoadingSection count={3} />
      </div>
    );
  }
  if (data.state.status === 'error') {
    return (
      <div className="page">
        <PageHeader title="Editar profesional" back={back} />
        <ErrorState
          error={data.state.error}
          title={data.state.error.kind === 'not_found' ? 'No encontramos este profesional' : undefined}
          onRetry={() => data.reload()}
        />
      </div>
    );
  }

  const { professional, specialties, sites } = data.state.data;

  function applySaved(saved: Professional, message: string) {
    data.update((current) => ({ ...current, professional: saved }));
    toast.show({ title: message, description: saved.fullName });
  }

  async function confirmToggle() {
    setToggleBusy(true);
    setToggleError(null);
    try {
      const saved = await setProfessionalActive(professional.id, !professional.active);
      applySaved(saved, saved.active ? 'Profesional activado' : 'Profesional desactivado');
      setToggling(false);
    } catch (cause) {
      setToggleError(toApiError(cause).message);
    } finally {
      setToggleBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        back={back}
        eyebrow="Administración"
        title={professional.fullName}
        description={
          <span className="cluster">
            {professional.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
            <span>{professional.email}</span>
          </span>
        }
        actions={
          <button
            type="button"
            className={professional.active ? 'button button--danger-outline' : 'button button--primary'}
            onClick={() => {
              setToggleError(null);
              setToggling(true);
            }}
          >
            <Power size={16} aria-hidden="true" />
            {professional.active ? 'Desactivar' : 'Activar'}
          </button>
        }
      />

      <PersonalSection key={`datos-${professional.id}`} professional={professional} onSaved={(saved) => applySaved(saved, 'Datos actualizados')} />
      <SpecialtiesSection
        key={`esp-${professional.id}`}
        professional={professional}
        specialties={specialties}
        onSaved={(saved) => applySaved(saved, 'Especialidades actualizadas')}
      />
      <SitesSection
        key={`sedes-${professional.id}`}
        professional={professional}
        sites={sites}
        onSaved={(saved) => applySaved(saved, 'Sedes actualizadas')}
      />

      <ConfirmDialog
        open={toggling}
        title={professional.active ? '¿Desactivar a este profesional?' : '¿Activar a este profesional?'}
        confirmLabel={professional.active ? 'Desactivar' : 'Activar'}
        tone={professional.active ? 'danger' : 'primary'}
        busy={toggleBusy}
        error={toggleError}
        onCancel={() => setToggling(false)}
        onConfirm={() => void confirmToggle()}
      >
        <p>
          {professional.active
            ? 'Dejará de ofrecerse en las búsquedas y no recibirá citas nuevas. Sus citas existentes se conservan.'
            : 'Volverá a ofrecerse en las búsquedas.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** Guardado de una sección: petición, error y estado ocupado. */
function useSectionSave(onSaved: (saved: Professional) => void) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);

  async function run(request: () => Promise<Professional>) {
    setSaving(true);
    setFailure(null);
    try {
      onSaved(await request());
    } catch (cause) {
      setFailure(toApiError(cause));
    } finally {
      setSaving(false);
    }
  }

  return { saving, failure, run };
}

function SectionActions({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="form-actions">
      <SubmitButton loading={saving} keepLabel>
        {label}
      </SubmitButton>
    </div>
  );
}

function ReadOnly({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details__item">
      <Lock size={16} className="details__icon" aria-hidden="true" />
      <div>
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

function PersonalSection({
  professional,
  onSaved,
}: {
  professional: Professional;
  onSaved: (saved: Professional) => void;
}) {
  const [firstNames, setFirstNames] = useState(professional.firstNames);
  const [lastNames, setLastNames] = useState(professional.lastNames);
  const [phone, setPhone] = useState(professional.phone ?? '');
  const { saving, failure, run } = useSectionSave(onSaved);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    void run(() =>
      updateProfessional(professional.id, {
        firstNames: firstNames.trim(),
        lastNames: lastNames.trim(),
        phone: phone.trim(),
      }),
    );
  }

  const fieldErrors = failure?.fieldErrors ?? {};

  return (
    <Card title="Datos personales" icon={<IdCard size={20} />}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure.message} /> : null}
        <div className="form__grid">
          <TextField
            label="Nombres"
            required
            maxLength={100}
            value={firstNames}
            error={fieldErrors.firstNames}
            disabled={saving}
            onChange={(event) => setFirstNames(event.target.value)}
          />
          <TextField
            label="Apellidos"
            required
            maxLength={100}
            value={lastNames}
            error={fieldErrors.lastNames}
            disabled={saving}
            onChange={(event) => setLastNames(event.target.value)}
          />
          <TextField
            label="Teléfono"
            type="tel"
            required
            maxLength={30}
            value={phone}
            error={fieldErrors.phone}
            disabled={saving}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <dl className="details details--2" aria-label="Datos que no se editan tras el alta">
          <ReadOnly label="Documento">
            {professional.documentType} {professional.documentNumber}
          </ReadOnly>
          <ReadOnly label="Correo">{professional.email}</ReadOnly>
          <ReadOnly label="Código profesional">{professional.professionalCode}</ReadOnly>
          <ReadOnly label="Matrícula">{professional.licenseNumber}</ReadOnly>
        </dl>
        <p className="field__hint">
          El documento, el correo, el código profesional y la matrícula no se editan después del alta.
        </p>
        <SectionActions saving={saving} label="Guardar datos" />
      </form>
    </Card>
  );
}

function SpecialtiesSection({
  professional,
  specialties,
  onSaved,
}: {
  professional: Professional;
  specialties: Specialty[];
  onSaved: (saved: Professional) => void;
}) {
  const [selection, setSelection] = useState<SpecialtySelection>({
    specialtyIds: professional.specialties.map((item) => item.id),
    primarySpecialtyId: professional.specialties.find((item) => item.primary)?.id ?? null,
  });
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const { saving, failure, run } = useSectionSave(onSaved);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (selection.specialtyIds.length === 0 || selection.primarySpecialtyId === null) {
      setLocalError('Asigna al menos una especialidad y elige la principal.');
      return;
    }
    const primarySpecialtyId = selection.primarySpecialtyId;
    void run(() =>
      updateProfessionalSpecialties(professional.id, { specialtyIds: selection.specialtyIds, primarySpecialtyId }),
    );
  }

  return (
    <Card title="Especialidades" icon={<Stethoscope size={20} />}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure.message} /> : null}
        <SpecialtyPicker
          specialties={specialties}
          value={selection}
          onChange={(next) => {
            setSelection(next);
            setLocalError(undefined);
          }}
          error={localError}
          disabled={saving}
        />
        <SectionActions saving={saving} label="Guardar especialidades" />
      </form>
    </Card>
  );
}

function SitesSection({
  professional,
  sites,
  onSaved,
}: {
  professional: Professional;
  sites: Site[];
  onSaved: (saved: Professional) => void;
}) {
  const [siteIds, setSiteIds] = useState<number[]>(professional.sites.map((site) => site.id));
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const { saving, failure, run } = useSectionSave(onSaved);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (siteIds.length === 0) {
      setLocalError('Asigna al menos una sede.');
      return;
    }
    void run(() => updateProfessionalSites(professional.id, { siteIds }));
  }

  return (
    <Card title="Sedes" icon={<MapPin size={20} />}>
      <form className="form" onSubmit={handleSubmit} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure.message} /> : null}
        <SitePicker
          sites={sites}
          value={siteIds}
          onChange={(next) => {
            setSiteIds(next);
            setLocalError(undefined);
          }}
          error={localError}
          disabled={saving}
        />
        <SectionActions saving={saving} label="Guardar sedes" />
      </form>
    </Card>
  );
}
