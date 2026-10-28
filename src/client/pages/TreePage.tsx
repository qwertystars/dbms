import { Suspense, lazy, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { Alert, Card, ErrorState, Field, Loading, useBusy } from "~/client/components/ui";
import { useFamilyTree } from "~/client/tree/useFamilyTree";

// The graph renderer and layout engine load with this page only.
const TreeWorkspace = lazy(() => import("~/client/tree/TreeWorkspace"));

export function TreePage() {
  const { familyId } = useParams<{ familyId: string }>();
  const tree = useFamilyTree(familyId!);

  if (tree.status === "error" && !tree.graph) {
    return (
      <ErrorState
        title="Could not open this family"
        message={tree.error ?? "Something went wrong."}
        action={
          <button type="button" className="btn" onClick={() => void tree.retry()}>
            Try again
          </button>
        }
      />
    );
  }
  if (!tree.graph || !tree.family || !tree.role) return <Loading />;

  const canEdit = tree.role === "CREATOR" || tree.role === "EDITOR";
  const people = [...tree.graph.people.values()];

  return (
    <div className="tree-page">
      <FamilyHeader
        familyId={familyId!}
        family={tree.family}
        role={tree.role}
        title="Family tree"
        description="Eldest generations on the left. Press + on a card to reveal the next generation."
      />
      {tree.error && (
        <Alert>
          Couldn't refresh the tree: {tree.error}{" "}
          <button type="button" className="btn btn-sm" onClick={() => void tree.retry()}>
            Try again
          </button>
        </Alert>
      )}
      <Suspense fallback={<Loading label="Loading the family map…" />}>
        <TreeWorkspace
          key={familyId}
          familyId={familyId!}
          graph={tree.graph}
          canEdit={canEdit}
          addRelationship={tree.addRelationship}
        />
      </Suspense>
      {canEdit && people.length >= 2 && <PartnerForm familyId={familyId!} people={people} />}
    </div>
  );
}

/** POST /relationships/partners. Partner links are separate from parenthood. */
function PartnerForm({
  familyId,
  people,
}: {
  familyId: string;
  people: readonly { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, run] = useBusy();

  async function addPartner(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    const res = await run(() =>
      api("POST", `/api/v1/families/${familyId}/relationships/partners`, {
        personAId: values.get("personAId"),
        personBId: values.get("personBId"),
      }),
    );
    if (!res || res.status !== 201) {
      setNotice(null);
      setError(res ? errorMessage(res, "Could not add partners.") : null);
      return;
    }
    form.reset();
    setError(null);
    setNotice("Partners connected.");
  }

  return (
    <Card title="Connect partners" description="A partner connection is separate from parenthood.">
      <form onSubmit={addPartner} className="form">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {notice && (
          <Alert kind="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        <div className="form-grid">
          {["personAId", "personBId"].map((name, i) => (
            <Field key={name} label={`Person ${i + 1}`}>
              <select className="select" name={name} required defaultValue="">
                <option value="" disabled>
                  Select a person…
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Connect partners"}
          </button>
        </div>
      </form>
    </Card>
  );
}
