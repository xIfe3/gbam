"use client";

import { PRODUCT_LIMITS } from "@gbam/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import type { EditorOption } from "./editor-state";

const chipInput =
  "text-ink focus-visible:outline-brand min-h-11 min-w-0 rounded-l-full bg-transparent py-1 pl-4 text-base focus-visible:outline-2";

/**
 * One value chip. What the seller types is kept here as a draft and only handed to the
 * parent when they finish (leave the chip or press Enter). Renaming "M" to "Large" passes
 * through "L", which may already exist; applying every keystroke would rebuild the variants
 * at each step and lose the renamed value's price and stock.
 */
function ValueChip({
  value,
  otherValues,
  onRename,
  onRemove,
}: {
  value: string;
  otherValues: string[];
  onRename: (text: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(value);

  function finish() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onRemove();
      return;
    }
    // Nothing changed, or the new text is another chip's value: put the old text back.
    if (trimmed === value || otherValues.includes(trimmed)) {
      setDraft(value);
      return;
    }
    onRename(trimmed);
  }

  return (
    <li className="bg-brand-tint flex items-center rounded-full">
      {/* Tap the chip text to edit it. A renamed value keeps its price and stock. */}
      <input
        value={draft}
        maxLength={30}
        aria-label={`Edit value ${value}`}
        size={Math.max(draft.length, 2)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Enter finishes the edit; it must not submit the surrounding form.
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={chipInput}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${value}`}
        className="text-ink focus-visible:outline-brand flex size-11 items-center justify-center rounded-full focus-visible:outline-2"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

/** One option (e.g. Size): a name, and its values as chips. */
function OptionRow({
  option,
  index,
  canRemove,
  errors,
  onChange,
  onRemove,
}: {
  option: EditorOption;
  index: number;
  canRemove: boolean;
  errors: Record<string, string>;
  onChange: (option: EditorOption) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");
  const valuesError = errors[`options.${index}.values`];
  const atLimit = option.values.length >= PRODUCT_LIMITS.maxValuesPerOption;

  /** Adds every non-empty piece of the text (commas separate values). */
  function addValues(text: string) {
    const added: string[] = [];
    for (const piece of text.split(",")) {
      const trimmed = piece.trim();
      if (trimmed !== "" && !option.values.includes(trimmed) && !added.includes(trimmed)) {
        added.push(trimmed);
      }
    }
    const room = PRODUCT_LIMITS.maxValuesPerOption - option.values.length;
    if (added.length > 0 && room > 0) {
      onChange({ ...option, values: [...option.values, ...added.slice(0, room)] });
    }
    setDraft("");
  }

  function renameValue(valueIndex: number, text: string) {
    const values = [...option.values];
    values[valueIndex] = text;
    onChange({ ...option, values });
  }

  function otherValuesFor(valueIndex: number): string[] {
    const others: string[] = [];
    for (let i = 0; i < option.values.length; i++) {
      const other = option.values[i];
      if (i !== valueIndex && other !== undefined) {
        others.push(other);
      }
    }
    return others;
  }

  function removeValue(valueIndex: number) {
    const values = [...option.values];
    values.splice(valueIndex, 1);
    onChange({ ...option, values });
  }

  return (
    <fieldset className="border-brand-tint flex flex-col gap-3 rounded-xl border-2 bg-white p-4">
      <legend className="text-ink px-1 text-sm font-bold">Option {index + 1}</legend>
      <TextField
        label="What changes? (e.g. Size, Colour)"
        placeholder="Size"
        value={option.name}
        maxLength={30}
        error={errors[`options.${index}.name`]}
        onChange={(event) => onChange({ ...option, name: event.target.value })}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-ink text-sm font-bold">Choices customers pick from</span>
        {option.values.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {option.values.map((value, valueIndex) => (
              <ValueChip
                // The value is part of the key, so after a rename the chip starts fresh.
                key={`${valueIndex}:${value}`}
                value={value}
                otherValues={otherValuesFor(valueIndex)}
                onRename={(text) => renameValue(valueIndex, text)}
                onRemove={() => removeValue(valueIndex)}
              />
            ))}
          </ul>
        )}
        {!atLimit && (
          <input
            aria-label="Add a value"
            placeholder="e.g. S, M, L (press Enter after each)"
            value={draft}
            maxLength={60}
            enterKeyHint="done"
            onChange={(event) => {
              const text = event.target.value;
              if (text.includes(",")) {
                addValues(text);
              } else {
                setDraft(text);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Enter adds the value; it must not submit the surrounding form.
                event.preventDefault();
                addValues(draft);
              }
            }}
            onBlur={() => addValues(draft)}
            className="min-h-11 w-full rounded-xl border-2 border-brand-tint bg-white px-4 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          />
        )}
        {atLimit && (
          <p className="text-ink-muted text-sm">
            That is the most values an option can have ({PRODUCT_LIMITS.maxValuesPerOption}).
          </p>
        )}
        {valuesError && (
          <p role="alert" className="text-coral-deep text-sm font-medium">
            {valuesError}
          </p>
        )}
      </div>

      {canRemove && (
        <div>
          <Button variant="ghost" onClick={onRemove}>
            Remove this option
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** Up to 3 options. Values are typed as chips. */
export function OptionsEditor({
  options,
  errors,
  onChange,
}: {
  options: EditorOption[];
  errors: Record<string, string>;
  onChange: (options: EditorOption[]) => void;
}) {
  function replace(index: number, option: EditorOption) {
    const next = [...options];
    next[index] = option;
    onChange(next);
  }

  function remove(index: number) {
    const next = [...options];
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {options.map((option, index) => (
        <OptionRow
          key={index}
          option={option}
          index={index}
          canRemove={options.length > 1}
          errors={errors}
          onChange={(changed) => replace(index, changed)}
          onRemove={() => remove(index)}
        />
      ))}
      {options.length < PRODUCT_LIMITS.maxOptions && (
        <div>
          <Button
            variant="secondary"
            onClick={() => onChange([...options, { name: "", values: [] }])}
          >
            Add another option
          </Button>
        </div>
      )}
    </div>
  );
}
