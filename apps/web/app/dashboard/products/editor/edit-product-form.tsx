"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/brand/button";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import type { ProductDetail, ProductStatus } from "@/lib/api";
import { deleteProductAction, setProductStatusAction, updateProductAction } from "../actions";
import { DetailsSection, OptionsSection, UnclaimedErrors, useEditorState } from "./editor-sections";
import { stateFromProduct, toProductInput } from "./editor-state";
import { VariantCards } from "./variant-cards";

const STALE_MESSAGE = "This product changed since you opened it. Reload to see the latest.";

/** Edit product: every section on one page, plus Show/Hide and Delete. */
export function EditProductForm({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const editor = useEditorState(stateFromProduct(product));
  const { state } = editor;
  // The version we opened the product at. Sent back so the API can refuse a stale save.
  const version = product.version;

  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    setFormError(undefined);
    setNotice(undefined);
    const built = toProductInput(state);
    if (!built.ok) {
      setErrors(built.errors);
      setFormError("Some details need fixing. They are marked below.");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // On success the action redirects to the list, so we only get here on a failure.
      const result = await updateProductAction(product.id, built.input, version);
      if (result.fieldErrors) {
        setErrors(result.fieldErrors);
      }
      if (result.error) {
        setFormError(result.error);
      }
    } catch {
      setFormError("Couldn't save the product. Check your connection and try again.");
    }
    setSaving(false);
  }

  async function toggleStatus() {
    setFormError(undefined);
    setNotice(undefined);
    let next: ProductStatus = "hidden";
    if (status === "hidden") {
      next = "active";
    }
    try {
      const result = await setProductStatusAction(product.id, next);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setStatus(next);
      if (next === "hidden") {
        setNotice("This product is hidden from your shop.");
      } else {
        setNotice("This product is showing in your shop.");
      }
    } catch {
      setFormError("Couldn't change this. Check your connection and try again.");
    }
  }

  async function confirmDelete() {
    setFormError(undefined);
    try {
      // On success the action redirects to the list.
      const result = await deleteProductAction(product.id);
      if (result.error) {
        setFormError(result.error);
        setConfirmingDelete(false);
      }
    } catch {
      setFormError("Couldn't delete this product. Check your connection and try again.");
      setConfirmingDelete(false);
    }
  }

  let statusButton = "Hide from shop";
  if (status === "hidden") {
    statusButton = "Show in shop";
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-8"
      >
        <section aria-labelledby="details-heading" className="flex flex-col gap-4">
          <h2 id="details-heading" className="text-ink text-lg font-bold">
            Photos and details
          </h2>
          <DetailsSection editor={editor} errors={errors} />
        </section>

        <section aria-labelledby="options-heading" className="flex flex-col gap-4">
          <h2 id="options-heading" className="text-ink text-lg font-bold">
            Options
          </h2>
          <OptionsSection editor={editor} errors={errors} />
        </section>

        {state.hasOptions && (
          <section aria-labelledby="variants-heading" className="flex flex-col gap-4">
            <h2 id="variants-heading" className="text-ink text-lg font-bold">
              Prices and stock
            </h2>
            <VariantCards
              variants={state.variants}
              images={state.images}
              errors={errors}
              onChange={editor.setVariants}
            />
          </section>
        )}

        <UnclaimedErrors errors={errors} hasOptions={state.hasOptions} />
        <FormError message={formError} />
        {formError === STALE_MESSAGE && (
          <div>
            {/* refresh() re-reads the product; the page's key={version} then restarts the form. */}
            <Button variant="secondary" onClick={() => router.refresh()}>
              Reload
            </Button>
          </div>
        )}
        <FormNotice message={notice} />

        <Button variant="primary" size="lg" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <section
        aria-labelledby="visibility-heading"
        className="border-brand-tint flex flex-col gap-2 border-t-2 pt-6"
      >
        <h2 id="visibility-heading" className="text-ink text-lg font-bold">
          Visibility
        </h2>
        <p className="text-ink-muted text-sm">
          Hidden products stay saved here but customers can&apos;t see or order them.
        </p>
        <div>
          <Button variant="secondary" onClick={() => void toggleStatus()}>
            {statusButton}
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="delete-heading"
        className="border-coral-tint flex flex-col gap-2 rounded-xl border-2 p-4"
      >
        <h2 id="delete-heading" className="text-coral-deep text-base font-bold">
          Delete product
        </h2>
        <p className="text-ink-muted text-sm">
          Removes it from your shop for good. If it has been ordered before, it&apos;s archived
          instead so old orders still show it.
        </p>
        {!confirmingDelete && (
          <div>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="border-coral-deep text-coral-deep hover:bg-coral-wash focus-visible:outline-coral-deep inline-flex min-h-11 items-center rounded-full border-2 bg-white px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Delete product
            </button>
          </div>
        )}
        {confirmingDelete && (
          <div
            role="alertdialog"
            aria-labelledby="delete-question"
            className="bg-coral-wash border-coral-tint flex flex-col gap-3 rounded-lg border p-4"
          >
            <p id="delete-question" className="text-ink text-sm font-medium">
              Delete this product? If it has been ordered before, it will be archived instead.
            </p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => void confirmDelete()}>
                Yes, delete
              </Button>
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
