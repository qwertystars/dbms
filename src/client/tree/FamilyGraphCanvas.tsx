import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  Background,
  BackgroundVariant,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { Icon, Loading } from "~/client/components/ui";
import {
  fitBox,
  keepInPlace,
  neighbour,
  nodeCenter,
  revealBox,
  type Size,
  type Viewport,
} from "~/client/tree/camera";
import type { Direction, ExpansionState } from "~/client/tree/expansion";
import { childrenOf, parentsOf, type FamilyGraph } from "~/client/tree/graph";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  boundsOf,
  layoutGraph,
  type Positions,
} from "~/client/tree/layout";
import {
  MAX_ANIMATED_NODES,
  MAX_STAGGER_STEPS,
  MOVE_MS,
  STAGGER_MS,
  easeInOutCubic,
  usePositionTween,
  usePrefersReducedMotion,
} from "~/client/tree/motion";
import {
  PersonNode,
  RelationshipEdge,
  TreeActionsContext,
  type PersonFlowNode,
  type PersonNodeData,
  type RelationshipFlowEdge,
  type TreeActions,
} from "~/client/tree/PersonNode";
import {
  projectVisibleGraph,
  type VisibleEdge,
  type VisibleGraph,
  type VisibleNode,
} from "~/client/tree/projection";

const nodeTypes: NodeTypes = { person: PersonNode };
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge };

/** Length of the card entrance animation in styles.css (`tree-node-in`). */
const ENTER_MS = 320;
/** A reveal zooms out no further than this; the viewer can pan for the rest. */
const REVEAL_MIN_ZOOM = 0.6;
/** Render only on-screen cards beyond this many. */
const VIRTUALIZE_ABOVE = 160;

export interface FamilyGraphHandle {
  centreOn: (id: string) => void;
}

export interface FamilyGraphCanvasProps {
  graph: FamilyGraph;
  expansion: ExpansionState;
  selectedId: string | null;
  onToggle: (id: string, direction: Direction) => void;
  onSelect: (id: string | null) => void;
  onReset: () => void;
  /** Extra toolbar controls, e.g. "Connect people" for editors. */
  toolbar?: ReactNode;
  handle?: Ref<FamilyGraphHandle>;
}

/** One committed layout plus what is entering or leaving it. */
interface Scene {
  view: VisibleGraph;
  targets: Positions;
  entering: Map<string, number>;
  leavingNodes: VisibleNode[];
  leavingEdges: VisibleEdge[];
  anchorId: string | null;
}

/**
 * Counter-scales the expand buttons as the map zooms out so they keep a
 * usable size on screen: at least 40px for touch, 24px for a mouse. Writes a
 * CSS variable directly, so zooming does not re-render the graph.
 */
function ToggleScale({ target }: { target: RefObject<HTMLDivElement | null> }) {
  const zoom = useStore((state) => state.transform[2]);
  useEffect(() => {
    const coarse = Boolean(window.matchMedia?.("(pointer: coarse)").matches);
    const [base, minimum, max] = coarse ? [40, 40, 2.2] : [34, 24, 1.5];
    const scale = Math.min(max, Math.max(1, minimum / (base * zoom)));
    target.current?.style.setProperty("--tree-toggle-scale", scale.toFixed(3));
  }, [zoom, target]);
  return null;
}

