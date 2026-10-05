"use client";

import { useState } from "react";
import { Button } from "@/components/brand/button";
import { FormError } from "@/components/brand/form-bits";
import { createProductAction } from "../actions";
import { DetailsSection, OptionsSection, UnclaimedErrors, useEditorState } from "./editor-sections";
import { emptyState, toProductInput } from "./editor-state";
import { VariantCards } from "./variant-cards";

type Step = 1 | 2 | 3;

const TITLES: Record<Step, string> = {
  1: "Photos and details",
  2: "Options",
  3: "Prices and stock",
};

/** Which step an error key belongs to, so a failed save can jump there. */
function stepForKey(key: string, hasOptions: boolean): Step {
  if (key === "name" || key === "images") {
    return 1;
  }
  // "combinations" = too many option combinations, fixed by removing option values.
  if (key.startsWith("options") || key === "combinations") {
    return 2;
  }
  // Prices and stock are on step 3 with options, and on step 2 without.
  if (hasOptions) {
    return 3;
  }
  return 2;
}

/** Add product: 1) photos and name, 2) options, 3) price and stock for each variant. */
export function NewProductSteps() {
  const editor = useEditorState(emptyState());
  const { state } = editor;
  const [step, setStep] = useState<Step>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  /** Shows the errors and jumps to the earliest step that has one. */
  function showErrors(found: Record<string, string>) {
    setErrors(found);
    let target: Step = 3;
    for (const key of Object.keys(found)) {
      const candidate = stepForKey(key, state.hasOptions);
      if (candidate < target) {
        target = candidate;
      }
    }
    setStep(target);
  }

  /** Builds the product and returns the errors found on `forStep` and the steps before it. */
  function errorsForStep(forStep: Step): Record<string, string> {
    const built = toProductInput(state);
    if (built.ok) {
      return {};
    }
    const found: Record<string, string> = {};
    for (const [key, message] of Object.entries(built.errors)) {
      const belongsTo = stepForKey(key, state.hasOptions);
      // Step 2 (with options) also needs the values, which step 3's cards are built from.
      if (belongsTo <= forStep) {
        found[key] = message;
      }
    }
    return found;
  }

  function goNext() {
    // Only judge the steps up to this one; later steps are not filled in yet.
    const found = errorsForStep(step);
    // Without options, "variants.*" belongs to step 2, so it is judged at step 2 too.
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  function goBack() {
    setErrors({});
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  }

  async function save() {
    setFormError(undefined);
    const built = toProductInput(state);
    if (!built.ok) {
      showErrors(built.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // On success the action redirects to the list, so we only get here on a failure.
      const result = await createProductAction(built.input);
      if (result.fieldErrors) {
        showErrors(result.fieldErrors);
      }
      if (result.error) {
        setFormError(result.error);
      }
    } catch {
      setFormError("Couldn't save the product. Check your connection and try again.");
    }
    setSaving(false);
  }

  // The last step is 3 with options; without options the single price is on step 2.
  const isLastStep = step === 3 || (step === 2 && !state.hasOptions);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (isLastStep) {
          void save();
        } else {
          goNext();
        }
      }}
      className="flex flex-col gap-6"
    >
      <div>
        <h2 className="text-ink text-lg font-bold">
          Step {step} of 3: {TITLES[step]}
        </h2>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((n) => {
            let color = "bg-brand-tint";
            if (n <= step) {
              color = "bg-brand";
            }
            return <span key={n} className={`h-1.5 flex-1 rounded-full ${color}`} />;
          })}
        </div>
      </div>

      {step === 1 && <DetailsSection editor={editor} errors={errors} />}
      {step === 2 && <OptionsSection editor={editor} errors={errors} />}
      {step === 3 && (
        <VariantCards
          variants={state.variants}
          images={state.images}
          errors={errors}
          onChange={editor.setVariants}
        />
      )}

      <UnclaimedErrors errors={errors} hasOptions={state.hasOptions} />
      <FormError message={formError} />

      <div className="flex gap-3">
        {step > 1 && (
          <Button variant="secondary" size="lg" onClick={goBack} disabled={saving}>
            Back
          </Button>
        )}
        {!isLastStep && (
          <Button variant="primary" size="lg" type="submit">
            Next
          </Button>
        )}
        {isLastStep && (
          <Button variant="primary" size="lg" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save product"}
          </Button>
        )}
      </div>
    </form>
  );
}
