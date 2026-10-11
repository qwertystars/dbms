import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Avatar, Icon, lifeSpan } from "~/client/components/ui";
import { layoutGenerations, type TreeEdge, type TreePerson } from "./tree-layout";

const NODE_WIDTH = 208;
const NODE_HEIGHT = 100;
const COLUMN = 248;
const ROW = 208;

export function TreeCanvas({
  people,
  edges,
  familyId,
}: {
  people: TreePerson[];
  edges: TreeEdge[];
  familyId: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useMemo(() => {
    const { generations } = layoutGenerations(people, edges);
    const width = Math.max(720, ...generations.map((g) => g.people.length * COLUMN + 120));
    const height = generations.length * ROW + 80;
    const nodes = generations.flatMap((g, row) =>
      g.people.map((person, col) => ({
        person,
        row,
        x: (width - g.people.length * COLUMN) / 2 + col * COLUMN + 20,
        y: 72 + row * ROW,
      })),
    );
    return {
      generations: generations.length,
      nodes,
      width,
      height,
      positions: new Map(nodes.map((n) => [n.person.id, n])),
    };
  }, [people, edges]);
  useEffect(() => {
    const element = viewport.current;
    if (element) element.scrollLeft = Math.max(0, (graph.width - element.clientWidth) / 2);
  }, [graph.width]);

  function resetView() {
    setZoom(1);
    viewport.current?.scrollTo({
      left: Math.max(0, (graph.width - viewport.current.clientWidth) / 2),
      top: 0,
    });
  }

  const selected = people.find((p) => p.id === selectedId);
  const relatives = new Set(
    edges.flatMap((e) =>
      e.parentPersonId === selectedId
        ? [e.childPersonId]
        : e.childPersonId === selectedId
          ? [e.parentPersonId]
          : [],
    ),
  );
  const matches = query.trim()
    ? people.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : [];

  function focusPerson(id: string) {
    setSelectedId(id);
    const node = graph.positions.get(id);
    if (node && viewport.current) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      viewport.current.scrollTo({
        left: (node.x + NODE_WIDTH / 2) * zoom - viewport.current.clientWidth / 2,
        top: (node.y + NODE_HEIGHT / 2) * zoom - viewport.current.clientHeight / 2,
        behavior: reduced ? "instant" : "smooth",
      });
    }
  }

  return (
    <section className="tree-workspace" aria-label="Interactive family tree">
      <div className="tree-toolbar">
        <div className="row">
          <span className="tree-emblem">
            <Icon name="tree" />
          </span>
          <div>
            <h2>The family register</h2>
            <p className="subtle">
              {people.length} people · {graph.generations} generations
            </p>
          </div>
        </div>
        <div className="tree-search">
          <label className="visually-hidden" htmlFor="tree-search">
            Find a person
          </label>
          <input
            id="tree-search"
            className="input"
            type="search"
            placeholder="Find someone in your family…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <div className="tree-results" aria-label="Search results">
              <p className="subtle" role="status">
                {matches.length} {matches.length === 1 ? "person" : "people"} found
              </p>
              {matches.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    focusPerson(p.id);
                    setQuery("");
                  }}
                >
                  <Avatar name={p.name} size="sm" />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        className="tree-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Family tree canvas. Scroll to explore; select a person to see their connections."
        onPointerDown={(e) => {
          if (
            e.pointerType !== "mouse" ||
            e.button !== 0 ||
            (e.target as HTMLElement).closest("button, a")
          )
            return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            e.currentTarget.scrollLeft = drag.current.left - e.clientX + drag.current.x;
            e.currentTarget.scrollTop = drag.current.top - e.clientY + drag.current.y;
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div style={{ width: graph.width * zoom, height: graph.height * zoom }}>
          <div
            className="tree-stage"
            style={{ width: graph.width, height: graph.height, transform: `scale(${zoom})` }}
          >
            {Array.from(new Set(graph.nodes.map((n) => n.row))).map((row) => (
              <div className="tree-band" key={row} style={{ top: 34 + row * ROW }}>
                <span>Generation {String(row + 1).padStart(2, "0")}</span>
              </div>
            ))}
            <svg
              className="tree-edges"
              width={graph.width}
              height={graph.height}
              aria-hidden="true"
            >
              {edges.map((e) => {
                const parent = graph.positions.get(e.parentPersonId),
                  child = graph.positions.get(e.childPersonId);
                if (!parent || !child) return null;
                const x1 = parent.x + NODE_WIDTH / 2,
                  y1 = parent.y + NODE_HEIGHT;
                const x2 = child.x + NODE_WIDTH / 2,
                  y2 = child.y;
                const active = e.parentPersonId === selectedId || e.childPersonId === selectedId;
                return (
                  <path
                    key={`${e.parentPersonId}-${e.childPersonId}`}
                    className={active ? "is-active" : ""}
                    pathLength="1"
                    d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                  />
                );
              })}
            </svg>
            {graph.nodes.map(({ person: p, x, y, row }) => (
              <button
                type="button"
                key={p.id}
                className={`tree-person${selectedId === p.id ? " is-selected" : ""}${relatives.has(p.id) ? " is-relative" : ""}`}
                aria-pressed={selectedId === p.id}
                onClick={() => setSelectedId(p.id)}
                style={
                  {
                    left: x,
                    top: y,
                    width: NODE_WIDTH,
                    minHeight: NODE_HEIGHT,
                    "--enter-delay": `${Math.min(row * 100, 500)}ms`,
                  } as CSSProperties
                }
              >
                <Avatar
                  name={p.name}
                  mediaId={p.profileMediaId}
                  deceased={Boolean(p.dateOfDeath)}
                />
                <span className="tree-person-copy">
                  <strong>{p.name}</strong>
                  <span>{lifeSpan(p) || "Life dates not recorded"}</span>
                </span>
                <span className="tree-node-port" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="tree-footer">
        <span className="subtle">
          Drag to explore · Select a person to follow their connections
        </span>
        <div className="tree-zoom" role="group" aria-label="Tree zoom">
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            −
          </button>
          <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 1.5}
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          >
            +
          </button>
          <button type="button" onClick={resetView}>
            Reset
          </button>
        </div>
      </div>
      {selected && (
        <aside className="tree-inspector" aria-label="Selected person">
          <Avatar
            name={selected.name}
            mediaId={selected.profileMediaId}
            size="lg"
            deceased={Boolean(selected.dateOfDeath)}
          />
          <div className="tree-inspector-copy">
            <span className="eyebrow">In your family</span>
            <h3>{selected.name}</h3>
            <p className="muted">
              {lifeSpan(selected)}
              {selected.occupation && ` · ${selected.occupation}`}
            </p>
            <div className="tree-relatives">
              {edges
                .filter((e) => e.childPersonId === selectedId || e.parentPersonId === selectedId)
                .map((e) => {
                  const isParent = e.childPersonId === selectedId;
                  const person = people.find(
                    (p) => p.id === (isParent ? e.parentPersonId : e.childPersonId),
                  );
                  return (
                    person && (
                      <button
                        type="button"
                        key={`${e.parentPersonId}-${e.childPersonId}`}
                        onClick={() => focusPerson(person.id)}
                      >
                        {isParent ? "Parent" : "Child"}: {person.name}
                      </button>
                    )
                  );
                })}
            </div>
          </div>
          <Link className="btn btn-primary" to={`/app/families/${familyId}/people/${selected.id}`}>
            View profile <span aria-hidden="true">↗</span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Close profile preview"
            onClick={() => setSelectedId(null)}
          >
            ×
          </button>
        </aside>
      )}
    </section>
  );
}
