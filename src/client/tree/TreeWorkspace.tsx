import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Avatar, Card, EmptyState, Icon, lifeSpan } from "~/client/components/ui";
import {
  expansionReducer,
  initialExpansion,
  visibleIds,
  type ExpansionAction,
} from "~/client/tree/expansion";
import { FamilyGraphCanvas, type FamilyGraphHandle } from "~/client/tree/FamilyGraphCanvas";
import type { FamilyGraph } from "~/client/tree/graph";
import { PersonInspector } from "~/client/tree/PersonInspector";
import { RelationshipEditor } from "~/client/tree/RelationshipEditor";

type PanelState =
  | { kind: "inspector"; personId: string }
  | { kind: "editor"; parentId?: string; childId?: string }
  | null;

export interface TreeWorkspaceProps {
  familyId: string;
  graph: FamilyGraph;
  canEdit: boolean;
  addRelationship: (
    parentPersonId: string,
    childPersonId: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}

/**
 * The interactive family map: graph canvas, profile inspector or
 * relationship editor beside it, and the people not yet in the tree.
 * Owns the view state (what is expanded, who is selected); the family data
 * comes from `useFamilyTree`.
 */
export default function TreeWorkspace({
  familyId,
  graph,
  canEdit,
  addRelationship,
}: TreeWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [expansion, setExpansion] = useState(() =>
    initialExpansion(graph, searchParams.get("focus")),
  );
  const [panel, setPanel] = useState<PanelState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canvas = useRef<FamilyGraphHandle>(null);

  const graphRef = useRef(graph);
  const pendingReveal = useRef<{ parentId: string; childId: string } | null>(null);
  const dispatch = useCallback(
    (action: ExpansionAction) =>
      setExpansion((state) => expansionReducer(graphRef.current, state, action)),
    [],
  );

  // New server data (a refetch or a just-added relationship): keep what the
  // viewer had open, and show the new relationship if there is one.
  useEffect(() => {
    if (graphRef.current === graph) return;
    graphRef.current = graph;
    dispatch({ type: "sync" });
    const pending = pendingReveal.current;
    pendingReveal.current = null;
    if (pending) dispatch({ type: "reveal", ...pending });
  }, [graph, dispatch]);

  const visible = useMemo(() => visibleIds(graph, expansion), [graph, expansion]);
  const selectedId = panel?.kind === "inspector" ? panel.personId : null;

  const setFocusParam = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("focus", id);
      else next.delete("focus");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const select = useCallback((id: string | null) => {
    setPanel(id ? { kind: "inspector", personId: id } : null);
  }, []);

  const focusOn = useCallback(
    (id: string) => {
      dispatch({ type: "focus", id });
      setFocusParam(id);
    },
    [dispatch, setFocusParam],
  );

  function selectRelative(id: string, relation: "parent" | "child") {
    const from = selectedId;
    if (visible.has(id)) {
      canvas.current?.centreOn(id);
    } else if (from && visible.has(from)) {
      dispatch({ type: "expand", id: from, direction: relation === "child" ? "down" : "up" });
    } else {
      focusOn(id);
    }
    select(id);
  }

  async function submitRelationship(parentId: string, childId: string) {
    pendingReveal.current = { parentId, childId };
    const result = await addRelationship(parentId, childId);
    if (!result.ok) {
      pendingReveal.current = null;
      return result;
    }
    setNotice("Relationship added.");
    setPanel({ kind: "inspector", personId: childId });
    return result;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !panel) return;
    if ((event.target as HTMLElement).tagName === "SELECT") return;
    setPanel(null);
  }

  const people = graph.people.size;
  const editorButton =
    canEdit && people >= 2 ? (
      <button
        type="button"
        className="tree-tool tree-tool-text"
        onClick={() => setPanel({ kind: "editor" })}
      >
        <Icon name="link" />
        <span>Connect</span>
      </button>
    ) : null;

  return (
    <div className="tree-workspace" onKeyDown={onKeyDown}>
      {notice && (
        <Alert kind="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className={`tree-stage${panel ? " has-panel" : ""}`}>
        {graph.linked.length > 0 ? (
          <FamilyGraphCanvas
            handle={canvas}
            graph={graph}
            expansion={expansion}
            selectedId={selectedId}
            onSelect={select}
            onToggle={(id, direction) => {
              if (!visible.has(id)) return;
              const expanded = (direction === "down" ? expansion.down : expansion.up).has(id);
              dispatch({ type: expanded ? "collapse" : "expand", id, direction });
            }}
            onReset={() => {
              dispatch({ type: "reset" });
              setFocusParam(null);
            }}
            toolbar={editorButton}
          />
        ) : (
          <div className="tree-canvas tree-canvas-empty">
            <EmptyState title="No relationships yet">
              {people < 2
                ? "Add at least two people on the Overview tab, then connect them here."
                : canEdit
                  ? "Connect a parent and child to start the family map."
                  : "Editors of this family can connect parents and children."}
            </EmptyState>
            {editorButton && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPanel({ kind: "editor" })}
              >
                Connect a parent and child
              </button>
            )}
          </div>
        )}

        {panel?.kind === "inspector" && (
          <PersonInspector
            graph={graph}
            personId={panel.personId}
            familyId={familyId}
            canEdit={canEdit}
            inGraph={graph.generation.has(panel.personId)}
            onClose={() => setPanel(null)}
            onSelectRelative={selectRelative}
            onFocus={focusOn}
            onAddRelative={(id, relation) =>
              setPanel(
                relation === "parent"
                  ? { kind: "editor", childId: id }
                  : { kind: "editor", parentId: id },
              )
            }
          />
        )}
        {panel?.kind === "editor" && canEdit && (
          <RelationshipEditor
            people={[...graph.people.values()].sort((a, b) => a.name.localeCompare(b.name))}
            defaultParentId={panel.parentId}
            defaultChildId={panel.childId}
            onSubmit={submitRelationship}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      {graph.unlinked.length > 0 && (
        <Card
          title="Not yet in the tree"
          description="These people have no parent or child relationships."
        >
          <ul className="tree-unlinked">
            {graph.unlinked.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`person-node${p.dateOfDeath ? " deceased" : ""}`}
                  aria-pressed={selectedId === p.id}
                  onClick={() => select(p.id)}
                >
                  <Avatar
                    name={p.name}
                    size="sm"
                    mediaId={p.profileMediaId}
                    deceased={Boolean(p.dateOfDeath)}
                  />
                  <div>
                    <div className="person-node-name">{p.name}</div>
                    {lifeSpan(p) && <div className="person-node-meta">{lifeSpan(p)}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
