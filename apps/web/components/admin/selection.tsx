"use client";

import { createContext, useContext, useState } from "react";
import { BulkActionDialog, type BulkOutcome } from "./bulk-action-dialog";

/**
 * Ticking rows for a bulk action. The list itself is drawn on the server; the checkboxes
 * and the bulk button share the ticked ids through this "context" (a value React passes
 * down to any component inside the provider, however deep).
 */
type Selection = { ids: string[]; toggle: (id: string) => void; setAll: (ids: string[]) => void };

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection {
  const selection = useContext(SelectionContext);
  if (!selection) {
    throw new Error("Row checkboxes must be inside <SelectionProvider>");
  }
  return selection;
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);

  function toggle(id: string) {
    if (ids.includes(id)) {
      const kept: string[] = [];
      for (const existing of ids) {
        if (existing !== id) {
          kept.push(existing);
        }
      }
      setIds(kept);
    } else {
      setIds([...ids, id]);
    }
  }

  return (
    <SelectionContext.Provider value={{ ids, toggle, setAll: setIds }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      className="accent-brand size-5"
      checked={selection.ids.includes(id)}
      onChange={() => selection.toggle(id)}
    />
  );
}

/** Ticks or unticks every row on this page. */
export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const selection = useSelection();
  const allTicked = ids.length > 0 && selection.ids.length === ids.length;
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      className="accent-brand size-5"
      checked={allTicked}
      onChange={() => {
        if (allTicked) {
          selection.setAll([]);
        } else {
          selection.setAll(ids);
        }
      }}
    />
  );
}

/** The bulk button for the ticked rows (hidden while none are ticked). */
export function SelectedBulkAction(props: {
  label: string;
  explanation: string;
  risky?: boolean;
  run: (ids: string[], note: string) => Promise<BulkOutcome>;
}) {
  const selection = useSelection();
  return <BulkActionDialog {...props} ids={selection.ids} />;
}
