"use client";

import { useActionState, useState } from "react";
import { PasswordField, TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import { signupAction } from "./actions";
import { SlugField } from "./slug-check";

/** "Mama Ngozi's Kitchen" -> "mama-ngozis-kitchen" (a suggestion the seller can edit). */
function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function passwordHint(password: string): string {
  if (password.length === 0) {
    return "At least 8 characters.";
  }
  if (password.length < 8) {
    return `Too short: ${8 - password.length} more character${password.length === 7 ? "" : "s"} needed.`;
  }
  const hasMix = /[a-z]/.test(password) && /[A-Z0-9]/.test(password);
  if (password.length >= 12 && hasMix) {
    return "Strong password.";
  }
  return "Good. Longer, with a mix of letters and numbers, is stronger.";
}

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, {});
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  // Once the seller edits the link themselves, stop overwriting it from the name.
  const [slugEdited, setSlugEdited] = useState(false);
  const [password, setPassword] = useState("");

  function handleNameChange(value: string) {
    setBusinessName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error} />
      <TextField
        label="Business name"
        name="businessName"
        autoComplete="organization"
        required
        value={businessName}
        onChange={(e) => handleNameChange(e.target.value)}
        error={state.fieldErrors?.businessName}
      />
      <SlugField
        value={slug}
        onChange={(value) => {
          setSlugEdited(true);
          setSlug(value);
        }}
        error={state.fieldErrors?.slug}
      />
      <TextField
        label="WhatsApp number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="0803 123 4567"
        defaultValue={state.values?.phone}
        error={state.fieldErrors?.phone}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={passwordHint(password)}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating your shop…">Continue</SubmitButton>
    </form>
  );
}
