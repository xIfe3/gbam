"use client";

import {
  CONTENT_TYPE_LABELS,
  EDITABLE_CONTENT_TYPES,
  type ContentDraft,
  type LegalSection,
} from "@gbam/shared";
import { useActionState, useId, useRef, useState, useTransition } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { uploadContentImageAction } from "@/app/admin/(signed-in)/content-actions";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import { Prose } from "@/components/brand/prose";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

const inputClasses = "min-h-11 w-full rounded-lg border-2 border-zinc-200 bg-white px-2 text-base";
const boxClasses = "w-full rounded-lg border-2 border-zinc-200 p-2 font-mono text-sm";
const toolClasses = "min-h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-bold";

/** The legal page's sections as saved in `data`, or none. */
function sectionsFrom(data: ContentDraft["data"]): LegalSection[] {
  if (data === null || !Array.isArray(data.sections)) {
    return [];
  }
  const sections: LegalSection[] = [];
  for (const item of data.sections) {
    if (typeof item === "object" && item !== null) {
      const section = item as Record<string, unknown>;
      sections.push({
        id: String(section.id ?? ""),
        heading: String(section.heading ?? ""),
        body: String(section.body ?? ""),
        short: String(section.short ?? ""),
      });
    }
  }
  return sections;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-coral-deep text-sm">{message}</p>;
}

/**
 * Writes or edits one help article, FAQ, blog post, changelog entry or legal page. The text
 * is Markdown; the preview beside it uses the same renderer as the live site.
 */
