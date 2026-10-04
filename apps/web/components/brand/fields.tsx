"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";

type FieldProps = {
  label: string;
  // Shown under the field and announced to screen readers (role="alert").
  error?: string;
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id">;

const inputClasses =
  "min-h-11 w-full rounded-xl border-2 border-brand-tint bg-white px-4 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[invalid=true]:border-coral-deep";

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-ink-muted text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-coral-deep text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) {
    return `${id}-error`;
  }
  if (hint) {
    return `${id}-hint`;
  }
  return undefined;
}

export function TextField({ label, error, hint, ...rest }: FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        {...rest}
        id={id}
        className={inputClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
      />
    </FieldShell>
  );
}

export function PasswordField({ label, error, hint, ...rest }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  let inputType = "password";
  if (visible) {
    inputType = "text";
  }

  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <input
          {...rest}
          id={id}
          type={inputType}
          className={`${inputClasses} pr-12`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="text-ink-muted focus-visible:outline-brand absolute top-0 right-0 flex h-full w-11 items-center justify-center rounded-xl focus-visible:outline-2"
        >
          {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}

type CodeInputProps = {
  label: string;
  length?: number;
  error?: string;
  // Called on every change with the digits typed so far.
  onChange?: (code: string) => void;
  name?: string;
};

// A one-time-code entry: one box per digit. Typing moves forward, Backspace moves back,
// and pasting a full code fills every box. A hidden input carries the joined value for forms.
export function CodeInput({ label, length = 6, error, onChange, name = "code" }: CodeInputProps) {
  const id = useId();
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function update(next: string[]) {
    setDigits(next);
    if (onChange) {
      onChange(next.join(""));
    }
  }

  function handleChange(index: number, value: string) {
    // One-time-code autofill (e.g. from an SMS or email) types the WHOLE code into the first
    // box in a single change event, not a paste. Treat that like a paste.
    if (value.replace(/\D/g, "").length >= length) {
      handlePaste(value);
      return;
    }
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    update(next);
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(text: string) {
    const pasted = text.replace(/\D/g, "").slice(0, length);
    const next = Array(length).fill("");
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    update(next);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  const boxes = [];
  for (let i = 0; i < length; i++) {
    boxes.push(
      <input
        key={i}
        ref={(el) => {
          refs.current[i] = el;
        }}
        value={digits[i]}
        onChange={(e) => handleChange(i, e.target.value)}
        onKeyDown={(e) => handleKeyDown(i, e.key)}
        onPaste={(e) => {
          e.preventDefault();
          handlePaste(e.clipboardData.getData("text"));
        }}
        inputMode="numeric"
        autoComplete={i === 0 ? "one-time-code" : "off"}
        // Select the old digit on focus so typing replaces it. No maxLength: handleChange
        // keeps only the last character typed, which also covers overwriting without selection.
        onFocus={(e) => e.target.select()}
        aria-label={`${label} digit ${i + 1}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="text-ink focus-visible:outline-brand aria-[invalid=true]:border-coral-deep h-12 min-w-0 max-w-11 flex-1 rounded-xl border-2 border-brand-tint bg-white text-center text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      />,
    );
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-ink text-sm font-bold">
        {label}
      </span>
      <div className="flex gap-1.5">{boxes}</div>
      <input type="hidden" name={name} value={digits.join("")} />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-coral-deep text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
