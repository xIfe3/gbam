"use client";

/* eslint-disable @next/next/no-img-element -- thumbnails are small WebP files from our own storage */
import { PRODUCT_LIMITS } from "@gbam/shared";
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { deletePhotoAction, uploadPhotoAction } from "../actions";

type Photo = { id: string; smallUrl: string };

/** A photo that is still uploading, or failed to. Kept so "Try again" can resend the file. */
type Upload = {
  key: number;
  file: File;
  error: string | null;
};

const tileButton =
  "focus-visible:outline-brand flex size-11 items-center justify-center rounded-full bg-white text-ink shadow focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

/**
 * Up to 4 photo tiles. Choosing a file uploads it straight away (the product is saved later).
 * The first photo is the main one; the arrow buttons reorder, so no drag is needed.
 */
export function PhotoPicker({
  images,
  onChange,
  error,
}: {
  images: Photo[];
  onChange: (images: Photo[] | ((current: Photo[]) => Photo[])) => void;
  error?: string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const nextKey = useRef(1);
  // Photos uploaded in this session. Only these are deleted on the server when removed;
  // the others belong to a saved product, which only a successful save may change.
  const uploadedHere = useRef(new Set<string>());

  const used = images.length + uploads.length;
  const canAdd = used < PRODUCT_LIMITS.maxImages;

  async function send(upload: Upload) {
    if (upload.file.size > PRODUCT_LIMITS.maxPhotoBytes) {
      markFailed(upload.key, "Photos can be up to 10 MB");
      return;
    }
    const formData = new FormData();
    formData.set("photo", upload.file);
    try {
      const result = await uploadPhotoAction(formData);
      if ("error" in result) {
        markFailed(upload.key, result.error);
        return;
      }
      uploadedHere.current.add(result.id);
      setUploads((current) => current.filter((item) => item.key !== upload.key));
      // Passing a function (not a ready-made list) so two uploads finishing close together
      // each add to the latest list instead of overwriting each other.
      onChange((current) => [...current, { id: result.id, smallUrl: result.smallUrl }]);
    } catch {
      markFailed(upload.key, "Couldn't upload this photo. Check your connection and try again.");
    }
  }

  function markFailed(key: number, message: string) {
    setUploads((current) =>
      current.map((item) => {
        if (item.key === key) {
          return { ...item, error: message };
        }
        return item;
      }),
    );
  }

  function addFile(file: File) {
    const upload: Upload = { key: nextKey.current, file, error: null };
    nextKey.current += 1;
    setUploads((current) => [...current, upload]);
    void send(upload);
  }

  function retry(upload: Upload) {
    setUploads((current) =>
      current.map((item) => {
        if (item.key === upload.key) {
          return { ...item, error: null };
        }
        return item;
      }),
    );
    void send({ ...upload, error: null });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) {
      return;
    }
    const next = [...images];
    const moving = next[index];
    const other = next[target];
    if (!moving || !other) {
      return;
    }
    next[index] = other;
    next[target] = moving;
    onChange(next);
  }

  function remove(index: number) {
    const photo = images[index];
    if (!photo) {
      return;
    }
    const next = [...images];
    next.splice(index, 1);
    onChange(next);
    if (uploadedHere.current.has(photo.id)) {
      uploadedHere.current.delete(photo.id);
      // Best effort: if this fails the daily cleanup removes the orphan.
      void deletePhotoAction(photo.id);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-sm font-bold">
        Photos{" "}
        <span className="text-ink-muted font-normal">(up to {PRODUCT_LIMITS.maxImages})</span>
      </span>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((photo, index) => (
          <li
            key={photo.id}
            className="border-brand-tint relative aspect-square overflow-hidden rounded-xl border-2 bg-white"
          >
            <img
              src={photo.smallUrl}
              alt={`Photo ${index + 1}`}
              className="size-full object-cover"
            />
            {index === 0 && (
              <span className="bg-brand text-ink absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-bold">
                Main
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove photo ${index + 1}`}
              className={`${tileButton} absolute top-1 right-1`}
            >
              <X size={18} aria-hidden="true" />
            </button>
            <div className="absolute right-1 bottom-1 left-1 flex justify-between">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move photo ${index + 1} left`}
                className={tileButton}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === images.length - 1}
                aria-label={`Move photo ${index + 1} right`}
                className={tileButton}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}

        {uploads.map((upload) => (
          <li
            key={upload.key}
            className="border-brand-tint bg-blush flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 p-2 text-center"
          >
            {upload.error === null && (
              <>
                <Loader2 size={24} className="text-brand animate-spin" aria-hidden="true" />
                <span role="status" className="text-ink-muted text-xs">
                  Uploading…
                </span>
              </>
            )}
            {upload.error !== null && (
              <>
                <span role="alert" className="text-ink text-xs font-medium">
                  {upload.error}
                </span>
                <button
                  type="button"
                  onClick={() => retry(upload)}
                  className="border-brand text-brand focus-visible:outline-brand min-h-11 rounded-full border-2 bg-white px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setUploads((current) => current.filter((item) => item.key !== upload.key))
                  }
                  className="text-ink-muted focus-visible:outline-brand min-h-11 px-2 text-xs underline focus-visible:outline-2"
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}

        {canAdd && (
          <li>
            {/* The real file input is visually hidden; its label is the big tile. */}
            <label className="border-brand-tint text-ink-muted focus-within:outline-brand hover:bg-blush flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2">
              <Plus size={24} aria-hidden="true" />
              <span aria-hidden="true">Add photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Add photo"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Clear it so choosing the same file again still fires onChange.
                  event.target.value = "";
                  if (file) {
                    addFile(file);
                  }
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="text-coral-deep text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