export function ContentEditor({
  action,
  initial,
  type,
  isNew = false,
  saveLabel,
}: {
  action: Action;
  initial: ContentDraft;
  type: string;
  isNew?: boolean;
  saveLabel: string;
}) {
  const [state, formAction, saving] = useActionState<FormState, FormData>(action, {});
  const [body, setBody] = useState(initial.body);
  const [kind, setKind] = useState(type);
  const [sections, setSections] = useState<LegalSection[]>(sectionsFrom(initial.data));
  const [uploadError, setUploadError] = useState<string | undefined>(undefined);
  const [uploading, startUpload] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), body: useId(), summary: useId(), seo: useId() };

  let fieldErrors: Record<string, string> = {};
  if (state.fieldErrors) {
    fieldErrors = state.fieldErrors;
  }

  // Other saved extra fields (e.g. a legal page's "lastUpdated") are kept as they were.
  let dataValue = "";
  if (kind === "legal") {
    dataValue = JSON.stringify({ ...(initial.data ?? {}), sections });
  } else if (initial.data !== null) {
    dataValue = JSON.stringify(initial.data);
  }

  /** Puts `before` and `after` around the selected text (or a placeholder) in the Markdown box. */
  function wrap(before: string, after: string, placeholder: string) {
    const box = bodyRef.current;
    if (!box) {
      return;
    }
    const start = box.selectionStart;
    const end = box.selectionEnd;
    let selected = body.slice(start, end);
    if (selected === "") {
      selected = placeholder;
    }
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    // Keep the DOM value in step at once, so a second click works on the new text.
    box.value = next;
    setBody(next);
  }

  /** Starts the current line with `prefix` (a heading or a list item). */
  function prefixLine(prefix: string) {
    const box = bodyRef.current;
    if (!box) {
      return;
    }
    const lineStart = body.lastIndexOf("\n", box.selectionStart - 1) + 1;
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    box.value = next;
    setBody(next);
  }

  function insertAtCursor(text: string) {
    const box = bodyRef.current;
    let position = body.length;
    if (box) {
      position = box.selectionStart;
    }
    const next = body.slice(0, position) + text + body.slice(position);
    if (box) {
      box.value = next;
    }
    setBody(next);
  }

  function uploadImage(file: File) {
    startUpload(async () => {
      setUploadError(undefined);
      const data = new FormData();
      data.set("image", file);
      const result = await uploadContentImageAction(data);
      if (result.url) {
        insertAtCursor(`\n\n![Describe the image](${result.url})\n\n`);
      } else {
        setUploadError(result.error);
      }
    });
  }

  function updateSection(index: number, change: Partial<LegalSection>) {
    const next: LegalSection[] = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) {
        continue;
      }
      if (i === index) {
        next.push({ ...section, ...change });
      } else {
        next.push(section);
      }
    }
    setSections(next);
  }

  function removeSection(index: number) {
    const next: LegalSection[] = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (section && i !== index) {
        next.push(section);
      }
    }
    setSections(next);
  }

  return (
    // onReset preventDefault: React clears a form after its action runs; keep what was typed.
    <form
      action={formAction}
      onReset={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <input type="hidden" name="data" value={dataValue} />

      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Kind
            <select
              name="type"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className={inputClasses}
            >
              {EDITABLE_CONTENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CONTENT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Web address (slug, can&apos;t be changed later)
            <input name="slug" placeholder="how-payouts-work" className={inputClasses} />
            <FieldError message={fieldErrors.slug} />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={ids.title} className="text-sm font-bold">
          Title
        </label>
        <input id={ids.title} name="title" defaultValue={initial.title} className={inputClasses} />
        <FieldError message={fieldErrors.title} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.summary} className="text-sm font-bold">
          Summary (optional, shown in lists)
        </label>
        <input
          id={ids.summary}
          name="summary"
          defaultValue={initial.summary ?? ""}
          className={inputClasses}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Category (optional)
          <input name="category" defaultValue={initial.category ?? ""} className={inputClasses} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Order in lists (lower comes first)
          <input
            type="number"
            name="sortOrder"
            min={0}
            defaultValue={initial.sortOrder}
            className={inputClasses}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.seo} className="text-sm font-bold">
          Search engine description (optional)
        </label>
        <input
          id={ids.seo}
          name="seoDescription"
          maxLength={300}
          defaultValue={initial.seoDescription ?? ""}
          className={inputClasses}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.body} className="text-sm font-bold">
            Text (Markdown)
          </label>
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Formatting">
            <button
              type="button"
              className={toolClasses}
              onClick={() => wrap("**", "**", "bold text")}
            >
              Bold
            </button>
            <button type="button" className={toolClasses} onClick={() => prefixLine("## ")}>
              Heading
            </button>
            <button type="button" className={toolClasses} onClick={() => prefixLine("- ")}>
              List
            </button>
            <button
              type="button"
              className={toolClasses}
              onClick={() => wrap("[", "](https://)", "link text")}
            >
              Link
            </button>
            <button
              type="button"
              className={toolClasses}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading && "Uploading…"}
              {!uploading && "Image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Image to upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  uploadImage(file);
                }
              }}
            />
          </div>
          <FieldError message={uploadError} />
          <textarea
            id={ids.body}
            ref={bodyRef}
            name="body"
            rows={18}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={boxClasses}
          />
        </div>
        <section aria-label="Preview" className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-ink-subtle mb-2 text-xs font-bold uppercase">Preview</p>
          <Prose markdown={body} />
        </section>
      </div>

      {kind === "legal" && (
        <fieldset className="space-y-3 rounded-xl border border-zinc-200 p-4">
          <legend className="px-1 text-sm font-bold">Sections</legend>
          {sections.map((section, index) => (
            <div key={index} className="space-y-2 rounded-lg bg-zinc-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-bold">
                  Heading
                  <input
                    value={section.heading}
                    onChange={(event) => updateSection(index, { heading: event.target.value })}
                    className={inputClasses}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-bold">
                  Link name (id)
                  <input
                    value={section.id}
                    onChange={(event) => updateSection(index, { id: event.target.value })}
                    className={inputClasses}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-bold">
                Text (Markdown)
                <textarea
                  rows={6}
                  value={section.body}
                  onChange={(event) => updateSection(index, { body: event.target.value })}
                  className={boxClasses}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold">
                Short version (plain words)
                <input
                  value={section.short ?? ""}
                  onChange={(event) => updateSection(index, { short: event.target.value })}
                  className={inputClasses}
                />
              </label>
              <button type="button" className={toolClasses} onClick={() => removeSection(index)}>
                Remove this section
              </button>
            </div>
          ))}
          <button
            type="button"
            className={toolClasses}
            onClick={() => setSections([...sections, { id: "", heading: "", body: "", short: "" }])}
          >
            Add a section
          </button>
        </fieldset>
      )}

      <div>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand min-h-11 rounded-full px-5 font-bold text-white disabled:opacity-50"
        >
          {saving && "Saving…"}
          {!saving && saveLabel}
        </button>
      </div>
    </form>
  );
}
