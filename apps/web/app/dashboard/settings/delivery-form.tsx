"use client";

import { DELIVERY_LIMITS } from "@gbam/shared";
import { useActionState, useState } from "react";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";
import type { FormState } from "@/app/(auth)/action-helpers";
import type { DeliveryZone } from "@/lib/api";
import { saveDeliveryAction } from "./actions";

/**
 * One row on screen. `key` tells React which row is which when rows move or are removed
 * (new rows have no database id yet). The fee is kept as the text the seller typed.
 */
type Row = { key: string; id?: string; name: string; fee: string; isPickup: boolean };

let nextKey = 0;
function newKey(): string {
  nextKey = nextKey + 1;
  return `row-${nextKey}`;
}

function rowsFrom(zones: DeliveryZone[]): Row[] {
  const rows: Row[] = [];
  for (const zone of zones) {
    rows.push({
      key: newKey(),
      id: zone.id,
      name: zone.name,
      // Kobo to whole naira for the box: 250000 → "2500".
      fee: String(zone.feeKobo / 100),
      isPickup: zone.isPickup,
    });
  }
  return rows;
}

const inputClasses =
  "min-h-11 w-full rounded-xl border-2 border-brand-tint bg-white px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const smallButton =
  "min-h-11 min-w-11 rounded-lg border border-zinc-200 px-2 text-sm font-bold text-ink-muted hover:bg-zinc-50 disabled:opacity-40";

/** Settings → Delivery: zones with a price each, and a note for customers who pick up. */
export function DeliveryForm({
  zones,
  pickupNote,
}: {
  zones: DeliveryZone[];
  pickupNote: string | null;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(saveDeliveryAction, {});
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(zones));
  const [note, setNote] = useState(pickupNote ?? "");

  // After a save, switch to the saved list, so zones added just now carry their new database
  // ids. Done while rendering (React's way to "adjust state when something changes"): we
  // remember which saved list we already used, so each one is applied once.
  const savedZones = state.values?.savedZones;
  const [appliedSavedZones, setAppliedSavedZones] = useState<string | undefined>(undefined);
  if (savedZones && savedZones !== appliedSavedZones) {
    setAppliedSavedZones(savedZones);
    setRows(rowsFrom(JSON.parse(savedZones) as DeliveryZone[]));
  }

  function updateRow(key: string, change: Partial<Row>) {
    const updated: Row[] = [];
    for (const row of rows) {
      if (row.key === key) {
        updated.push({ ...row, ...change });
      } else {
        updated.push(row);
      }
    }
    setRows(updated);
  }

  function removeRow(key: string) {
    const kept: Row[] = [];
    for (const row of rows) {
      if (row.key !== key) {
        kept.push(row);
      }
    }
    setRows(kept);
  }

  /** Swaps a row with the one above it (`direction` -1) or below it (+1). */
  function moveRow(index: number, direction: number) {
    const other = index + direction;
    const moved = [...rows];
    const current = moved[index];
    const neighbour = moved[other];
    if (current === undefined || neighbour === undefined) {
      return;
    }
    moved[index] = neighbour;
    moved[other] = current;
    setRows(moved);
  }

  function addRow() {
    setRows([...rows, { key: newKey(), name: "", fee: "", isPickup: false }]);
  }

  // What gets submitted: every row without its on-screen key.
  const submitted = [];
  for (const row of rows) {
    if (row.id) {
      submitted.push({ id: row.id, name: row.name, fee: row.fee, isPickup: row.isPickup });
    } else {
      submitted.push({ name: row.name, fee: row.fee, isPickup: row.isPickup });
    }
  }

  let hasPickup = false;
  for (const row of rows) {
    if (row.isPickup) {
      hasPickup = true;
    }
  }
  const atLimit = rows.length >= DELIVERY_LIMITS.maxZones;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <input type="hidden" name="zones" value={JSON.stringify(submitted)} />

      {rows.length === 0 && (
        <p className="text-sm text-zinc-600">
          No zones yet. Customers give an address and you sort out delivery with them.
        </p>
      )}

      {rows.map((row, index) => {
        const number = index + 1;
        let rowName = row.name;
        if (rowName === "") {
          rowName = `zone ${number}`;
        }
        return (
          // A fieldset groups one zone's boxes; its legend names the group for screen readers.
          <fieldset key={row.key} className="rounded-lg border border-zinc-200 p-3">
            <legend className="sr-only">Zone {number}</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <label className="flex flex-col gap-1 text-sm font-bold">
                <span>Zone {number} name</span>
                <input
                  className={inputClasses}
                  value={row.name}
                  maxLength={DELIVERY_LIMITS.nameMax}
                  placeholder="e.g. Lekki / VI"
                  aria-label={`Zone ${number} name`}
                  onChange={(event) => updateRow(row.key, { name: event.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold">
                <span>Fee (₦)</span>
                <input
                  className={inputClasses}
                  value={row.fee}
                  inputMode="numeric"
                  placeholder="2500"
                  aria-label={`Zone ${number} fee (₦)`}
                  onChange={(event) => updateRow(row.key, { fee: event.target.value })}
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  className="accent-brand size-5"
                  checked={row.isPickup}
                  onChange={(event) => updateRow(row.key, { isPickup: event.target.checked })}
                />
                Customer picks up
              </label>
              <span className="flex-1" />
              <button
                type="button"
                className={smallButton}
                disabled={index === 0}
                aria-label={`Move ${rowName} up`}
                onClick={() => moveRow(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={index === rows.length - 1}
                aria-label={`Move ${rowName} down`}
                onClick={() => moveRow(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={smallButton}
                aria-label={`Remove ${rowName}`}
                onClick={() => removeRow(row.key)}
              >
                Remove
              </button>
            </div>
          </fieldset>
        );
      })}

      {state.fieldErrors?.zones && (
        <p role="alert" className="text-coral-deep text-sm font-medium">
          {state.fieldErrors.zones}
        </p>
      )}

      <div>
        <button
          type="button"
          className="text-brand-hover min-h-11 font-bold underline disabled:opacity-40"
          disabled={atLimit}
          onClick={addRow}
        >
          Add zone
        </button>
        {atLimit && (
          <p className="text-sm text-zinc-500">
            You can have up to {DELIVERY_LIMITS.maxZones} zones.
          </p>
        )}
      </div>

      {hasPickup && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          <span>Pickup note</span>
          <textarea
            name="pickupNote"
            className={`${inputClasses} min-h-20 py-2`}
            value={note}
            maxLength={DELIVERY_LIMITS.pickupNoteMax}
            placeholder="Where and when customers collect, e.g. Shop 12, Balogun Market, after 10am"
            onChange={(event) => setNote(event.target.value)}
          />
          {state.fieldErrors?.pickupNote && (
            <span role="alert" className="text-coral-deep font-medium">
              {state.fieldErrors.pickupNote}
            </span>
          )}
        </label>
      )}

      <div>
        <SubmitButton pendingLabel="Saving…">Save delivery zones</SubmitButton>
      </div>
    </form>
  );
}