export function FamilyGraphCanvas(props: FamilyGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  graph,
  expansion,
  selectedId,
  onToggle,
  onSelect,
  onReset,
  toolbar,
  handle,
}: FamilyGraphCanvasProps) {
  const flow = useReactFlow<PersonFlowNode, RelationshipFlowEdge>();
  const reducedMotion = usePrefersReducedMotion();
  const wrapper = useRef<HTMLDivElement>(null);
  const { positions, shown, animate } = usePositionTween();
  const [scene, setScene] = useState<Scene | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const duration = reducedMotion ? 0 : MOVE_MS;

  const view = useMemo(() => projectVisibleGraph(graph, expansion), [graph, expansion]);

  // The part of the canvas not covered by the inspector (a side pane on
  // wide screens, a bottom sheet on phones), so reveals land in view.
  const size = useCallback((): Size => {
    const rect = wrapper.current?.getBoundingClientRect();
    let width = rect?.width || 800;
    let height = rect?.height || 600;
    const pane = wrapper.current?.parentElement?.querySelector(".tree-panel");
    if (rect && pane) {
      const cover = pane.getBoundingClientRect();
      if (cover.left > rect.left + rect.width / 2) width = Math.min(width, cover.left - rect.left);
      else if (cover.top > rect.top + rect.height / 2) {
        height = Math.min(height, cover.top - rect.top);
      }
    }
    return { width: Math.max(width, 200), height: Math.max(height, 200) };
  }, []);

  const moveCamera = useCallback(
    (viewport: Viewport, ms = duration) => {
      void flow.setViewport(viewport, { duration: ms, ease: easeInOutCubic });
    },
    [flow, duration],
  );

  const commit = useCallback(
    (next: VisibleGraph, targets: Positions, state: ExpansionState) => {
      const prev = sceneRef.current;
      const displayed = shown.current;
      const prevIds = new Set(prev?.view.nodes.map((n) => n.id));
      const nextIds = new Set(next.nodes.map((n) => n.id));
      const added = next.nodes.filter((n) => !prevIds.has(n.id)).map((n) => n.id);
      const moving = !reducedMotion && prev !== null && next.nodes.length <= MAX_ANIMATED_NODES;
      const { anchorId, lastAction } = state;
      const anchorFrom = anchorId ? displayed.get(anchorId) : undefined;
      const anchorTo = anchorId ? targets.get(anchorId) : undefined;

      const entering = new Map<string, number>();
      if (moving) {
        added.forEach((id, index) =>
          entering.set(id, Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS),
        );
      }
      const leavingNodes = moving && prev ? prev.view.nodes.filter((n) => !nextIds.has(n.id)) : [];
      const leavingIds = new Set(leavingNodes.map((n) => n.id));
      const leavingEdges = prev
        ? prev.view.edges.filter((e) => leavingIds.has(e.source) || leavingIds.has(e.target))
        : [];

      // New people grow out of the person that was expanded; people being
      // hidden fold back into the person that was collapsed.
      const from: Positions = new Map();
      const to: Positions = new Map(targets);
      for (const node of next.nodes) {
        from.set(node.id, displayed.get(node.id) ?? anchorFrom ?? targets.get(node.id)!);
      }
      for (const node of leavingNodes) {
        const here = displayed.get(node.id) ?? prev!.targets.get(node.id)!;
        from.set(node.id, here);
        to.set(node.id, anchorTo ?? here);
      }

      const committed: Scene = {
        view: next,
        targets,
        entering,
        leavingNodes,
        leavingEdges,
        anchorId,
      };
      sceneRef.current = committed;
      setScene(committed);
      animate(from, to, moving ? MOVE_MS : 0);

      clearTimeout(settleTimer.current);
      if (entering.size > 0 || leavingNodes.length > 0) {
        const lastDelay = Math.max(0, ...entering.values());
        settleTimer.current = setTimeout(
          () => {
            if (sceneRef.current !== committed) return;
            const settled = {
              ...committed,
              entering: new Map(),
              leavingNodes: [],
              leavingEdges: [],
            };
            sceneRef.current = settled;
            setScene(settled);
          },
          Math.max(MOVE_MS, lastDelay + ENTER_MS) + 40,
        );
      }

      // Camera: keep the expanded person where the viewer was looking, then
      // pan just far enough to show the people that appeared.
      const viewport = flow.getViewport();
      const all = boundsOf(targets, targets.keys());
      if (!prev || lastAction === "init" || lastAction === "reset" || lastAction === "focus") {
        if (all) moveCamera(fitBox(size(), all, { maxZoom: 1 }), prev ? duration : 0);
      } else if (anchorId && anchorFrom && anchorTo) {
        let camera = keepInPlace(viewport, anchorFrom, anchorTo);
        if (lastAction === "expand") {
          const box = boundsOf(targets, [anchorId, ...added]);
          if (box) camera = revealBox(camera, size(), box, { minZoom: REVEAL_MIN_ZOOM });
        }
        moveCamera(camera);
      }
    },
    [animate, duration, flow, moveCamera, reducedMotion, shown, size],
  );

  // Lay out every new projection. Only the latest result is applied.
  useEffect(() => {
    let cancelled = false;
    void layoutGraph(view).then((targets) => {
      if (!cancelled) commit(view, targets, expansion);
    });
    return () => {
      cancelled = true;
    };
    // `expansion` always changes together with `view`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const centreOn = useCallback(
    (id: string) => {
      const target = sceneRef.current?.targets.get(id);
      if (!target) return;
      const centre = nodeCenter(target);
      void flow.setCenter(centre.x, centre.y, {
        zoom: Math.max(flow.getZoom(), 0.9),
        duration,
        ease: easeInOutCubic,
      });
    },
    [flow, duration],
  );

  useImperativeHandle(handle, () => ({ centreOn }), [centreOn]);

  /** Pans the least distance that shows the whole card. */
  const revealNode = useCallback(
    (id: string) => {
      const box = sceneRef.current && boundsOf(sceneRef.current.targets, [id]);
      if (!box) return;
      const viewport = flow.getViewport();
      const next = revealBox(viewport, size(), box, { padding: 32 });
      if (next.x !== viewport.x || next.y !== viewport.y || next.zoom !== viewport.zoom) {
        moveCamera(next);
      }
    },
    [flow, moveCamera, size],
  );

  const actions = useMemo<TreeActions>(
    () => ({
      toggle: (id, direction) => {
        const node = sceneRef.current?.view.nodes.find((n) => n.id === id);
        if (!node) return;
        const state = direction === "down" ? node.down : node.up;
        if (state !== "none") onToggle(id, direction);
      },
      select: (id) => onSelect(id),
      centre: centreOn,
      navigate: (id, key) => {
        const targets = sceneRef.current?.targets;
        if (!targets) return;
        const next = neighbour(targets, id, key, {
          children: childrenOf(graph, id),
          parents: parentsOf(graph, id),
        });
        if (!next) return;
        wrapper.current
          ?.querySelector<HTMLButtonElement>(`[data-person-id="${next}"]`)
          ?.focus({ preventScroll: true });
      },
      focused: (id) => {
        // Focus can scroll the clipped canvas; undo that and pan instead.
        const pane = wrapper.current?.querySelector(".react-flow");
        if (pane) {
          pane.scrollTop = 0;
          pane.scrollLeft = 0;
        }
        revealNode(id);
      },
    }),
    [centreOn, graph, onSelect, onToggle, revealNode],
  );

  // Selecting someone opens the inspector; keep their card out from under it.
  useEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => revealNode(selectedId));
    return () => cancelAnimationFrame(frame);
  }, [selectedId, revealNode]);

  const nodeData = useMemo(() => {
    const data = new Map<string, PersonNodeData>();
    if (!scene) return data;
    const nameOf = (id: string) => graph.people.get(id)?.name ?? "Unknown";
    const add = (node: VisibleNode, phase: PersonNodeData["phase"]) => {
      data.set(node.id, {
        node,
        selected: node.id === selectedId,
        anchor: node.id === scene.anchorId,
        phase,
        delay: scene.entering.get(node.id) ?? 0,
        parents: parentsOf(graph, node.id).map(nameOf),
        children: childrenOf(graph, node.id).map(nameOf),
      });
    };
    for (const node of scene.view.nodes) add(node, scene.entering.has(node.id) ? "enter" : "idle");
    for (const node of scene.leavingNodes) add(node, "leave");
    return data;
  }, [scene, selectedId, graph]);

  const nodes = useMemo<PersonFlowNode[]>(() => {
    if (!scene) return [];
    const list: PersonFlowNode[] = [];
    for (const [id, data] of nodeData) {
      const position = positions.get(id) ?? scene.targets.get(id) ?? { x: 0, y: 0 };
      list.push({
        id,
        type: "person",
        position,
        data,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        draggable: false,
        selectable: false,
        focusable: false,
      });
    }
    // DOM order follows the layout so Tab moves column by column, top to bottom.
    const at = (id: string) => scene.targets.get(id) ?? positions.get(id) ?? { x: 0, y: 0 };
    return list.sort((a, b) => at(a.id).x - at(b.id).x || at(a.id).y - at(b.id).y);
  }, [scene, nodeData, positions]);

  const edges = useMemo<RelationshipFlowEdge[]>(() => {
    if (!scene) return [];
    const nameOf = (id: string) => graph.people.get(id)?.name ?? "Unknown";
    const touches = (e: VisibleEdge, id: string | null) =>
      id !== null && (e.source === id || e.target === id);
    const make = (e: VisibleEdge, leaving: boolean): RelationshipFlowEdge => {
      const delay = scene.entering.get(e.target) ?? scene.entering.get(e.source);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "relationship",
        selectable: false,
        focusable: false,
        ariaLabel: `${nameOf(e.source)} is a parent of ${nameOf(e.target)}`,
        data: {
          phase: leaving ? "leave" : delay !== undefined ? "enter" : "idle",
          delay: delay ?? 0,
          highlighted: touches(e, selectedId) || touches(e, scene.anchorId),
        },
      };
    };
    return [
      ...scene.view.edges.map((e) => make(e, false)),
      ...scene.leavingEdges.map((e) => make(e, true)),
    ];
  }, [scene, selectedId, graph]);

  const total = graph.linked.length;
  const showing = scene?.view.nodes.length ?? 0;

  return (
    <TreeActionsContext.Provider value={actions}>
      <div
        ref={wrapper}
        className="tree-canvas"
        role="region"
        aria-label="Family tree"
        aria-describedby="tree-canvas-help"
      >
        <p id="tree-canvas-help" className="visually-hidden">
          Each person is a button that opens their details. Use the arrow keys to move between
          people, plus and minus to show or hide children, and the buttons on either side of a card
          to show children or parents.
        </p>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          minZoom={0.2}
          maxZoom={1.75}
          onlyRenderVisibleElements={nodes.length > VIRTUALIZE_ABOVE}
          onPaneClick={() => onSelect(null)}
          attributionPosition="bottom-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} />
          <ToggleScale target={wrapper} />
          <Panel position="top-left" className="tree-toolbar" aria-label="Tree controls">
            <button
              type="button"
              className="tree-tool"
              onClick={() => void flow.zoomIn({ duration })}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Icon name="zoomIn" />
            </button>
            <button
              type="button"
              className="tree-tool"
              onClick={() => void flow.zoomOut({ duration })}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Icon name="zoomOut" />
            </button>
            <button
              type="button"
              className="tree-tool"
              onClick={() => {
                const box = scene && boundsOf(scene.targets, scene.targets.keys());
                if (box) moveCamera(fitBox(size(), box, { maxZoom: 1 }));
              }}
              aria-label="Fit the tree to the screen"
              title="Fit to screen"
            >
              <Icon name="fit" />
            </button>
            <button
              type="button"
              className="tree-tool tree-tool-text"
              onClick={onReset}
              title="Back to the family's founders"
            >
              <Icon name="reset" />
              <span>Reset</span>
            </button>
            {toolbar}
          </Panel>
          <Panel position="bottom-left" className="tree-status">
            <span role="status">
              Showing {showing} of {total} {total === 1 ? "person" : "people"} in the tree
            </span>
          </Panel>
        </ReactFlow>
        {!scene && (
          <div className="tree-canvas-loading">
            <Loading label="Arranging the family…" />
          </div>
        )}
      </div>
    </TreeActionsContext.Provider>
  );
}
