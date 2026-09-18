import { Check } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

/* -------------------------------------------------------------------------- */
/* Checkbox                                                                   */
/* -------------------------------------------------------------------------- */

type CheckboxNative = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id' | 'className'>;

export interface CheckboxProps extends CheckboxNative {
  label: ReactNode;
  description?: ReactNode;
}

/** Casilla con etiqueta clicable y texto de apoyo opcional. */
export function Checkbox({ label, description, ...inputProps }: CheckboxProps) {
  const id = useId();
  return (
    <label className="check" htmlFor={id}>
      <input {...inputProps} id={id} type="checkbox" className="check__input" />
      <span className="check__box" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <span className="check__text">
        <span className="check__label">{label}</span>
        {description !== undefined ? <span className="check__description">{description}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Tarjetas de opción (radio)                                                 */
/* -------------------------------------------------------------------------- */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface ChoiceCardsProps<T extends string> {
  legend: string;
  name: string;
  options: readonly ChoiceOption<T>[];
  value: T | '';
  onChange: (value: T) => void;
  error?: string | undefined;
  /** Oculta visualmente la leyenda cuando la pantalla ya tiene un título equivalente. */
  hideLegend?: boolean;
  columns?: 1 | 2 | 3;
}

/**
 * Grupo de radios presentado como tarjetas grandes: fácil de tocar en móvil y navegable con las
 * flechas del teclado (comportamiento nativo del grupo de radios).
 */
export function ChoiceCards<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  hideLegend = false,
  columns = 2,
}: ChoiceCardsProps<T>) {
  const errorId = useId();
  return (
    <fieldset
      className="choice-group"
      {...(error !== undefined ? { 'aria-describedby': errorId } : {})}
    >
      <legend className={hideLegend ? 'visually-hidden' : 'field__label'}>{legend}</legend>
      <div className={`choice-group__grid choice-group__grid--${columns}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={[
              'choice',
              value === option.value ? 'choice--selected' : '',
              option.disabled === true ? 'choice--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              type="radio"
              className="choice__input"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.icon !== undefined ? (
              <span className="choice__icon" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span className="choice__text">
              <span className="choice__label">{option.label}</span>
              {option.description !== undefined ? (
                <span className="choice__description">{option.description}</span>
              ) : null}
            </span>
            <span className="choice__mark" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
          </label>
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

/* -------------------------------------------------------------------------- */
/* Control segmentado                                                         */
/* -------------------------------------------------------------------------- */

export interface SegmentedControlProps<T extends string> {
  legend: string;
  name: string;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
}

/** Elección corta entre pocas opciones excluyentes (duración 30/60, activos/inactivos). */
export function SegmentedControl<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  error,
  disabled = false,
}: SegmentedControlProps<T>) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return (
    <fieldset
      className="segmented-field"
      disabled={disabled}
      {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
    >
      <legend className="field__label">{legend}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label
            key={option.value}
            className={value === option.value ? 'segmented__item segmented__item--on' : 'segmented__item'}
          >
            <input
              type="radio"
              className="segmented__input"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
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
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Área de texto con contador                                                 */
/* -------------------------------------------------------------------------- */

type TextareaNative = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>;

export interface TextAreaFieldProps extends TextareaNative {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Muestra "n/max" y fija `maxLength`. */
  counterMax?: number;
}

export function TextAreaField({
  label,
  error,
  hint,
  counterMax,
  required,
  value,
  ...props
}: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const counterId = `${id}-counter`;
  const length = typeof value === 'string' ? value.length : 0;
  const describedBy = [
    hint !== undefined ? hintId : null,
    counterMax !== undefined ? counterId : null,
    error !== undefined ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required === true ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        {...props}
        id={id}
        value={value}
        required={required}
        maxLength={counterMax}
        className={error !== undefined ? 'field__input field__textarea field__input--error' : 'field__input field__textarea'}
        aria-invalid={error !== undefined}
        {...(describedBy !== '' ? { 'aria-describedby': describedBy } : {})}
      />
      <div className="field__meta">
        {hint !== undefined ? (
          <p className="field__hint" id={hintId}>
            {hint}
          </p>
        ) : (
          <span />
        )}
        {counterMax !== undefined ? (
          <p className="field__counter" id={counterId}>
            {length}/{counterMax}
          </p>
        ) : null}
      </div>
      {error !== undefined ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
