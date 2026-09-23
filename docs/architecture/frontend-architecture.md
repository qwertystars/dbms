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

- All styling lives in `src/client/styles.css`: design tokens on `:root`, a dark-mode token override under `prefers-color-scheme: dark`, and plain component classes. Do not add inline color values; use the tokens.
- Reusable React pieces live in `src/client/components/ui.tsx`. Prefer extending these over one-off markup.
- Every data-loading page renders `Loading` while fetching, `ErrorState` when its primary data fails, and `EmptyState` for empty lists.
- Layouts must work at phone width (360px) without horizontal scrolling.
