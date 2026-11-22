import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 hover:border-line-hover focus:border-accent focus:ring-3 focus:ring-ring/40 disabled:opacity-50 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-20 resize-y py-2 leading-5", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, "h-9 appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle" />
    </div>
  );
});

/** Label + control + hint/error wiring with correct aria attributes. */
export function Field({ label, hint, error, children, optional }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-sm font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-subtle">необов'язково</span>}
      </label>
      {children(id, descId)}
      {(error || hint) && (
        <p id={descId} className={cn("text-xs", error ? "text-danger" : "text-subtle")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/** Segmented control for small exclusive choices. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-[5px] px-2.5 text-sm transition-[background-color,color,box-shadow] duration-150 disabled:opacity-40",
            value === o.value ? "bg-surface text-fg shadow-[var(--shadow-float)]" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
