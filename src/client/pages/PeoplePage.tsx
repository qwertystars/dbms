import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { Avatar, EmptyState, ErrorState, Icon, Loading, lifeSpan } from "~/client/components/ui";
import { loadFamilyGraph, relationIndex, type FamilyGraph } from "~/client/family-data";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "linked", label: "Linked accounts" },
  { id: "memorialized", label: "Memorialized" },
  { id: "details", label: "Needs details" },
  { id: "unconnected", label: "Unconnected" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function PeoplePage() {
  const { familyId } = useParams<{ familyId: string }>();
  const [graph, setGraph] = useState<FamilyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  useEffect(() => {
    setGraph(null);
    setError(null);
    void loadFamilyGraph(familyId!).then((res) => {
      if (res.ok) setGraph(res.data);
      else setError(res.message);
    });
  }, [familyId]);

  const index = useMemo(() => (graph ? relationIndex(graph) : null), [graph]);

  if (error) return <ErrorState title="Could not open this family" message={error} />;
  if (!graph || !index) return <Loading />;

  const needsDetails = (p: FamilyGraph["people"][number]) =>
    !p.dateOfBirth || !p.profileMediaId || !p.biography;
  const isConnected = (id: string) =>
    index.parents.has(id) || index.children.has(id) || index.partners.has(id);
  const counts: Record<FilterId, number> = {
    all: graph.people.length,
    linked: graph.people.filter((p) => index.linkedTo.has(p.id)).length,
    memorialized: graph.people.filter((p) => p.dateOfDeath).length,
    details: graph.people.filter(needsDetails).length,
    unconnected: graph.people.filter((p) => !isConnected(p.id)).length,
  };
  const needle = query.trim().toLocaleLowerCase();
  const visible = graph.people
    .filter((p) => !needle || p.name.toLocaleLowerCase().includes(needle))
    .filter((p) => {
      if (filter === "linked") return index.linkedTo.has(p.id);
      if (filter === "memorialized") return Boolean(p.dateOfDeath);
      if (filter === "details") return needsDetails(p);
      if (filter === "unconnected") return !isConnected(p.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = new Map(graph.people.map((p) => [p.id, p.name]));

  function context(id: string): string {
    const parents = (index!.parents.get(id) ?? []).map((x) => nameOf.get(x)).filter(Boolean);
    const partners = (index!.partners.get(id) ?? []).map((x) => nameOf.get(x)).filter(Boolean);
    if (parents.length) return `Child of ${parents.join(" & ")}`;
    if (partners.length) return `Partner of ${partners.join(", ")}`;
    const kids = index!.children.get(id)?.length ?? 0;
    if (kids) return `${kids} ${kids === 1 ? "child" : "children"} recorded`;
    return "No relationship recorded";
  }

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={graph.family}
        role={graph.membership.role}
        title="People"
        description="Everyone recorded in this family, living and remembered."
      />

      <div className="directory-toolbar">
        <label className="directory-search">
          <span className="visually-hidden">Search people</span>
          <input
            className="input"
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="segmented" role="group" aria-label="Layout">
          {(["grid", "list"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              className={layout === value ? "active" : ""}
              onClick={() => setLayout(value)}
            >
              {value === "grid" ? "Grid" : "List"}
            </button>
          ))}
        </div>
      </div>

      <div className="chip-row" role="group" aria-label="Filter people">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? " active" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="chip-count">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState title={graph.people.length === 0 ? "No people yet" : "Nobody matches"}>
            {graph.people.length === 0
              ? "Add the first person from the Overview tab."
              : "Try another name or filter."}
          </EmptyState>
        </div>
      ) : (
        <ul className={layout === "grid" ? "people-grid" : "card list"}>
          {visible.map((p) => {
            const profile = `/app/families/${familyId}/people/${p.id}`;
            const linked = index.linkedTo.get(p.id);
            const meta = [lifeSpan(p), p.occupation].filter(Boolean).join(" · ");
            return layout === "grid" ? (
              <li key={p.id} className="card person-card">
                <Link to={profile} className="person-card-main">
                  <Avatar
                    name={p.name}
                    size="lg"
                    mediaId={p.profileMediaId}
                    deceased={Boolean(p.dateOfDeath)}
                  />
                  <span className="person-card-name">{p.name}</span>
                  {meta && <span className="subtle">{meta}</span>}
                  <span className="person-card-context">{context(p.id)}</span>
                </Link>
                <div className="person-card-foot">
                  {linked ? (
                    <span className="badge badge-editor" title={`Linked to ${linked}`}>
                      Linked
                    </span>
                  ) : (
                    <span />
                  )}
                  <Link to={`/app/families/${familyId}/tree?focus=${p.id}`} className="btn btn-sm">
                    <Icon name="tree" size={16} />
                    See in tree
                  </Link>
                </div>
              </li>
            ) : (
              <li key={p.id} className="list-item">
                <Avatar
                  name={p.name}
                  mediaId={p.profileMediaId}
                  deceased={Boolean(p.dateOfDeath)}
                />
                <Link to={profile} className="list-item-main person-row-link">
                  <div className="list-item-title">{p.name}</div>
                  <div className="list-item-meta">
                    {[meta, context(p.id)].filter(Boolean).join(" · ")}
                  </div>
                </Link>
                {linked && <span className="badge badge-editor">Linked</span>}
                <Link to={`/app/families/${familyId}/tree?focus=${p.id}`} className="btn btn-sm">
                  See in tree
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
