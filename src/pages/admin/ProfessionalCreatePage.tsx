import { BadgeCheck, IdCard, KeyRound, MapPin, Stethoscope } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import { createProfessional, listSpecialties } from '../../api/adminApi';
import { getDocumentTypes, getSites } from '../../api/catalogApi';
import { ERROR_CODES } from '../../api/contracts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { LoadingSection } from '../../components/Skeleton';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toastContext';
import { useResource } from '../../lib/useResource';
import { validateEmailValue } from '../../validation/authValidation';
import { SitePicker, SpecialtyPicker, type SpecialtySelection } from './professionalPickers';

type TextFieldKey =
  | 'firstNames'
  | 'lastNames'
  | 'documentType'
  | 'documentNumber'
  | 'email'
  | 'phone'
  | 'password'
  | 'professionalCode'
  | 'licenseNumber';

type Field = TextFieldKey | 'specialtyIds' | 'primarySpecialtyId' | 'siteIds';
type Errors = Partial<Record<Field, string | undefined>>;

const EMPTY: Record<TextFieldKey, string> = {
  firstNames: '',
  lastNames: '',
  documentType: '',
  documentNumber: '',
  email: '',
  phone: '',
  password: '',
  professionalCode: '',
  licenseNumber: '',
};

function loadData(signal: AbortSignal) {
  return Promise.all([getDocumentTypes(signal), listSpecialties(signal), getSites(signal)]).then(
    ([documentTypes, specialties, sites]) => ({ documentTypes, specialties, sites }),
  );
}

/**
 * Alta de profesional (HU-013..015) en secciones. El alta es atómica en el backend (usuario
 * PROFESSIONAL + perfil + especialidades + sedes). La contraseña inicial la fija el ADMIN (D6).
 * Un 409 DUPLICATE marca el campo que indica `field`.
 */
