import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { Avatar, lifeSpan } from "~/client/components/ui";
import { relationIndex, type FamilyGraph } from "~/client/family-data";
import { mapLayout, neighbors } from "~/client/map-layout";
import "~/client/tree.css";

type Graph = Pick<FamilyGraph, "people" | "edges" | "partners" | "members">;

export function FamilyMap({
  graph,
  familyId,
  initialFocus,
}: {
  graph: Graph;
  familyId: string;
  initialFocus?: string;
}) {
  const firstId = graph.people.find((p) => p.id === initialFocus)?.id ?? graph.people[0]?.id ?? "";
  const [focus, setFocus] = useState(firstId);
  const [visible, setVisible] = useState(() => new Set([firstId, ...neighbors(graph, firstId)]));
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState({ x: 24, y: 24, scale: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const layout = useMemo(() => mapLayout(graph, visible), [graph, visible]);
  const index = useMemo(() => relationIndex(graph), [graph]);
  const person = graph.people.find((p) => p.id === selected);
  const inspectorOpen = person !== undefined;
  const nameOf = new Map(graph.people.map((p) => [p.id, p.name]));

  function fit() {
    const box = viewport.current;
    if (!box) return;
    const scale = Math.min(
      1,
      (box.clientWidth - 48) / layout.width,
      (box.clientHeight - 48) / layout.height,
    );
    setCamera({
      x: (box.clientWidth - layout.width * scale) / 2,
      y: (box.clientHeight - layout.height * scale) / 2,
      scale: Math.max(0.2, scale),
    });
  }

  useEffect(() => {
    fit();
    const box = viewport.current;
    if (!box) return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, inspectorOpen]);

  function zoom(factor: number) {
    const box = viewport.current;
    if (!box) return;
    setCamera((old) => {
      const scale = Math.max(0.2, Math.min(2, old.scale * factor));
      const ratio = scale / old.scale;
      return {
        x: box.clientWidth / 2 - (box.clientWidth / 2 - old.x) * ratio,
        y: box.clientHeight / 2 - (box.clientHeight / 2 - old.y) * ratio,
        scale,
      };
    });
  }

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest("button, a")) return;
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, startX: camera.x, startY: camera.y };
  }

  function closeInspector() {
    setSelected(null);
    if (selected) nodeButtons.current.get(selected)?.focus();
  }

  function recenter(id: string) {
    setFocus(id);
    setVisible(new Set([id, ...neighbors(graph, id)]));
    setSelected(null);
  }

  function expand(id: string) {
    setVisible((old) => new Set([...old, ...neighbors(graph, id)]));
  }

  return (
    <section className="family-map card" aria-label="Interactive family map">
      <div className="map-toolbar">
        <label className="map-focus">
          <span className="subtle">Explore from</span>
          <select className="select" value={focus} onChange={(e) => recenter(e.target.value)}>
            {graph.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row" aria-label="Map controls">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => zoom(1 / 1.2)}
            aria-label="Zoom out"
          >
            −
          </button>
          <output className="map-scale" aria-label="Zoom level">
            {Math.round(camera.scale * 100)}%
          </output>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => zoom(1.2)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" className="btn btn-sm" onClick={fit}>
            Fit
          </button>
        </div>
      </div>
      <div className={`map-stage${person ? " has-inspector" : ""}`}>
        <div
          ref={viewport}
          className="map-viewport"
          tabIndex={0}
          role="region"
          aria-label="Family graph. Drag to pan, use arrow keys to move, plus or minus to zoom."
          onPointerDown={startDrag}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const start = drag.current;
            setCamera((old) => ({
              ...old,
              x: start.startX + e.clientX - start.x,
              y: start.startY + e.clientY - start.y,
            }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const delta: Record<string, [number, number]> = {
              ArrowLeft: [48, 0],
              ArrowRight: [-48, 0],
              ArrowUp: [0, 48],
              ArrowDown: [0, -48],
            };
            const movement = delta[e.key];
            if (movement) {
              e.preventDefault();
              setCamera((old) => ({ ...old, x: old.x + movement[0], y: old.y + movement[1] }));
            } else if (e.key === "+" || e.key === "=") zoom(1.2);
            else if (e.key === "-") zoom(1 / 1.2);
          }}
        >
          <div
            className="map-world"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            }}
          >
            <svg
              className="map-connectors"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {graph.edges.map((edge) => {
                const a = layout.positions.get(edge.parentPersonId);
                const b = layout.positions.get(edge.childPersonId);
                if (!a || !b) return null;
                const mid = (a.y + 112 + b.y) / 2;
                return (
                  <path
                    key={edge.id}
                    className="map-parent-line"
                    d={`M${a.x + 104},${a.y + 112} C${a.x + 104},${mid} ${b.x + 104},${mid} ${b.x + 104},${b.y}`}
                  />
                );
              })}
              {graph.partners.map((edge) => {
                const a = layout.positions.get(edge.personAId);
                const b = layout.positions.get(edge.personBId);
                if (!a || !b) return null;
                return (
                  <path
                    key={edge.id}
                    className="map-partner-line"
                    d={`M${a.x + 104},${a.y + 56} L${b.x + 104},${b.y + 56}`}
                  />
                );
              })}
            </svg>
            {layout.nodes.map((node) => {
              const hidden = neighbors(graph, node.person.id).filter(
                (id) => !visible.has(id),
              ).length;
              return (
                <div
                  key={node.person.id}
                  className={`map-node${node.person.id === focus ? " is-focus" : ""}`}
                  style={{ left: node.x, top: node.y }}
                >
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) nodeButtons.current.set(node.person.id, element);
                      else nodeButtons.current.delete(node.person.id);
                    }}
                    className="map-person"
                    aria-pressed={selected === node.person.id}
                    onClick={() => setSelected(node.person.id)}
                  >
                    <Avatar
                      name={node.person.name}
                      mediaId={node.person.profileMediaId}
                      deceased={Boolean(node.person.dateOfDeath)}
                    />
                    <span className="map-person-copy">
                      <strong>{node.person.name}</strong>
                      <span>{lifeSpan(node.person) || "Dates not recorded"}</span>
                      <span>
                        {node.person.id === focus
                          ? "Focus person"
                          : index.linkedTo.has(node.person.id)
                            ? "Linked account"
                            : "Family member"}
                      </span>
                    </span>
                  </button>
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="map-expand"
                      onClick={() => expand(node.person.id)}
                      aria-label={`Show ${hidden} more relatives of ${node.person.name}`}
                    >
                      +{hidden} relatives
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {person && (
          <aside
            className="map-inspector"
            aria-label={`About ${person.name}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeInspector();
            }}
          >
            <div className="map-inspector-heading">
              <span className="eyebrow">Person details</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={closeInspector}
                aria-label="Close person details"
              >
                Close
              </button>
            </div>
            <Avatar
              name={person.name}
              size="lg"
              mediaId={person.profileMediaId}
              deceased={Boolean(person.dateOfDeath)}
            />
            <h2>{person.name}</h2>
            <p className="subtle">
              {lifeSpan(person)}
              {person.occupation ? ` · ${person.occupation}` : ""}
            </p>
            {person.biography && <p className="map-biography">{person.biography}</p>}
            {(["parents", "partners", "children"] as const).map((kind) => (
              <div key={kind}>
                <h3>{kind[0].toUpperCase() + kind.slice(1)}</h3>
                <div className="map-relative-links">
                  {(index[kind].get(person.id) ?? []).map((id) => (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      key={id}
                      onClick={() => {
                        setVisible((old) => new Set([...old, id]));
                        setSelected(id);
                      }}
                    >
                      {nameOf.get(id)}
                    </button>
                  ))}
                  {!index[kind].has(person.id) && <span className="subtle">None recorded</span>}
                </div>
              </div>
            ))}
            <Link className="btn btn-primary" to={`/app/families/${familyId}/people/${person.id}`}>
              View full profile
            </Link>
            <button type="button" className="btn" onClick={() => recenter(person.id)}>
              Explore from this person
            </button>
          </aside>
        )}
      </div>
      <div className="map-legend">
        <span>
          <i className="map-parent-key" /> Parent / child
        </span>
        <span>
          <i className="map-partner-key" /> Partners
        </span>
        <span aria-live="polite">
          {layout.nodes.length} of {graph.people.length} people shown
        </span>
        <span>Drag to pan · +N reveals one generation</span>
      </div>
    </section>
  );
}
