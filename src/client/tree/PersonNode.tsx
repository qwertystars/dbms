import {
  createContext,
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Avatar, lifeSpan } from "~/client/components/ui";
import type { Direction } from "~/client/tree/expansion";
import type { VisibleNode } from "~/client/tree/projection";

export type Phase = "enter" | "leave" | "idle";

export interface PersonNodeData extends Record<string, unknown> {
  node: VisibleNode;
  selected: boolean;
  /** The person the last expand or collapse was about. */
  anchor: boolean;
  phase: Phase;
  /** Stagger for the entrance animation, in ms. */
  delay: number;
  /** Names of parents and children for the hover preview. */
  parents: string[];
  children: string[];
}

export type PersonFlowNode = Node<PersonNodeData, "person">;

export interface RelationshipEdgeData extends Record<string, unknown> {
  phase: Phase;
  delay: number;
  highlighted: boolean;
}

export type RelationshipFlowEdge = Edge<RelationshipEdgeData, "relationship">;

export interface TreeActions {
  toggle: (id: string, direction: Direction) => void;
  select: (id: string) => void;
  centre: (id: string) => void;
  navigate: (id: string, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight") => void;
  focused: (id: string) => void;
}

export const TreeActionsContext = createContext<TreeActions | null>(null);

function useActions(): TreeActions {
  const actions = useContext(TreeActionsContext);
  if (!actions) throw new Error("TreeActionsContext is missing");
  return actions;
}

const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Hover delay before the preview appears, so sweeping the pointer is quiet. */
const PREVIEW_DELAY_MS = 350;

export function PersonNode({ data }: NodeProps<PersonFlowNode>) {
  // Positions change every animation frame; the card itself only re-renders
  // when its data does.
  return <PersonCard data={data} />;
}

const PersonCard = memo(function PersonCard({ data }: { data: PersonNodeData }) {
  const actions = useActions();
  const { node, selected, anchor, phase, delay } = data;
  const person = node.person;
  const span = lifeSpan(person);
  const deceased = Boolean(person.dateOfDeath);
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const showPreview = (pointerType: string) => {
    if (pointerType !== "mouse") return; // touch taps select instead
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(true), PREVIEW_DELAY_MS);
  };
  const hidePreview = () => {
    clearTimeout(timer.current);
    setPreview(false);
  };

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (ARROWS.has(event.key)) {
      event.preventDefault();
      actions.navigate(node.id, event.key as "ArrowUp");
    } else if ((event.key === "+" || event.key === "=") && node.down === "expand") {
      event.preventDefault();
      actions.toggle(node.id, "down");
    } else if (event.key === "-" && node.down === "collapse") {
      event.preventDefault();
      actions.toggle(node.id, "down");
    } else if (event.key === "Escape") {
      hidePreview();
    }
  }

  const classes = ["tree-node"];
  if (deceased) classes.push("is-deceased");
  if (selected) classes.push("is-selected");
  if (anchor) classes.push("is-anchor");
  if (phase !== "idle") classes.push(`is-${phase}`);

  return (
    <div className={classes.join(" ")} style={{ "--enter-delay": `${delay}ms` } as CSSProperties}>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="tree-handle"
      />
      {node.up !== "none" && (
        <ToggleButton
          side="up"
          state={node.up}
          count={node.hiddenParentCount}
          name={person.name}
          onToggle={() => actions.toggle(node.id, "up")}
        />
      )}
      <button
        type="button"
        className="tree-card"
        data-person-id={node.id}
        aria-pressed={selected}
        aria-label={[person.name, span, deceased ? "in memory" : ""].filter(Boolean).join(", ")}
        onClick={() => {
          hidePreview();
          actions.select(node.id);
        }}
        onDoubleClick={() => actions.centre(node.id)}
        onKeyDown={onKeyDown}
        onFocus={() => actions.focused(node.id)}
        onBlur={hidePreview}
        onPointerEnter={(e) => showPreview(e.pointerType)}
        onPointerLeave={hidePreview}
      >
        <Avatar name={person.name} mediaId={person.profileMediaId} deceased={deceased} />
        <span className="tree-card-text">
          <span className="tree-card-name">{person.name}</span>
          {span && <span className="tree-card-meta">{span}</span>}
          {node.descendantCount > 0 && (
            <span className="tree-card-meta tree-card-count">
              {node.descendantCount === 1 ? "1 descendant" : `${node.descendantCount} descendants`}
            </span>
          )}
        </span>
      </button>
      {node.down !== "none" && (
        <ToggleButton
          side="down"
          state={node.down}
          count={node.hiddenChildCount}
          name={person.name}
          onToggle={() => actions.toggle(node.id, "down")}
        />
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="tree-handle"
      />
      <NodeToolbar
        isVisible={preview}
        position={Position.Top}
        offset={12}
        className="tree-preview-host"
      >
        <HoverPreview data={data} />
      </NodeToolbar>
    </div>
  );
});

function ToggleButton({
  side,
  state,
  count,
  name,
  onToggle,
}: {
  side: Direction;
  state: "expand" | "collapse";
  count: number;
  name: string;
  onToggle: () => void;
}) {
  const what =
    side === "down" ? (count === 1 ? "child" : "children") : count === 1 ? "parent" : "parents";
  const label =
    state === "expand"
      ? `Show ${count} ${what} of ${name}`
      : `Hide ${side === "down" ? "children" : "parents"} of ${name}`;
  return (
    <button
      type="button"
      className={`tree-toggle tree-toggle-${side} nodrag nopan`}
      aria-label={label}
      aria-expanded={state === "collapse"}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span aria-hidden="true">{state === "expand" ? "+" : "−"}</span>
      {state === "expand" && count > 0 && (
        <span className="tree-toggle-count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}

function HoverPreview({ data }: { data: PersonNodeData }) {
  const person = data.node.person;
  const span = lifeSpan(person);
  const bio = excerpt(person.biography, 160);
  return (
    <div className="tree-preview" role="tooltip">
      <p className="tree-preview-name">{person.name}</p>
      {(span || person.occupation) && (
        <p className="tree-preview-meta">{[span, person.occupation].filter(Boolean).join(" · ")}</p>
      )}
      {bio && <p className="tree-preview-bio">{bio}</p>}
      {data.parents.length > 0 && (
        <p className="tree-preview-rel">
          <span>Child of</span> {listNames(data.parents)}
        </p>
      )}
      {data.children.length > 0 && (
        <p className="tree-preview-rel">
          <span>Parent of</span> {listNames(data.children)}
        </p>
      )}
    </div>
  );
}

export function excerpt(text: unknown, max: number): string {
  if (typeof text !== "string") return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export function RelationshipEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<RelationshipFlowEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left,
    curvature: 0.4,
  });
  const classes = ["tree-edge"];
  if (data?.highlighted) classes.push("is-highlighted");
  if (data && data.phase !== "idle") classes.push(`is-${data.phase}`);
  return (
    <path
      d={path}
      className={classes.join(" ")}
      pathLength={1}
      fill="none"
      style={{ "--enter-delay": `${data?.delay ?? 0}ms` } as CSSProperties}
    />
  );
}
