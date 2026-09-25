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
/** Política D29: mínimo de caracteres de una contraseña nueva. */
export const MIN_PASSWORD = 8;
/** Política D29: tope de BCrypt, en bytes UTF-8. */
export const MAX_PASSWORD_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;
const PHONE_PATTERN = /^[+]?[0-9\s-]{7,}$/;
/** Política D29: cualquier letra Unicode (`\p{L}`, requiere la bandera `u`). */
const LETTER_PATTERN = /\p{L}/u;

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

/** Bytes UTF-8 de un texto: el límite de BCrypt se mide en bytes, no en caracteres. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Política de contraseña D29 (INC-001), la misma que aplica el servidor al FIJAR una contraseña
 * (registro, restablecimiento y alta de profesional): mínimo 8 caracteres, al menos una letra y
 * un dígito, y máximo 72 bytes UTF-8. El login no la aplica: las cuentas anteriores siguen
 * entrando. Es ayuda al usuario; si el servidor rechaza, manda su `fieldErrors`.
 */
export function validatePasswordPolicy(value: string): string | undefined {
  if (value === '') return 'Escribe una contraseña.';
  if (value.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  // "Letra" es cualquier letra Unicode: la ñ y las vocales con tilde cuentan, igual que en el
  // servidor (aclaración D29 de contrato-rest-identidad §S4).
  if (!LETTER_PATTERN.test(value) || !/[0-9]/.test(value)) {
    return 'La contraseña debe combinar al menos una letra y un número.';
  }
  if (utf8ByteLength(value) > MAX_PASSWORD_BYTES) {
    return `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes (la ñ y las vocales con tilde ocupan 2; los emojis, 4).`;
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

  const password = validatePasswordPolicy(values.password);
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

export type ResetPasswordField = 'newPassword' | 'passwordConfirm'; // secret-scan:allow nombres de campo del formulario, no credenciales

export interface ResetPasswordFormValues {
  newPassword: string;
  passwordConfirm: string;
}

export const EMPTY_RESET_PASSWORD_FORM: ResetPasswordFormValues = {
  newPassword: '',
  passwordConfirm: '',
};

/** RF-03 · HU-007 · Valida la contraseña nueva (política D29) y su confirmación. */
export function validateResetPasswordForm(
  values: ResetPasswordFormValues,
): FieldErrorMap<ResetPasswordField> {
  const errors: FieldErrorMap<ResetPasswordField> = {};
  const newPassword = validatePasswordPolicy(values.newPassword);
  if (newPassword !== undefined) errors.newPassword = newPassword;
  if (values.passwordConfirm === '') {
    errors.passwordConfirm = 'Repite la contraseña para confirmarla.';
  } else if (values.passwordConfirm !== values.newPassword) {
    errors.passwordConfirm = 'Las dos contraseñas no coinciden.';
  }
  return errors;
}

export type ProfileField = 'firstNames' | 'lastNames' | 'phone';

export interface ProfileFormValues {
  firstNames: string;
  lastNames: string;
  phone: string;
}

function validatePhone(value: string): string | undefined {
  const phone = value.trim();
  if (phone === '') return 'Escribe tu teléfono de contacto.';
  if (!PHONE_PATTERN.test(phone)) {
    return 'El teléfono debe tener al menos 7 dígitos y admite +, espacios y guiones.';
  }
  if (phone.length > MAX_PHONE) return `El teléfono no puede superar ${MAX_PHONE} caracteres.`;
  return undefined;
}

/** HU-008 · Valida los campos editables del perfil (D25), con las mismas reglas del registro. */
export function validateProfileForm(values: ProfileFormValues): FieldErrorMap<ProfileField> {
  const errors: FieldErrorMap<ProfileField> = {};
  const firstNames = validateName(values.firstNames, 'nombres');
  if (firstNames !== undefined) errors.firstNames = firstNames;
  const lastNames = validateName(values.lastNames, 'apellidos');
  if (lastNames !== undefined) errors.lastNames = lastNames;
  const phone = validatePhone(values.phone);
  if (phone !== undefined) errors.phone = phone;
  return errors;
}

export function hasErrors<TField extends string>(errors: FieldErrorMap<TField>): boolean {
  return Object.keys(errors).length > 0;
}
