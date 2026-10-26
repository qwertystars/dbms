# Frontend Architecture

## Purpose

The frontend is a private authenticated web application optimized around:

- family tree exploration
- profile viewing/editing
- family feed
- friend panel
- family administration

## Main routes

```text
/sign-in
/invitations/:token

/app
/app/families
/app/families/:familyId
/app/families/:familyId/tree
/app/families/:familyId/people/:personId
/app/families/:familyId/feed
/app/families/:familyId/members
/app/friends
/app/settings
```

## Family tree UI

The tree renderer consumes an API projection of people and parent/child edges.

Requirements:

- support multiple roots
- support people with two or more parent links
- support collapsed branches
- distinguish living/deceased profiles without exposing sensitive data unnecessarily
- open profile details from a node
- avoid assuming generation number is permanent identity

Tree layout is presentation logic. It must never become the persistence model.

Implementation (see ADR-007), all under `src/client/tree/`:

| Module                   | Responsibility                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `graph.ts`               | Normalized index: dedupe, parents/children, generation columns, descendant counts |
| `expansion.ts`           | View state (seeds, expanded down/up) and its reducer; visibility by reachability  |
| `projection.ts`          | Graph + view state -> visible cards, toggle states and edges                      |
| `layout.ts`              | ELK layered layout (Web Worker), fixed generation columns, fallback, cache        |
| `camera.ts`              | Pure viewport maths: keep anchor in place, minimal reveal, fit, keyboard moves    |
| `motion.ts`              | Reduced-motion detection and the position tween                                   |
| `useFamilyTree.ts`       | Loads the family once, ignores stale responses, merges created edges              |
| `FamilyGraphCanvas.tsx`  | React Flow canvas, transitions, camera, toolbar                                   |
| `PersonNode.tsx`         | Card, expand/collapse buttons, hover preview, connector                           |
| `PersonInspector.tsx`    | Profile pane (bottom sheet on phones)                                             |
| `RelationshipEditor.tsx` | Parent/child form in the side pane                                                |
| `TreeWorkspace.tsx`      | Composes the above; lazy-loaded by `pages/TreePage.tsx`                           |

Domain rules here are UI-independent pure functions; React components only render them.

## Permission-aware UI

The UI may hide controls the current role cannot use, but server authorization remains authoritative.

Examples:

- Viewer: no tree edit controls
- Editor: create/edit profile and tree controls, no member-administration controls
- Creator: family administration and destructive controls

## Forms

Person form reflects the canonical API schema.

Required in v1:

- name
- gender

Optional:

- DOB
- DOD
- height
- weight
- address
- email
- phone
- occupation
- biography
- photo

Client validation should mirror server validation for usability, not replace it.

## State strategy

Prefer server-fetched route data plus focused client state.

Do not introduce a global client store for all application data.

Use optimistic updates only where rollback behavior is clear, such as reactions.

Do not optimistically mutate ancestry edges before server validation because cycle checks may reject the operation.

## Visual design system

- The visual system is "Living Archive", specified in `docs/design/design-system.md`. Semantic tokens (`--canvas`, `--surface`, `--text`, `--primary`, `--danger`, `--lineage-*`, ...) in `src/client/styles.css` are the colour source of truth. Two themes: `notebook` (light) and `slate` (dark). The theme follows the OS unless the user picks one, which sets `data-theme` on `<html>` (`src/client/theme.tsx`; an inline script in `index.html` applies the stored choice before first paint).
- Do not add raw hex values in components; use the tokens. Lineage accents are decorative only and never encode gender or relationships.
- Type is Inter for UI and Newsreader for titles, with Noto Sans Tamil, Devanagari and Bengali for Indic scripts, all from Google Fonts. Indian-script elements get taller line heights via `:lang(...)`.
- `AppLayout` is the app shell: a sidebar on desktop, a labelled icon rail on tablet, and a top bar plus bottom navigation below 640px.
- Brand files live in `public/brand/`. The mark is drawn inline (`BanyanMark` in `components/AppLayout.tsx`) with tokens so it adapts to both themes.
- Reusable React pieces live in `src/client/components/ui.tsx`. Prefer extending these over one-off markup.
- Every data-loading page renders `Loading` while fetching, `ErrorState` when its primary data fails, and `EmptyState` for empty lists.
- Layouts must work at phone width (320px) without horizontal scrolling.
