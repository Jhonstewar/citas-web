import { useId, type InputHTMLAttributes } from 'react';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>;

export interface TextFieldProps extends NativeProps {
  label: string;
  /** Mensaje de error del campo. Si existe, el campo se marca como inválido. */
  error?: string | undefined;
  /** Texto de ayuda permanente (formato esperado, requisitos). */
  hint?: string | undefined;
}

/**
 * Campo de texto accesible: label asociado, `aria-invalid`, `aria-describedby`
 * apuntando a la ayuda y al error, y estado de error comunicado por texto
 * además de por color.
 */
export function TextField({ label, error, hint, required, ...inputProps }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required === true ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...inputProps}
        id={id}
        required={required}
        className={error !== undefined ? 'field__input field__input--error' : 'field__input'}
        aria-invalid={error !== undefined}
        {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
      />
      {hint !== undefined ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error !== undefined ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
