"use client";

import { useId, useState } from "react";
import { TextField } from "@/components/brand/fields";
import { FormError } from "@/components/brand/form-bits";
import {
  clearMissingImages,
  unclaimedMessages,
  withHasOptions,
  withOptions,
  type EditorOption,
  type EditorState,
  type EditorVariant,
} from "./editor-state";
import { OptionsEditor } from "./options-editor";
import { PhotoPicker } from "./photo-picker";
import { SingleVariantFields } from "./variant-cards";
import { PRODUCT_LIMITS } from "@gbam/shared";

type Photo = { id: string; smallUrl: string };

/**
 * The editor's state plus the changes that must keep its parts in step:
 * changing options rebuilds the variants, removing a photo clears it from variants.
 */
export function useEditorState(initial: EditorState) {
  const [state, setState] = useState<EditorState>(initial);

  function setName(name: string) {
    setState((current) => ({ ...current, name }));
  }

  function setDescription(description: string) {
    setState((current) => ({ ...current, description }));
  }

  function setImages(change: Photo[] | ((current: Photo[]) => Photo[])) {
    setState((current) => {
      let images: Photo[] = [];
      if (typeof change === "function") {
        images = change(current.images);
      } else {
        images = change;
      }
      const next: EditorState = {
        ...current,
        images,
        variants: clearMissingImages(current.variants, images),
      };
      // Parked variants must not point at a photo that was just removed either.
      if (current.stash) {
        next.stash = {
          options: current.stash.options,
          variants: clearMissingImages(current.stash.variants, images),
        };
      }
      return next;
    });
  }

  function setOptions(options: EditorOption[]) {
    setState((current) => withOptions(current, options));
  }

  function setHasOptions(hasOptions: boolean) {
    setState((current) => withHasOptions(current, hasOptions));
  }

  function setVariants(variants: EditorVariant[]) {
    setState((current) => ({ ...current, variants }));
  }

  return { state, setName, setDescription, setImages, setOptions, setHasOptions, setVariants };
}

type Editor = ReturnType<typeof useEditorState>;

/** Photos, name and description. */
export function DetailsSection({
  editor,
  errors,
}: {
  editor: Editor;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div data-tour="photos">
        <PhotoPicker
          images={editor.state.images}
          onChange={editor.setImages}
          error={errors["images"]}
        />
      </div>
      <div data-tour="details" className="flex flex-col gap-5">
        <TextField
          label="Product name"
          value={editor.state.name}
          maxLength={120}
          error={errors["name"]}
          onChange={(event) => editor.setName(event.target.value)}
        />
        <TextField
          label="Description (optional)"
          value={editor.state.description}
          maxLength={2000}
          onChange={(event) => editor.setDescription(event.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * Errors that no field on screen shows (see unclaimedMessages). Without this a save could
 * fail with nothing on screen to say why.
 */
export function UnclaimedErrors({
  errors,
  hasOptions,
}: {
  errors: Record<string, string>;
  hasOptions: boolean;
}) {
  const messages = unclaimedMessages(errors, hasOptions);
  return (
    <>
      {messages.map((message) => (
        <FormError key={message} message={message} />
      ))}
    </>
  );
}

/** "Does it come in options?" with Yes/No, then the options (Yes) or one price and stock (No). */
/**
 * "This makes 6 combinations." while the seller types: each option's choices multiply
 * (3 sizes × 2 colours = 6). Null until at least one option has a choice.
 */
function combinationText(options: { values: string[] }[]): string | null {
  let count = 1;
  let anyValues = false;
  for (const option of options) {
    if (option.values.length > 0) {
      anyValues = true;
      count = count * option.values.length;
    }
  }
  if (!anyValues) {
    return null;
  }
  if (count === 1) {
    return "This makes 1 combination.";
  }
  if (count > PRODUCT_LIMITS.maxVariants) {
    return `This makes ${count} combinations; the most is ${PRODUCT_LIMITS.maxVariants}. Remove some choices.`;
  }
  return `This makes ${count} combinations.`;
}

export function OptionsSection({
  editor,
  errors,
}: {
  editor: Editor;
  errors: Record<string, string>;
}) {
  const groupId = useId();
  const { state } = editor;
  const radio =
    "border-brand-tint has-checked:border-brand has-checked:bg-brand-tint has-focus-visible:outline-brand flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2";

  const firstVariant = state.variants[0];

  return (
    <div className="flex flex-col gap-4">
      <fieldset data-tour="options" className="flex flex-col gap-2">
        <legend className="text-ink mb-1 text-sm font-bold">Does it come in options?</legend>
        <p className="text-ink-muted text-sm">Like sizes or colours.</p>
        <div className="flex gap-3">
          <label className={radio}>
            <input
              type="radio"
              name={groupId}
              checked={!state.hasOptions}
              onChange={() => editor.setHasOptions(false)}
              className="accent-brand size-4"
            />
            No
          </label>
          <label className={radio}>
            <input
              type="radio"
              name={groupId}
              checked={state.hasOptions}
              onChange={() => editor.setHasOptions(true)}
              className="accent-brand size-4"
            />
            Yes
          </label>
        </div>
      </fieldset>

      {state.hasOptions && (
        <p className="text-ink-muted text-sm">
          Options are the things a customer chooses, like Size or Colour. Every mix of choices (for
          example M / Red) is a combination with its own price and stock.
        </p>
      )}
      {state.hasOptions && (
        <OptionsEditor options={state.options} errors={errors} onChange={editor.setOptions} />
      )}
      {state.hasOptions && combinationText(state.options) && (
        <p aria-live="polite" className="text-ink text-sm font-bold">
          {combinationText(state.options)}
        </p>
      )}
      {state.hasOptions && errors["combinations"] && <FormError message={errors["combinations"]} />}
      {!state.hasOptions && firstVariant && (
        <SingleVariantFields
          variant={firstVariant}
          errors={errors}
          onChange={(variant) => editor.setVariants([variant])}
        />
      )}
    </div>
  );
}
