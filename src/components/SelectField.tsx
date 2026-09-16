import { useId, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

type NativeProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className' | 'children'>;

export interface SelectFieldProps extends NativeProps {
  label: string;
  options: readonly SelectOption[];
  placeholder?: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Selector accesible con las mismas reglas de error/ayuda que `TextField`. */
export function SelectField({
  label,
  options,
  placeholder,
  error,
  hint,
  required,
  ...selectProps
}: SelectFieldProps) {
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
      <select
        {...selectProps}
        id={id}
        required={required}
        className={error !== undefined ? 'field__input field__input--error' : 'field__input'}
        aria-invalid={error !== undefined}
        {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
