import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  Alert,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  lifeSpan,
  useBusy,
} from "~/client/components/ui";

interface Generation {
  level: number;
  people: any[];
}

/**
 * Groups people into generations for display. This is presentation logic only;
 * the persisted model is the explicit parent/child edge list.
 *
 * A person's generation is one below their deepest parent. Parents with no
 * recorded parents of their own (for example someone who married into the
 * family) are aligned one generation above their children.
 */
function layoutGenerations(people: any[], edges: any[]) {
  const ids = new Set(people.map((p) => p.id));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.parentPersonId) || !ids.has(e.childPersonId)) continue;
    parentsOf.set(e.childPersonId, [...(parentsOf.get(e.childPersonId) ?? []), e.parentPersonId]);
    childrenOf.set(e.parentPersonId, [
      ...(childrenOf.get(e.parentPersonId) ?? []),
      e.childPersonId,
    ]);
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    const known = level.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // defensive: the server rejects cycles
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    const value = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth));
    visiting.delete(id);
    level.set(id, value);
    return value;
  }
  people.forEach((p) => depth(p.id));

  for (const p of people) {
    const children = childrenOf.get(p.id) ?? [];
    if ((parentsOf.get(p.id) ?? []).length === 0 && children.length > 0) {
      level.set(p.id, Math.min(...children.map((c) => level.get(c) ?? 0)) - 1);
    }
  }

  const connected = people.filter((p) => parentsOf.has(p.id) || childrenOf.has(p.id));
  const unconnected = people.filter((p) => !parentsOf.has(p.id) && !childrenOf.has(p.id));

  const byLevel = new Map<number, any[]>();
  for (const p of connected) {
    const l = level.get(p.id) ?? 0;
    byLevel.set(l, [...(byLevel.get(l) ?? []), p]);
  }
  const generations: Generation[] = [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([l, list]) => ({
      level: l,
      people: list.sort((a, b) => (a.dateOfBirth ?? "").localeCompare(b.dateOfBirth ?? "")),
    }));

  return { generations, unconnected, parentsOf };
}

export function TreePage() {
  const { familyId } = useParams<{ familyId: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, run] = useBusy();

  async function load() {
    const family = await api("GET", `/api/v1/families/${familyId}`);
    if (family.status !== 200) {
      setError(errorMessage(family, "Family not found."));
      return;
    }
    const tree = await api("GET", `/api/v1/families/${familyId}/tree`);
    if (tree.status !== 200) {
      setError(errorMessage(tree, "Could not load the family tree."));
      return;
    }
    setData({
      family: family.body.family,
      role: family.body.membership.role,
      people: tree.body.people || [],
      edges: tree.body.edges || [],
    });
  }

  useEffect(() => {
    setData(null);
    setError(null);
    setNotice(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const layout = useMemo(() => {
    if (!data) return null;
    return layoutGenerations(data.people, data.edges);
  }, [data]);

  async function addEdge(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    const parentPersonId = formData.get("parentPersonId") as string;
    const childPersonId = formData.get("childPersonId") as string;
    if (!parentPersonId || !childPersonId) return;
    if (parentPersonId === childPersonId) {
      setError("A person cannot be their own parent.");
      return;
    }
    const res = await run(() =>
      api("POST", `/api/v1/families/${familyId}/relationships/parent-child`, {
        parentPersonId,
        childPersonId,
      }),
    );
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not add relationship.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    await load();
    setNotice("Relationship added.");
  }

  if (error && !data) return <ErrorState title="Could not open this family" message={error} />;
  if (!data || !layout) return <Loading />;

  const nameOf = new Map<string, string>(data.people.map((p: any) => [p.id, p.name]));
  const personLink = (id: string) => `/app/families/${familyId}/people/${id}`;
  const hasTree = layout.generations.length > 0;

  function renderNode(p: any) {
    const parents = (layout!.parentsOf.get(p.id) ?? []).map((id) => nameOf.get(id) ?? "Unknown");
    const span = lifeSpan(p);
    return (
      <Link
        key={p.id}
        to={personLink(p.id)}
        className={`person-node${p.dateOfDeath ? " deceased" : ""}`}
      >
        <Avatar
          name={p.name}
          size="sm"
          mediaId={p.profileMediaId}
          deceased={Boolean(p.dateOfDeath)}
        />
        <div style={{ minWidth: 0 }}>
          <div className="person-node-name">{p.name}</div>
          {span && <div className="person-node-meta">{span}</div>}
          {parents.length > 0 && (
            <div className="person-node-meta">Child of {parents.join(" & ")}</div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={data.family}
        role={data.role}
        title="Family tree"
        description="Generations are arranged from the eldest at the top."
      />

      <div className="stack">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {notice && (
          <Alert kind="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        {data.role !== "VIEWER" && data.people.length >= 2 && (
          <Card title="Connect a parent and child">
            <form onSubmit={addEdge} className="form">
              <div className="form-grid">
                <Field label="Parent">
                  <select className="select" name="parentPersonId" required defaultValue="">
                    <option value="" disabled>
                      Select a person…
                    </option>
                    {data.people.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Child">
                  <select className="select" name="childPersonId" required defaultValue="">
                    <option value="" disabled>
                      Select a person…
                    </option>
                    {data.people.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Adding…" : "Add relationship"}
                </button>
              </div>
            </form>
          </Card>
        )}

        {hasTree ? (
          <div className="tree">
            {layout.generations.map((g, index) => (
              <section key={g.level} className="card generation">
                <div className="generation-label eyebrow">Generation {index + 1}</div>
                <div className="generation-people">{g.people.map(renderNode)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState title="No relationships yet">
              {data.people.length < 2
                ? "Add at least two people on the Overview tab, then connect them here."
                : data.role === "VIEWER"
                  ? "Editors of this family can connect parents and children."
                  : "Connect a parent and child above to start building the tree."}
            </EmptyState>
          </div>
        )}

        {layout.unconnected.length > 0 && (
          <Card
            title="Not yet in the tree"
            description="These people have no parent or child relationships."
          >
            <div className="generation-people">{layout.unconnected.map(renderNode)}</div>
          </Card>
        )}
      </div>
    </>
  );
}
