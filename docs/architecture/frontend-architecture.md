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

- The brand is Banyan (`docs/product/banyan-spec.md` §3). Brand tokens (`--bn-*`) in `src/client/styles.css` are the colour source of truth. Two themes: Notebook (light) and Slate (dark). The theme follows the OS unless the user picks one, which sets `data-theme="notebook"` or `"slate"` on `<html>` (`src/client/theme.tsx`; an inline script in `index.html` applies the stored choice before first paint).
- Component classes read semantic aliases (`--bg`, `--text`, `--primary`, `--danger`, ...) that are mapped once onto `--bn-*`. Do not add raw hex values in components; use the tokens.
- Colour jobs: ink is confirmed fact and primary action; pencil is secondary text and approximate facts; red pen (`--bn-pen`) is only for "look here" and errors; highlighter (`--bn-highlight`) is only for celebrations and never for remembrance or loss. The dot grid (`--dot-grid`) appears only on the tree canvas and empty states.
- Type is Anek (Latin, Tamil, Devanagari) from Google Fonts, with Kavivanar (`--font-hand`) reserved for short red-pen annotations. No all-caps labels. Indian-script elements get taller line heights via `:lang(...)`.
- Brand files live in `public/brand/`. The header mark is drawn inline (`BanyanMark` in `components/AppLayout.tsx`) with tokens so it becomes the chalk mark in Slate.
- Reusable React pieces live in `src/client/components/ui.tsx`. Prefer extending these over one-off markup.
- Every data-loading page renders `Loading` while fetching, `ErrorState` when its primary data fails, and `EmptyState` for empty lists.
- Layouts must work at phone width (360px) without horizontal scrolling.
