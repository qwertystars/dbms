import { useState, type SubmitEvent } from "react";
import { Alert, Field } from "~/client/components/ui";
import type { TreePerson } from "~/client/tree/graph";

export interface RelationshipEditorProps {
  people: readonly TreePerson[];
  defaultParentId?: string;
  defaultChildId?: string;
  onSubmit: (
    parentPersonId: string,
    childPersonId: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onClose: () => void;
}

/**
 * Side-panel form for POST /relationships/parent-child. The server performs
 * the authorization, cycle and duplicate checks; the self-edge check here is
 * only a quicker message.
 */
export function RelationshipEditor({
  people,
  defaultParentId = "",
  defaultChildId = "",
  onSubmit,
  onClose,
}: RelationshipEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parentPersonId = String(form.get("parentPersonId") ?? "");
    const childPersonId = String(form.get("childPersonId") ?? "");
    if (!parentPersonId || !childPersonId) return;
    if (parentPersonId === childPersonId) {
      setError("A person cannot be their own parent.");
      return;
    }
    setBusy(true);
    try {
      const result = await onSubmit(parentPersonId, childPersonId);
      if (!result.ok) setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  const options = people.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  return (
    <aside className="tree-panel tree-editor" aria-labelledby="tree-editor-title">
      <span className="tree-sheet-grip" aria-hidden="true" />
      <div className="tree-panel-head">
        <div className="tree-panel-title">
          <h2 id="tree-editor-title">Connect a parent and child</h2>
          <p>Relationships are checked for loops and duplicates.</p>
        </div>
        <button type="button" className="tree-panel-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="tree-panel-body">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {/* Remount on new defaults so the selects pick them up. */}
        <form key={`${defaultParentId}:${defaultChildId}`} onSubmit={submit} className="form">
          <Field label="Parent">
            <select
              className="select"
              name="parentPersonId"
              required
              defaultValue={defaultParentId}
            >
              <option value="" disabled>
                Select a person…
              </option>
              {options}
            </select>
          </Field>
          <Field label="Child">
            <select className="select" name="childPersonId" required defaultValue={defaultChildId}>
              <option value="" disabled>
                Select a person…
              </option>
              {options}
            </select>
          </Field>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Adding…" : "Add relationship"}
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}
