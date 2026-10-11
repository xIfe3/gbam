"use client";

import { formatNaira, USSD_BANKS, type DirectPayChoice, type UssdBankCode } from "@gbam/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import type { DirectPaymentView } from "@/lib/api";
import { directPayAction } from "../actions";
import { PayNowButton } from "./pay-now-button";

type Method = "bank_transfer" | "ussd" | "card";

const METHODS: { value: Method; label: string; hint: string }[] = [
  { value: "bank_transfer", label: "Bank transfer", hint: "From any bank app" },
  { value: "ussd", label: "USSD", hint: "Dial a code, no data needed" },
  { value: "card", label: "Card", hint: "Debit card, in Paystack's secure window" },
];

const BIG_BUTTON =
  "bg-brand hover:bg-brand-hover focus-visible:outline-brand min-h-12 w-full rounded-full px-6 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";

/** "29:41": minutes and seconds left, from milliseconds. */
function minutesAndSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  let secondsText = String(seconds);
  if (seconds < 10) {
    secondsText = `0${seconds}`;
  }
  return `${minutes}:${secondsText}`;
}

/** Milliseconds until `iso`, updated every second. Goes to 0 and stays there. */
function useTimeLeft(iso: string): number {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = new Date(iso).getTime();
  useEffect(() => {
    // A timer that ticks every second; cleaned up when the box goes away.
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, endsAt - now);
}

/** A small "Copy …" button for an account number or an amount. */
function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      // The Clipboard API can be blocked in some in-app browsers; then we say how to copy.
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  let text = "Copy";
  if (copied) {
    text = "✓ Copied";
  }
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="border-brand text-brand hover:bg-brand-tint min-h-10 rounded-full border-2 bg-white px-4 text-sm font-bold"
      >
        {text}
      </button>
      {failed && <span className="text-ink-muted text-xs">Press and hold to copy</span>}
    </span>
  );
}

/** One line of the transfer box: what it is, the value, and (sometimes) a copy button. */
function DetailRow({
  name,
  value,
  copyLabel,
  copyValue,
}: {
  name: string;
  value: string;
  copyLabel?: string;
  copyValue?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-ink-muted text-xs">{name}</dt>
        <dd className="text-ink text-lg font-bold break-all tabular-nums">{value}</dd>
      </div>
      {copyLabel && copyValue && <CopyValueButton value={copyValue} label={copyLabel} />}
    </div>
  );
}

/** "Expires in 29:41", or the expired message with a button for a new account or code. */
function Countdown({
  expiresAt,
  what,
  expiredMessage,
  onRenew,
}: {
  expiresAt: string;
  what: string;
  expiredMessage: string;
  onRenew: () => void;
}) {
  const left = useTimeLeft(expiresAt);
  if (left > 0) {
    return <p className="text-ink-muted text-sm">Expires in {minutesAndSeconds(left)}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p role="alert" className="bg-blush text-ink rounded-xl p-3 text-sm">
        {expiredMessage}
      </p>
      <button type="button" onClick={onRenew} className={BIG_BUTTON}>
        {`Get a new ${what}`}
      </button>
    </div>
  );
}

/**
 * How the customer pays, on gbam's own screen: bank transfer (a one-off account from
 * Paystack), USSD (a code to dial), or card (Paystack's secure pop-up, so card numbers
 * never pass through gbam). After paying, the tracking page waits for Paystack's
 * confirmation, the same as for a card.
 */
