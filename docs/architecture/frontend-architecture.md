# Frontend Architecture

## Purpose

The frontend is a private authenticated web application optimized around:

- family tree exploration
- profile viewing/editing
- family memories, people directory and gatherings
- friend panel
- family administration

## Main routes

```text
/sign-in
/sign-up
/invitations/:token

/app
/app/families
/app/families/:familyId
/app/families/:familyId/tree
/app/families/:familyId/people
/app/families/:familyId/people/:personId
/app/families/:familyId/memories
/app/families/:familyId/feed
/app/families/:familyId/events
/app/friends
/app/account
```

`/feed` is a replace-navigation redirect to `/memories`; both refer to the same
posts API, not a new memory persistence module. Member administration remains on
the family Overview, not a standalone `/members` page.

## Family navigation and directory

`FamilyHeader` and the shell use shared `FAMILY_SECTIONS`: Overview, Tree,
Memories, People and Events. `FamilySwitcher` loads the account's families and
preserves a recognized section when switching; a person detail becomes the other
family's People page, never a cross-family person link. The desktop sidebar holds
the switcher and family destinations. Below 1024px, the switcher appears above
the page content; family section tabs remain available on every family page.

`loadFamilyGraph` loads family/membership, the whole tree and members, then
`relationIndex` derives parents, children, partners and linked-account indicators.
The People directory uses that graph rather than the capped `/people` endpoint.
Name search is trimmed, case-insensitive and local; results are name-sorted.
Grid and list share filters: All, Linked accounts, Memorialized (death date),
Needs details (missing birth date, photo or biography), and Unconnected (no
parent, child or partner). Chips show whole-family counts, not search-result counts.
Cards/rows link to profiles and `/tree?focus={personId}`.

## Family tree UI

The tree renderer consumes normalized `people`, parent/child `edges`, and separate
symmetric `partners`. Partner links are not ancestry, unions or layout-generation
constraints. The branch delivers the interactive map in `TreePage`: pan/zoom,
focused one-hop context, progressive `+N` expansion, distinct partner connectors,
and a person inspector beside the canvas on desktop and adapted for mobile.
The generations view remains the fallback; generation numbers are presentation
only. Focus/expansion and viewport state must not change persisted relationships.

The Creator/Editor partner form in `TreePage` calls
`POST /relationships/partners` with two Person IDs, then refreshes server data.
Viewers explore without structural edit controls. The server remains authoritative
for same-family, self-pair and duplicate checks.

Requirements:

- support multiple roots
- support people with two or more parent links
- support collapsed branches
- distinguish living/deceased profiles without exposing sensitive data unnecessarily
- open profile details from a node
- avoid assuming generation number is permanent identity

Tree layout is presentation logic. It must never become the persistence model.

## Claims, memories and events

- `ClaimPanel` on family Overview supports person search/confirmation, a pending
  state with requester cancellation, linked identity with self-unlink, and the
  Creator's approval/rejection queue. Creator self-requests still require an
  explicit decision. Dismissal is stored per family locally; it does not alter
  membership or access.
- `FeedPage` is the Memories route. `PersonTagPicker` submits up to 20 `personIds`
  with the post composer; `PostCard` displays tagged people. Person-specific
  memory retrieval uses the API's `personId` filter. Authors edit their own posts;
  Creators moderate by deletion, not rewriting another author's content.
- `EventsPage` combines stored gatherings with family-filtered derived birthdays
  and remembrances. Any member may create a gathering and select Going, Maybe or
  Can't go; selecting the current RSVP clears it. Counts and `myRsvp` refresh
  after mutation. Authors and Creators see deletion controls. Event editing is
  author-only in the API; the page currently has no edit form.

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
