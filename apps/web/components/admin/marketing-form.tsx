"use client";

import type { FeatureTile, MarketingPage, PageHeaderFields } from "@gbam/shared";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { FormError, FormNotice } from "@/components/brand/form-bits";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

const inputClasses = "min-h-11 w-full rounded-lg border-2 border-zinc-200 bg-white px-2 text-base";
const boxClasses = "min-h-20 w-full rounded-lg border-2 border-zinc-200 p-2 text-base";
const smallButton = "min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold";

function Text({
  name,
  label,
  value,
  long = false,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  long?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {label}
      {hint && <span className="text-ink-muted font-normal">{hint}</span>}
      {long && <textarea name={name} defaultValue={value} className={boxClasses} />}
      {!long && <input name={name} defaultValue={value} className={inputClasses} />}
    </label>
  );
}

function HeaderFields({ header }: { header: PageHeaderFields }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4">
      <legend className="px-1 text-sm font-bold">Page header</legend>
      <Text name="header.eyebrow" label="Small label above the headline" value={header.eyebrow} />
      <Text name="header.title" label="Headline" value={header.title} />
      <Text name="header.lead" label="Text under the headline" value={header.lead} long />
      <Text
        name="header.photoSrc"
        label="Photo"
        value={header.photoSrc}
        hint="One of ours (/images/…), or an image address from the content editor's Image button."
      />
      <Text
        name="header.photoAlt"
        label="Photo description (for screen readers)"
        value={header.photoAlt}
      />
      <Text
        name="header.ctaLabel"
        label="Button text (empty = no button)"
        value={header.ctaLabel}
      />
    </fieldset>
  );
}

function TilesFields({ initial }: { initial: FeatureTile[] }) {
  // Each tile keeps a key of its own, so removing one doesn't shuffle the typed text.
  const [tiles, setTiles] = useState(() => {
    const keyed: { key: number; tile: FeatureTile }[] = [];
    for (let i = 0; i < initial.length; i++) {
      const tile = initial[i];
      if (tile) {
        keyed.push({ key: i, tile });
      }
    }
    return keyed;
  });
  const [nextKey, setNextKey] = useState(initial.length);

  function remove(key: number) {
    const next: { key: number; tile: FeatureTile }[] = [];
    for (const item of tiles) {
      if (item.key !== key) {
        next.push(item);
      }
    }
    setTiles(next);
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4">
      <legend className="px-1 text-sm font-bold">Feature tiles (the layout stays the same)</legend>
      {tiles.map((item, index) => (
        <div key={item.key} className="space-y-2 rounded-lg bg-zinc-50 p-3">
          <Text
            name={`tiles.${index}.eyebrow`}
            label={`Tile ${index + 1} label`}
            value={item.tile.eyebrow}
          />
          <Text
            name={`tiles.${index}.title`}
            label={`Tile ${index + 1} title`}
            value={item.tile.title}
          />
          <Text
            name={`tiles.${index}.text`}
            label={`Tile ${index + 1} text`}
            value={item.tile.text}
            long
          />
          <button type="button" className={smallButton} onClick={() => remove(item.key)}>
            Remove tile {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className={smallButton}
        onClick={() => {
          setTiles([...tiles, { key: nextKey, tile: { eyebrow: "", title: "", text: "" } }]);
          setNextKey(nextKey + 1);
        }}
      >
        Add a tile
      </button>
    </fieldset>
  );
}

/** The editable words and photos of one marketing page, in the page's fixed fields. */
export function MarketingForm({
  page,
  fields,
  action,
}: {
  page: MarketingPage;
  fields: Record<string, unknown>;
  action: Action;
}) {
  const [state, formAction, saving] = useActionState<FormState, FormData>(action, {});
  const value = (key: string): string => {
    const found = fields[key];
    if (typeof found === "string") {
      return found;
    }
    return "";
  };

  return (
    // onReset preventDefault: React clears a form after its action runs; keep what was typed.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
    >
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <Text
        name="seoDescription"
        label="Search engine description"
        value={value("seoDescription")}
        long
      />
      {page === "home" && (
        <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4">
          <legend className="px-1 text-sm font-bold">Top of the home page</legend>
          <p className="text-ink-muted text-sm">
            The big headline (&quot;Sell on WhatsApp. Get paid. Gbam.&quot;) is part of the brand
            and stays as it is.
          </p>
          <Text
            name="heroSubtitle"
            label="Text under the headline"
            value={value("heroSubtitle")}
            long
          />
          <Text name="primaryButton" label="Main button" value={value("primaryButton")} />
          <Text name="secondaryButton" label="Second button" value={value("secondaryButton")} />
          <Text
            name="heroSmallPrint"
            label="Small print under the buttons"
            value={value("heroSmallPrint")}
          />
        </fieldset>
      )}
      {page !== "home" && <HeaderFields header={fields.header as PageHeaderFields} />}
      {page === "features" && <TilesFields initial={fields.tiles as FeatureTile[]} />}
      <div>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50"
        >
          {saving && "Saving…"}
          {!saving && "Save draft"}
        </button>
      </div>
    </form>
  );
}
