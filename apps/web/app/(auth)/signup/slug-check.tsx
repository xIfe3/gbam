"use client";

import { useEffect, useState } from "react";
import { TextField } from "@/components/brand/fields";
import { checkSlugAction, type SlugCheck } from "./actions";
import { SITE_HOST } from "@/lib/site";

const DEBOUNCE_MS = 400;

type SlugFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** How to check a link (signup's public check unless given, e.g. Settings' own). */
  check?: (slug: string) => Promise<SlugCheck>;
  // A message from the server after submit (e.g. "That store link is taken").
  error?: string;
};

const MESSAGES: Record<SlugCheck["status"], string> = {
  available: "Available",
  taken: "That link is taken. Try another.",
  reserved: "That name is reserved. Try another.",
  invalid: "Use 3 to 40 lowercase letters, numbers and hyphens.",
  error: "",
};

// The shop-link input with a live availability check. It waits 400ms after the last
// keystroke, then asks the server (the browser never calls the API itself).
export function SlugField({ value, onChange, error, check = checkSlugAction }: SlugFieldProps) {
  // The answer remembers which link it is for, so a stale answer is never shown for new text.
  const [checked, setChecked] = useState<{ slug: string; status: SlugCheck["status"] } | null>(
    null,
  );

  useEffect(() => {
    if (value.length === 0) {
      return;
    }
    // Set when the text changes again (or the field goes away): a late answer is dropped.
    let cancelled = false;
    const timer = setTimeout(async () => {
      const answer = await check(value);
      if (!cancelled) {
        setChecked({ slug: value, status: answer.status });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, check]);

  // The line's colour: green = free, red = can't use it, grey = still checking (or the
  // check itself failed). Colour alone isn't enough for everyone, so ✓ / ✗ go with it.
  let message = "Checking…";
  let tone: "good" | "bad" | "neutral" = "neutral";
  if (checked !== null && checked.slug === value) {
    message = MESSAGES[checked.status];
    if (checked.status === "available") {
      tone = "good";
    } else if (checked.status !== "error") {
      tone = "bad";
    }
  }
  let colour = "text-ink-muted";
  if (tone === "good") {
    colour = "text-brand-hover";
  } else if (tone === "bad") {
    colour = "text-coral-deep";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label="Your shop link"
        name="slug"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        hint={`${SITE_HOST}/your-link is what customers will visit.`}
        error={error}
      />
      {/* Always rendered so screen readers hear changes (role=status is polite). */}
      <p role="status" className={`text-sm font-medium ${colour}`}>
        {value.length > 0 && !error && (
          <>
            {tone === "good" && <span aria-hidden="true">✓ </span>}
            {tone === "bad" && <span aria-hidden="true">✗ </span>}
            {SITE_HOST}/{value}
            {message && ` · ${message}`}
          </>
        )}
      </p>
    </div>
  );
}