export function PayOptions({
  code,
  trackingKey,
  totalKobo,
}: {
  code: string;
  trackingKey: string;
  totalKobo: number;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [bank, setBank] = useState<UssdBankCode>(USSD_BANKS[0].code);
  const [payment, setPayment] = useState<DirectPaymentView | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [useCard, setUseCard] = useState(false);
  const [useCheckout, setUseCheckout] = useState(false);
  // useTransition: the button shows it's working while we ask Paystack.
  const [pending, startTransition] = useTransition();
  const total = formatNaira(totalKobo);

  function choose(next: Method) {
    setMethod(next);
    setPayment(null);
    setError(undefined);
    setUseCard(false);
    setUseCheckout(false);
  }

  function start(choice: DirectPayChoice) {
    setError(undefined);
    setUseCard(false);
    setUseCheckout(false);
    startTransition(async () => {
      const result = await directPayAction(code, trackingKey, choice);
      if (result.payment) {
        setPayment(result.payment);
        return;
      }
      setPayment(null);
      setError(result.error);
      if (result.useCard) {
        setUseCard(true);
      }
      if (result.useCheckout) {
        setUseCheckout(true);
      }
    });
  }

  function paid() {
    // paid=1: the tracking page shows "Confirming your payment…" until the webhook lands.
    router.push(`/track/${code}?k=${encodeURIComponent(trackingKey)}&paid=1`);
  }

  let getLabel = "Get account details";
  let choice: DirectPayChoice = { method: "bank_transfer" };
  if (method === "ussd") {
    getLabel = "Get USSD code";
    choice = { method: "ussd", bank };
  }
  if (pending) {
    getLabel = "Setting it up…";
  }

  return (
    <section className="bg-brand-tint flex flex-col gap-4 rounded-2xl p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink mb-2 font-bold">How do you want to pay {total}?</legend>
        {METHODS.map((each) => {
          let classes =
            "border-brand-tint flex items-center gap-3 rounded-xl border-2 bg-white p-3";
          if (each.value === method) {
            classes = "border-brand flex items-center gap-3 rounded-xl border-2 bg-white p-3";
          }
          return (
            <label key={each.value} className={classes}>
              <input
                type="radio"
                name="pay-method"
                value={each.value}
                checked={each.value === method}
                onChange={() => choose(each.value)}
                // The name is just the method; the hint is read out as extra detail.
                aria-label={each.label}
                aria-describedby={`pay-hint-${each.value}`}
                className="accent-brand size-5"
              />
              <span className="flex flex-col">
                <span className="text-ink font-bold">{each.label}</span>
                <span id={`pay-hint-${each.value}`} className="text-ink-muted text-sm">
                  {each.hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {method === "ussd" && !payment && (
        <label className="text-ink flex flex-col gap-1 text-sm font-bold">
          Your bank
          <select
            value={bank}
            onChange={(event) => setBank(event.target.value as UssdBankCode)}
            className="border-brand-tint min-h-12 rounded-xl border-2 bg-white px-3 text-base font-normal"
          >
            {USSD_BANKS.map((each) => (
              <option key={each.code} value={each.code}>
                {each.name} (*{each.code}#)
              </option>
            ))}
          </select>
        </label>
      )}

      {method !== "card" && !payment && !useCheckout && (
        <button
          type="button"
          onClick={() => start(choice)}
          disabled={pending}
          className={BIG_BUTTON}
        >
          {getLabel}
        </button>
      )}

      {payment && payment.method === "bank_transfer" && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4">
          <p className="text-ink text-sm">
            Send <strong>exactly {formatNaira(payment.amountKobo)}</strong> to this account from
            your bank app. It&apos;s for this order only.
          </p>
          <dl className="divide-brand-tint flex flex-col divide-y">
            <DetailRow
              name="Amount"
              value={formatNaira(payment.amountKobo)}
              copyLabel="Copy amount"
              copyValue={String(payment.amountKobo / 100)}
            />
            <DetailRow
              name="Account number"
              value={payment.accountNumber}
              copyLabel="Copy account number"
              copyValue={payment.accountNumber}
            />
            <DetailRow name="Bank" value={payment.bankName} />
            <DetailRow name="Account name" value={payment.accountName} />
          </dl>
          <TransferFooter
            expiresAt={payment.expiresAt}
            what="account"
            expiredMessage="This account has expired. Don't send money to it."
            doneLabel="I've sent the money"
            lateDoneLabel="I already sent the money"
            onDone={paid}
            onRenew={() => start({ method: "bank_transfer" })}
          />
        </div>
      )}

      {payment && payment.method === "ussd" && (
        <div className="flex flex-col gap-3 rounded-xl bg-white p-4">
          <p className="text-ink text-sm">
            Dial this code on the phone line registered with your bank, and follow the prompts to
            pay {formatNaira(payment.amountKobo)}.
          </p>
          <p className="text-ink text-center text-2xl font-black tracking-wide break-all">
            {payment.ussdCode}
          </p>
          {/* In a phone link "#" must be written %23, or the phone drops it. */}
          <a
            href={`tel:${payment.ussdCode.replaceAll("#", "%23")}`}
            className="border-brand text-brand min-h-12 rounded-full border-2 bg-white px-6 py-3 text-center font-bold"
          >
            Dial now
          </a>
          <TransferFooter
            expiresAt={payment.expiresAt}
            what="code"
            // Paystack doesn't know our time limit for USSD codes, so we don't claim the old
            // one can't take money; a payment for a still-open order is kept as normal.
            expiredMessage="This code may have stopped working. Get a new one to be safe."
            doneLabel="I've dialled and paid"
            lateDoneLabel="I already paid"
            onDone={paid}
            onRenew={() => start({ method: "ussd", bank })}
          />
        </div>
      )}

      <FormError message={error} />

      {useCard && (
        <button
          type="button"
          onClick={() => choose("card")}
          className="text-brand-hover text-left font-bold underline"
        >
          Pay by card instead
        </button>
      )}

      {useCheckout && (
        <PayNowButton
          code={code}
          trackingKey={trackingKey}
          totalKobo={totalKobo}
          intro="Paystack's secure window"
          label={`Pay ${total} with Paystack`}
        />
      )}

      {method === "card" && (
        <PayNowButton
          code={code}
          trackingKey={trackingKey}
          totalKobo={totalKobo}
          intro="Your card details go to Paystack in its secure window."
          label={`Pay ${total} by card`}
        />
      )}

      {method !== "card" && (
        <p className="text-ink-muted text-xs">
          🔒 Payments are handled by Paystack. Gbam and the seller never see your bank details.
        </p>
      )}
    </section>
  );
}

/** Under the account or code: the countdown and the "I've paid" button (until it expires). */
function TransferFooter({
  expiresAt,
  what,
  expiredMessage,
  doneLabel,
  lateDoneLabel,
  onDone,
  onRenew,
}: {
  expiresAt: string;
  what: string;
  expiredMessage: string;
  doneLabel: string;
  /** After it runs out: for someone who paid just before, so they aren't pushed to pay again. */
  lateDoneLabel: string;
  onDone: () => void;
  onRenew: () => void;
}) {
  const left = useTimeLeft(expiresAt);
  return (
    <div className="flex flex-col gap-3">
      <Countdown
        expiresAt={expiresAt}
        what={what}
        expiredMessage={expiredMessage}
        onRenew={onRenew}
      />
      {left > 0 && (
        <button type="button" onClick={onDone} className={BIG_BUTTON}>
          {doneLabel}
        </button>
      )}
      {left === 0 && (
        <button
          type="button"
          onClick={onDone}
          className="text-brand-hover min-h-11 font-bold underline"
        >
          {lateDoneLabel}
        </button>
      )}
    </div>
  );
}