export function ProfessionalCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const data = useResource(loadData, []);
  const [values, setValues] = useState(EMPTY);
  const [selection, setSelection] = useState<SpecialtySelection>({ specialtyIds: [], primarySpecialtyId: null });
  const [siteIds, setSiteIds] = useState<number[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  function update(field: TextFieldKey, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function validate(): Errors {
    const next: Errors = {};
    const required: [TextFieldKey, string][] = [
      ['firstNames', 'Escribe los nombres.'],
      ['lastNames', 'Escribe los apellidos.'],
      ['documentType', 'Selecciona el tipo de documento.'],
      ['documentNumber', 'Escribe el número de documento.'],
      ['phone', 'Escribe el teléfono.'],
      ['password', 'Define una contraseña inicial.'],
      ['professionalCode', 'Escribe el código profesional.'],
      ['licenseNumber', 'Escribe la matrícula.'],
    ];
    for (const [field, message] of required) {
      if (values[field].trim() === '') next[field] = message;
    }
    const email = validateEmailValue(values.email);
    if (email !== undefined) next.email = email;
    if (selection.specialtyIds.length === 0) next.specialtyIds = 'Asigna al menos una especialidad.';
    else if (selection.primarySpecialtyId === null) next.specialtyIds = 'Elige la especialidad principal.';
    if (siteIds.length === 0) next.siteIds = 'Asigna al menos una sede.';
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const local = validate();
    setErrors(local);
    if (Object.values(local).some((value) => value !== undefined)) {
      setFailure(null);
      return;
    }

    setSaving(true);
    setFailure(null);
    try {
      const created = await createProfessional({
        firstNames: values.firstNames.trim(),
        lastNames: values.lastNames.trim(),
        documentType: values.documentType,
        documentNumber: values.documentNumber.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
        professionalCode: values.professionalCode.trim(),
        licenseNumber: values.licenseNumber.trim(),
        specialtyIds: selection.specialtyIds,
        primarySpecialtyId: selection.primarySpecialtyId as number,
        siteIds,
      });
      toast.show({ title: 'Profesional creado', description: `${created.fullName} ya puede iniciar sesión.` });
      void navigate('/admin/profesionales');
    } catch (cause) {
      const error = toApiError(cause);
      setFailure(error);
      const next: Errors = {};
      for (const [field, message] of Object.entries(error.fieldErrors)) next[field as Field] = message;
      if (error.code === ERROR_CODES.duplicate && error.field !== undefined) {
        next[error.field as Field] = error.message;
      }
      if (error.code === ERROR_CODES.specialtyInactive) next.specialtyIds = error.message;
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  const back = { to: '/admin/profesionales', label: 'Profesionales' };

  if (data.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Nuevo profesional" back={back} />
        <LoadingSection count={3} />
      </div>
    );
  }
  if (data.state.status === 'error') {
    return (
      <div className="page">
        <PageHeader title="Nuevo profesional" back={back} />
        <ErrorState error={data.state.error} onRetry={() => data.reload()} />
      </div>
    );
  }

  const { documentTypes, specialties, sites } = data.state.data;
  const text = (field: TextFieldKey) => ({
    value: values[field],
    error: errors[field],
    disabled: saving,
    onChange: (event: { target: { value: string } }) => update(field, event.target.value),
  });

  return (
    <div className="page">
      <PageHeader
        back={back}
        eyebrow="Administración"
        title="Nuevo profesional"
        description="Crea la cuenta con rol Profesional y su perfil. Los campos con * son obligatorios."
      />

      <form className="stack stack--lg" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? (
          <FormAlert tone="error" title={failure.message}>
            {failure.kind === 'validation' || failure.kind === 'conflict' ? (
              <p>Corrige los campos señalados y vuelve a intentarlo.</p>
            ) : null}
          </FormAlert>
        ) : null}

        <Card title="1. Datos personales" icon={<IdCard size={20} />}>
          <div className="form__grid">
            <TextField label="Nombres" required maxLength={100} autoComplete="off" {...text('firstNames')} />
            <TextField label="Apellidos" required maxLength={100} autoComplete="off" {...text('lastNames')} />
            <SelectField
              label="Tipo de documento"
              required
              placeholder="Selecciona…"
              options={documentTypes.map((item) => ({ value: item.code, label: `${item.name} (${item.code})` }))}
              {...text('documentType')}
            />
            <TextField label="Número de documento" required maxLength={20} {...text('documentNumber')} />
            <TextField label="Correo electrónico" type="email" required maxLength={160} {...text('email')} />
            <TextField label="Teléfono" type="tel" required maxLength={30} {...text('phone')} />
          </div>
        </Card>

        <Card title="2. Credencial inicial" icon={<KeyRound size={20} />}>
          <TextField
            label="Contraseña inicial"
            type="password"
            required
            autoComplete="new-password"
            hint="Compártela con el profesional por un canal seguro. No se vuelve a mostrar."
            {...text('password')}
          />
        </Card>

        <Card title="3. Datos profesionales" icon={<BadgeCheck size={20} />}>
          <div className="form__grid">
            <TextField
              label="Código profesional"
              required
              maxLength={40}
              hint="No se podrá cambiar después del alta."
              {...text('professionalCode')}
            />
            <TextField
              label="Matrícula"
              required
              maxLength={40}
              hint="Ficticia. No se podrá cambiar después del alta."
              {...text('licenseNumber')}
            />
          </div>
        </Card>

        <Card title="4. Especialidades" icon={<Stethoscope size={20} />}>
          <SpecialtyPicker
            specialties={specialties}
            value={selection}
            onChange={(next) => {
              setSelection(next);
              setErrors((previous) => ({ ...previous, specialtyIds: undefined, primarySpecialtyId: undefined }));
            }}
            error={errors.specialtyIds ?? errors.primarySpecialtyId}
            disabled={saving}
          />
        </Card>

        <Card title="5. Sedes" icon={<MapPin size={20} />}>
          <SitePicker
            sites={sites}
            value={siteIds}
            onChange={(next) => {
              setSiteIds(next);
              setErrors((previous) => ({ ...previous, siteIds: undefined }));
            }}
            error={errors.siteIds}
            disabled={saving}
          />
        </Card>

        <div className="sticky-actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void navigate('/admin/profesionales')}
            disabled={saving}
          >
            Cancelar
          </button>
          <button type="submit" className="button button--primary" disabled={saving} aria-busy={saving}>
            {saving ? <span className="button__spinner" aria-hidden="true" /> : null}
            Crear profesional
          </button>
        </div>
      </form>
    </div>
  );
}
