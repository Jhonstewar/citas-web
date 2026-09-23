import { DOCUMENT_TYPES, type DocumentTypeCode } from '../api/contracts';

/**
 * Validación de cliente para los formularios de autenticación.
 *
 * Es una ayuda de usabilidad (mensajes inmediatos y útiles), NO una regla de
 * negocio: la validación que decide es siempre la del servidor (PRD §8). Si el
 * backend rechaza algo que aquí pasó, se muestra su mensaje.
 */

export type FieldErrorMap<TField extends string> = Partial<Record<TField, string>>;

export type RegisterField =
  | 'firstNames'
  | 'lastNames'
  | 'documentType'
  | 'documentNumber'
  | 'email'
  | 'phone'
  | 'password'
  | 'passwordConfirm'
  | 'insurancePlanId';

export interface RegisterFormValues {
  firstNames: string;
  lastNames: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  /**
   * RF-01 · Plan de afiliación. OPCIONAL: la cadena vacía significa "sin afiliación" y hace que
   * la clave ni siquiera viaje en la petición. Como es opcional, no se valida en el cliente.
   */
  insurancePlanId: string;
}

export const EMPTY_REGISTER_FORM: RegisterFormValues = {
  firstNames: '',
  lastNames: '',
  documentType: '',
  documentNumber: '',
  email: '',
  phone: '',
  password: '',
  passwordConfirm: '',
  insurancePlanId: '',
};

/**
 * Longitudes máximas que acepta el backend (`RegisterRequest` de citas-api, que
 * coincide con las columnas de `users` en la migración V1). Si el cliente
 * aceptara más, el usuario solo se enteraría al recibir el 400 del servidor.
 */
export const MAX_NAMES = 100;
export const MAX_DOCUMENT_NUMBER = 20;
export const MAX_EMAIL = 160;
export const MAX_PHONE = 30;
const MIN_PASSWORD = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;
const PHONE_PATTERN = /^[+]?[0-9\s-]{7,}$/;

const DOCUMENT_TYPE_CODES: readonly string[] = DOCUMENT_TYPES.map((type) => type.code);

export function isDocumentTypeCode(value: string): value is DocumentTypeCode {
  return DOCUMENT_TYPE_CODES.includes(value);
}

function validateName(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return `Escribe tus ${label}.`;
  if (trimmed.length < 2) return `Los ${label} deben tener al menos 2 caracteres.`;
  if (trimmed.length > MAX_NAMES) return `Los ${label} no pueden superar ${MAX_NAMES} caracteres.`;
  return undefined;
}

export function validateEmailValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return 'Escribe tu correo electrónico.';
  if (trimmed.length > MAX_EMAIL) return `El correo no puede superar ${MAX_EMAIL} caracteres.`;
  if (!EMAIL_PATTERN.test(trimmed)) return 'El correo no tiene un formato válido, por ejemplo nombre@dominio.com.';
  return undefined;
}

function validatePasswordValue(value: string): string | undefined {
  if (value === '') return 'Escribe una contraseña.';
  if (value.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'La contraseña debe combinar al menos una letra y un número.';
  }
  return undefined;
}

/** RF-01 · Valida el formulario de registro completo. */
export function validateRegisterForm(
  values: RegisterFormValues,
): FieldErrorMap<RegisterField> {
  const errors: FieldErrorMap<RegisterField> = {};

  const firstNames = validateName(values.firstNames, 'nombres');
  if (firstNames !== undefined) errors.firstNames = firstNames;

  const lastNames = validateName(values.lastNames, 'apellidos');
  if (lastNames !== undefined) errors.lastNames = lastNames;

  if (values.documentType === '') {
    errors.documentType = 'Selecciona el tipo de documento.';
  } else if (!isDocumentTypeCode(values.documentType)) {
    errors.documentType = 'El tipo de documento seleccionado no es válido.';
  }

  const documentNumber = values.documentNumber.trim();
  if (documentNumber === '') {
    errors.documentNumber = 'Escribe tu número de documento.';
  } else if (!DOCUMENT_NUMBER_PATTERN.test(documentNumber)) {
    errors.documentNumber = 'El número de documento solo admite letras, números y guiones.';
  } else if (documentNumber.length > MAX_DOCUMENT_NUMBER) {
    errors.documentNumber = `El número de documento no puede superar ${MAX_DOCUMENT_NUMBER} caracteres.`;
  }

  const email = validateEmailValue(values.email);
  if (email !== undefined) errors.email = email;

  const phone = values.phone.trim();
  if (phone === '') {
    errors.phone = 'Escribe tu teléfono de contacto.';
  } else if (!PHONE_PATTERN.test(phone)) {
    errors.phone = 'El teléfono debe tener al menos 7 dígitos y admite +, espacios y guiones.';
  } else if (phone.length > MAX_PHONE) {
    errors.phone = `El teléfono no puede superar ${MAX_PHONE} caracteres.`;
  }

  const password = validatePasswordValue(values.password);
  if (password !== undefined) errors.password = password;

  if (values.passwordConfirm === '') {
    errors.passwordConfirm = 'Repite la contraseña para confirmarla.';
  } else if (values.passwordConfirm !== values.password) {
    errors.passwordConfirm = 'Las dos contraseñas no coinciden.';
  }

  return errors;
}

export type LoginField = 'email' | 'password';

export interface LoginFormValues {
  email: string;
  password: string;
}

export const EMPTY_LOGIN_FORM: LoginFormValues = { email: '', password: '' };

/**
 * RF-02 · Valida el formulario de login.
 * Aquí no se exige política de contraseña: una cuenta creada antes de un
 * cambio de política debe poder entrar. Solo se exige que el campo no vaya vacío.
 */
export function validateLoginForm(values: LoginFormValues): FieldErrorMap<LoginField> {
  const errors: FieldErrorMap<LoginField> = {};

  const email = validateEmailValue(values.email);
  if (email !== undefined) errors.email = email;

  if (values.password === '') errors.password = 'Escribe tu contraseña.';

  return errors;
}

export type RecoveryField = 'email';

export interface RecoveryFormValues {
  email: string;
}

export const EMPTY_RECOVERY_FORM: RecoveryFormValues = { email: '' };

/** RF-03 · Valida la solicitud de recuperación de contraseña. */
export function validateRecoveryForm(
  values: RecoveryFormValues,
): FieldErrorMap<RecoveryField> {
  const errors: FieldErrorMap<RecoveryField> = {};
  const email = validateEmailValue(values.email);
  if (email !== undefined) errors.email = email;
  return errors;
}

export function hasErrors<TField extends string>(errors: FieldErrorMap<TField>): boolean {
  return Object.keys(errors).length > 0;
}
