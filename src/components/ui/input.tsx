import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Form controls.
 *
 * Each control owns its own label, hint and error wiring so accessibility is
 * not something a caller can forget: `id`, `aria-describedby` and
 * `aria-invalid` are all derived from a generated id.
 */

const CONTROL_BASE =
  "w-full bg-surface text-ink placeholder:text-ink-faint " +
  "border border-border-strong rounded-md " +
  "transition-colors duration-fast ease-standard " +
  "hover:border-ink-faint " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
  "disabled:opacity-50 disabled:bg-surface-sunken disabled:cursor-not-allowed";

const CONTROL_INVALID =
  "border-negative focus:border-negative focus:ring-negative/20";

type FieldShellProps = {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

function FieldShell({ id, label, hint, error, required, children, className }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={id}
          className="flex items-baseline gap-1 text-xs font-medium text-ink-muted"
        >
          {label}
          {required && (
            // `aria-hidden` keeps the marker out of the accessible name: a
            // screen reader announcing "Email star" instead of "Email" is a
            // defect, and the input already carries `required` for assistive
            // technology to detect.
            <span className="text-negative" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerClassName?: string;
  inputClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    prefix,
    suffix,
    containerClassName,
    inputClassName,
    id: providedId,
    required,
    ...rest
  },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 text-sm text-ink-subtle">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            CONTROL_BASE,
            "h-9 px-3 text-sm",
            prefix && "pl-9",
            suffix && "pr-9",
            error && CONTROL_INVALID,
            // Numeric inputs get tabular figures so digits line up.
            rest.inputMode === "numeric" || rest.inputMode === "decimal" ? "tabular" : null,
            inputClassName,
          )}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 text-sm text-ink-subtle">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
});

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
  textareaClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, containerClassName, textareaClassName, id: providedId, required, rows = 5, ...rest },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(
          CONTROL_BASE,
          "resize-y px-3 py-2 text-sm leading-relaxed",
          error && CONTROL_INVALID,
          textareaClassName,
        )}
        {...rest}
      />
    </FieldShell>
  );
});

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
  selectClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, containerClassName, selectClassName, id: providedId, required, children, ...rest },
  ref,
) {
  const generated = useId();
  const id = providedId ?? generated;

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(
          CONTROL_BASE,
          "h-9 cursor-pointer appearance-none bg-[length:14px] bg-[right_0.65rem_center] bg-no-repeat px-3 pr-8 text-sm",
          error && CONTROL_INVALID,
          selectClassName,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%237d7a74' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M4 6.5 8 10.5 12 6.5'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});

/** Label + control wrapper for non-input controls (checkbox groups, radios). */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {children}
    </FieldShell>
  );
}
