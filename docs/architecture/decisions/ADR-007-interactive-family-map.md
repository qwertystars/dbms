# ADR-007 — Interactive family map: React Flow, ELK and client-side progressive expansion

Status: Accepted

## Context

The tree page stacked every generation vertically and showed the whole family at once. The
product needs a horizontal, explorable family map: founders on the left, descendants revealed
one generation at a time with "+", ancestors revealed on request, smooth pan and zoom on
desktop and touch, a profile inspector, and animated transitions. The data model (ADR-001) is
an explicit parent/child edge list that allows several parents per person and shared
descendants, and has no typed partner or union relationship.

`GET /families/{familyId}/tree` without `rootPersonId` is the only existing call that returns
the founders and the people with no relationships. With a root it returns only the root's
ancestors and/or descendants and the edges between them, so it cannot report a child's other
parents. The API is rate limited to 100 requests per minute per account.

## Decision

- **Rendering and interaction:** `@xyflow/react` (React Flow 12). It provides pan, zoom, pinch,
  touch, viewport transitions, custom nodes and edges, and viewport culling for large graphs.
  Cards, connectors, toolbar and preview are our own components styled with the design tokens.
- **Layout:** `elkjs` (ELK layered, direction right). Each person's generation column is
  computed over the whole family and passed to ELK through interactive layering, so a person's
  x never changes when branches open or close. ELK orders people inside a column (crossing
  minimization with model order, siblings eldest first) and places them vertically. It runs in a
  Web Worker in browsers and is loaded only with the tree page. A plain column layout is the
  fallback if ELK cannot load.
- **Data:** the page loads the whole family once with the root-less tree call. Expansion is a
  client-side projection (`src/client/tree/expansion.ts`, `projection.ts`) over a normalized
  graph index (`graph.ts`); expanding or collapsing never issues a request. New relationships
  created from the map are merged from the POST response without a refetch.
- **Visibility rules:** visible people are those reachable from the seeds (founders, or a
  focused person) through expanded edges. Revealing a child also reveals the child's other
  recorded parents. Collapsing recomputes reachability, so people still reachable through
  another expanded path stay. Every recorded edge between two visible people is drawn, so a
  shared descendant is one card with several incoming connectors.
- **No new relationship types:** co-parents are shown because they are recorded parents of a
  visible child, not because a partnership is inferred. A future union node or edge type can be
  added as another node/edge type in the projection without changing these rules.
- **Motion:** positions are tweened with `requestAnimationFrame` for one transition at a time
  (440 ms), entrances are staggered CSS animations, connectors draw in, and the camera keeps
  the expanded person in place and pans just far enough to show the new generation. Under
  `prefers-reduced-motion` all of this is instant.

## Consequences

- No API or schema changes were needed. Server authorization is unchanged and remains the only
  security boundary; the map shows only what the tree endpoint already returns to a member.
- The whole family is fetched up front. Rendering cost, not transfer, is what limits large
  families, and only revealed people are rendered (plus viewport culling above 160 cards).
  Because expansion makes no requests there are no per-branch loading or error states; loading
  and failure handling happen at the family level, with retry.
- The ELK worker is about 1.6 MB minified (about 450 KB compressed) and is downloaded the first
  time a tree page opens. The main bundle grew by under 2 KB.
- Client components are now covered by jsdom tests (`tests/client/`).

## Rejected alternatives

- **Per-branch requests (`rootPersonId` + `depth`):** each response lacks the children's other
  parents and the founders list, so it would need one extra request per revealed child, and
  rapid exploration would hit the rate limit. It also adds stale-branch states with no benefit
  while the whole-family call exists.
- **dagre:** smaller and synchronous, but weaker crossing minimization and no way to pin
  generation columns.
- **A hand-written canvas and gesture layer:** pan, pinch, inertia and culling are hard to get
  right on touch devices; React Flow already does this.
- **Duplicating a person under each parent (strict tree):** misrepresents shared descendants and
  breaks stable node identity.
