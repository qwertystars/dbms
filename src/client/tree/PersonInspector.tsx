import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Avatar, Icon, formatDate, lifeSpan } from "~/client/components/ui";
import { childrenOf, parentsOf, type FamilyGraph, type TreePerson } from "~/client/tree/graph";
import { excerpt } from "~/client/tree/PersonNode";

export interface PersonInspectorProps {
  graph: FamilyGraph;
  personId: string;
  familyId: string;
  canEdit: boolean;
  /** Whether the person is a card in the graph (unlinked people are not). */
  inGraph: boolean;
  onClose: () => void;
  onSelectRelative: (id: string, relation: "parent" | "child") => void;
  onFocus: (id: string) => void;
  onAddRelative: (id: string, relation: "parent" | "child") => void;
}

/**
 * Profile summary beside the graph (a bottom sheet on phones). It only shows
 * fields the tree endpoint already returned to this member; the full profile
 * stays on the person page.
 */
export function PersonInspector({
  graph,
  personId,
  familyId,
  canEdit,
  inGraph,
  onClose,
  onSelectRelative,
  onFocus,
  onAddRelative,
}: PersonInspectorProps) {
  const person = graph.people.get(personId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView?.({ block: "nearest" });
  }, [personId]);
  if (!person) return null;

  const parents = parentsOf(graph, personId).map((id) => graph.people.get(id)!);
  const children = childrenOf(graph, personId).map((id) => graph.people.get(id)!);
  const span = lifeSpan(person);
  const bio = excerpt(person.biography, 320);
  const details: [string, string][] = (
    [
      ["Born", formatDate(person.dateOfBirth)],
      ["Died", formatDate(person.dateOfDeath)],
      ["Occupation", person.occupation ?? ""],
    ] as [string, string][]
  ).filter(([, value]) => value);

  return (
    <aside className="tree-panel tree-inspector" aria-labelledby="tree-inspector-title">
      <span className="tree-sheet-grip" aria-hidden="true" />
      <div className="tree-panel-head">
        <Avatar
          name={person.name}
          size="lg"
          mediaId={person.profileMediaId}
          deceased={Boolean(person.dateOfDeath)}
        />
        <div className="tree-panel-title">
          <h2 id="tree-inspector-title" ref={heading}>
            {person.name}
          </h2>
          {(span || person.dateOfDeath) && (
            <p>{[span, person.dateOfDeath ? "In memory" : ""].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button
          type="button"
          className="tree-panel-close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>

      <div className="tree-panel-body">
        {details.length > 0 && (
          <dl className="detail-list">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {bio && <p className="tree-inspector-bio">{bio}</p>}

        <Relatives
          title="Parents"
          people={parents}
          empty="No parents recorded."
          onPick={(id) => onSelectRelative(id, "parent")}
        />
        <Relatives
          title="Children"
          people={children}
          empty="No children recorded."
          onPick={(id) => onSelectRelative(id, "child")}
        />

        <div className="tree-panel-actions">
          <Link
            className="btn btn-primary btn-sm"
            to={`/app/families/${familyId}/people/${personId}`}
          >
            Open full profile
          </Link>
          {inGraph && (
            <button type="button" className="btn btn-sm" onClick={() => onFocus(personId)}>
              Centre the tree here
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onAddRelative(personId, "parent")}
              >
                Add a parent
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onAddRelative(personId, "child")}
              >
                Add a child
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function Relatives({
  title,
  people,
  empty,
  onPick,
}: {
  title: string;
  people: TreePerson[];
  empty: string;
  onPick: (id: string) => void;
}) {
  return (
    <section className="tree-relatives">
      <h3>{title}</h3>
      {people.length === 0 ? (
        <p className="subtle">{empty}</p>
      ) : (
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" className="tree-relative" onClick={() => onPick(p.id)}>
                <Avatar
                  name={p.name}
                  size="sm"
                  mediaId={p.profileMediaId}
                  deceased={Boolean(p.dateOfDeath)}
                />
                <span className="tree-relative-text">
                  <span className="tree-relative-name">{p.name}</span>
                  {lifeSpan(p) && <span className="tree-relative-meta">{lifeSpan(p)}</span>}
                </span>
                <Icon name="chevron" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
