"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import { FormError, SubmitButton } from "@/components/brand/form-bits";
import {
  changePayoutAccountAction,
  createPayoutAccountAction,
  resolveAccountAction,
  type ResolveState,
} from "./actions";

type Bank = { name: string; code: string };

/** "0123 456-789" → "0123456789" (people paste account numbers with spaces or dashes). */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const selectClasses =
  "min-h-11 w-full rounded-xl border-2 border-brand-tint bg-white px-4 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[invalid=true]:border-coral-deep";

/**
 * Step 3 in two parts:
 *   1. choose the bank and type the account number → "Check account"
 *   2. see the name the bank has for it → "Yes, pay me here" (creates the payout account)
 *      or "Change details" (back to part 1, with what was typed still there).
 *
 * `mode="change"` is the same form in Settings: it switches an existing payout account to
 * the new bank account instead of creating one, and has no "Skip for now".
 */
export function BankForm({ banks, mode = "create" }: { banks: Bank[]; mode?: "create" | "change" }) {
  const [resolveState, resolveAction] = useActionState<ResolveState, FormData>(
    resolveAccountAction,
    {},
  );
  // Which server action saves the account. Chosen before the hook: hooks can't be called
  // conditionally, but the function given to one can be.
  let saveAccountAction = createPayoutAccountAction;
  if (mode === "change") {
    saveAccountAction = changePayoutAccountAction;
  }
  const [createState, createAction] = useActionState(saveAccountAction, {});

  // The select's value is the bank's position in the list, not its code: a few Paystack
  // codes are shared by two bank names, and each name must stay selectable.
  const [bankIndex, setBankIndex] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  // "Change details" hides the answer of this particular check.
  const [dismissedCheckId, setDismissedCheckId] = useState<number | undefined>(undefined);

  const selectId = useId();
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  let bankCode = "";
  const chosen = banks[Number(bankIndex)];
  if (bankIndex !== "" && chosen) {
    bankCode = chosen.code;
  }

  const confirming =
    resolveState.accountName !== undefined && resolveState.checkId !== dismissedCheckId;

  // Move keyboard and screen-reader focus to the answer when it arrives.
  useEffect(() => {
    if (confirming) {
      confirmHeading.current?.focus();
    }
  }, [confirming, resolveState.checkId]);

  if (confirming) {
    const checked = resolveState.values ?? {};
    const last4 = (checked.accountNumber ?? "").slice(-4);
    let createError = createState.error;
    if (!createError && createState.fieldErrors) {
      createError = Object.values(createState.fieldErrors)[0];
    }

    return (
      <div className="flex flex-col gap-5">
        <div className="bg-brand-tint rounded-2xl p-5">
          <h2
            ref={confirmHeading}
            tabIndex={-1}
            className="text-ink-muted text-sm font-bold focus-visible:outline-none"
          >
            Is this your account?
          </h2>
          <p className="font-display text-ink mt-2 text-2xl font-black break-words">
            {resolveState.accountName}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            {resolveState.bankName} · account ending {last4}
          </p>
        </div>

        <form action={createAction} className="flex flex-col gap-4">
          <FormError message={createError} />
          <input type="hidden" name="bankCode" value={checked.bankCode ?? ""} />
          <input type="hidden" name="accountNumber" value={checked.accountNumber ?? ""} />
          <SubmitButton pendingLabel="Setting up payouts…">Yes, pay me here</SubmitButton>
        </form>
        <div>
          <Button variant="ghost" onClick={() => setDismissedCheckId(resolveState.checkId)}>
            No, change details
          </Button>
        </div>
      </div>
    );
  }

  const bankError = resolveState.fieldErrors?.bankCode;
  const bankOptions = [];
  for (let i = 0; i < banks.length; i++) {
    const bank = banks[i];
    if (bank) {
      bankOptions.push(
        <option key={`${bank.code}-${i}`} value={String(i)}>
          {bank.name}
        </option>,
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* React resets a form after its action runs. That blanked the bank <select> on screen
          (its state still held the bank), so we cancel the reset: what was typed stays. */}
      <form
        action={resolveAction}
        onReset={(event) => event.preventDefault()}
        className="flex flex-col gap-5"
        noValidate
      >
        <FormError message={resolveState.error} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-ink text-sm font-bold">
            Bank
          </label>
          <select
            id={selectId}
            value={bankIndex}
            onChange={(event) => setBankIndex(event.target.value)}
            className={selectClasses}
            aria-invalid={bankError ? true : undefined}
            aria-describedby={bankError ? `${selectId}-error` : undefined}
          >
            <option value="">Choose your bank</option>
            {bankOptions}
          </select>
          {bankError && (
            <p
              id={`${selectId}-error`}
              role="alert"
              className="text-coral-deep text-sm font-medium"
            >
              {bankError}
            </p>
          )}
        </div>
        {/* The code is what the API needs; the select above holds the list position. */}
        <input type="hidden" name="bankCode" value={bankCode} />

        <TextField
          label="Account number"
          name="accountNumber"
          inputMode="numeric"
          autoComplete="off"
          // No maxLength on purpose: it would cut a pasted "0123 456 789" before the spaces
          // are removed. We keep the digits only, then stop at 10.
          value={accountNumber}
          onChange={(event) => setAccountNumber(onlyDigits(event.target.value).slice(0, 10))}
          hint="10 digits. We check it with your bank before saving anything."
          error={resolveState.fieldErrors?.accountNumber}
        />

        <SubmitButton pendingLabel="Checking…">Check account</SubmitButton>
      </form>

      {mode === "create" && (
        <div className="border-brand-tint border-t pt-4">
          <p className="text-ink-muted mb-2 text-sm">
            You can add it later. Until then, you can&apos;t send payment links.
          </p>
          <Button variant="ghost" href="/dashboard">
            Skip for now
          </Button>
        </div>
      )}
    </div>
  );
}
