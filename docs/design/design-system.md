# Banyan design system: Living Archive

Status: implemented in `src/client/styles.css` and `src/client/components/` (October 2026).
This document describes the visual system the web client ships today. It replaces the
visual parts of `docs/product/banyan-spec.md` §3 (colours, type and labels). Product,
data-model and permission rules there and in the normative docs are unchanged.

## Principles

- **Warm and calm.** Ivory canvas, white surfaces, deep green actions. Family photos are
  the loudest thing on a screen; decoration never competes with them.
- **The family map is the signature.** Dot-grid "graph paper", curved connectors and person
  nodes appear on the tree, empty states and the landing illustration.
- **Readable for every generation.** 15px body text, 44px controls, AA contrast, both themes,
  full keyboard focus, reduced motion respected.
- **Colour never encodes people.** No gender colours. Lineage accents are decorative only;
  text labels carry meaning.

## Themes

Light is the `notebook` theme and dark is `slate`. With no stored choice the theme follows
the operating system; the toggle stores a choice in `localStorage` (`bn-theme`) and sets
`data-theme` on `<html>` (`src/client/theme.tsx`, plus an inline script in `index.html` that
applies it before first paint).

## Colour tokens

Components read these CSS variables only; never put a raw hex value in a component.

| Token              | Light     | Dark      | Use                                     |
| ------------------ | --------- | --------- | --------------------------------------- |
| `--canvas`         | `#F6F8F4` | `#101A15` | App background                          |
| `--surface`        | `#FFFFFF` | `#1B2921` | Cards, sidebar, dialogs                 |
| `--surface-muted`  | `#EDF4EE` | `#283A2E` | Selected and hover states, muted areas  |
| `--surface-sunken` | `#E4EDE6` | `#15221B` | Tree canvas, initials fallback          |
| `--text`           | `#20332B` | `#F2F7F1` | Core text                               |
| `--text-muted`     | `#52675A` | `#C0CDC3` | Supporting text                         |
| `--text-subtle`    | `#5F7268` | `#A4B5A8` | Small labels (kept at AA on canvas)     |
| `--text-faint`     | `#728078` | `#A4B5A8` | Placeholders, separators, memorial ring |
| `--primary`        | `#285E4A` | `#82C8A0` | Actions, links, active navigation       |
| `--primary-hover`  | `#194B38` | `#ACDFBA` | Hover on primary                        |
| `--primary-text`   | `#FFFFFF` | `#0E1F16` | Text on primary                         |
| `--primary-soft`   | `#E1EEE5` | `#23402F` | Soft brand fills (editor badge, chips)  |
| `--border`         | `#DFE7E1` | `#385046` | Dividers, card edges                    |
| `--border-strong`  | `#C3D1C7` | `#4C6A5C` | Inputs, buttons, connectors             |
| `--focus`          | `#7B64B0` | `#C4B0FF` | Keyboard focus ring                     |
| `--danger`         | `#AB4138` | `#F6A399` | Destructive actions, errors             |
| `--success`        | `#276E50` | `#8FD9A9` | Confirmation                            |
| `--lineage-blue`   | `#A8B9DA` | `#90AEDC` | Decorative accent                       |
| `--lineage-ochre`  | `#E6C691` | `#D0AC64` | Decorative accent; birthday icon tint   |
| `--lineage-lilac`  | `#CBAFE3` | `#B79BD9` | Decorative accent                       |
| `--lineage-clay`   | `#D9AAA4` | `#D99891` | Decorative accent                       |

Rules:

- Lineage accents are used mixed with `--surface` (about 40-55%) and always carry dark
  `--text`, never white. They tint family-card top bars, generation pills and initials
  avatars. They never mean anything on their own.
- `--text-faint` is below AA for body text. Use it only for placeholders and decoration.
- `--danger` is for errors and destructive actions only.

## Type

Fonts load from Google Fonts in `index.html`.

| Family                                                   | Variable       | Use                                 |
| -------------------------------------------------------- | -------------- | ----------------------------------- |
| Inter                                                    | `--font-sans`  | UI, navigation, body                |
| Newsreader                                               | `--font-serif` | Page titles, wordmark, empty titles |
| Noto Sans Tamil, Noto Sans Devanagari, Noto Sans Bengali | in both stacks | Indic-script names and text         |

Latin typefaces are never forced onto Indic scripts: those characters fall through to the
Noto families. Elements with an Indic `lang` get a 1.7 line height.

| Role              | Size / line height | Weight  |
| ----------------- | ------------------ | ------- |
| Page title (`h1`) | 32 / 40 (serif)    | 600     |
| Section (`h2`)    | 17 / 24            | 650     |
| Card title (`h3`) | 16 / 22            | 650     |
| Body              | 15 / 24            | 400     |
| Control           | 14 / 20            | 600     |
| Caption           | 12-13 / 18         | 450-600 |
| Tree name         | 13 / 18            | 700     |
| Tree metadata     | 12 / 17            | 400     |

Eyebrows and detail-list labels are small uppercase with letter spacing; everything else is
sentence case. All sizes are in `rem`, so the `--bn-text-scale` hook and browser zoom scale the
whole ramp.

## Spacing, geometry and motion

- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 48, 64 px.
- Controls: `--control-sm` 36px, `--control` 44px (default), `--control-lg` 48px. Touch targets
  are at least 44px on mobile navigation.
- Radii: inputs 8px, buttons 10px, cards 14px, major surfaces (tree canvas, auth card) 18px,
  avatars and chips 999px.
- Shadows are restrained: `--shadow-sm` on cards, `--shadow` on hover and floating panes,
  `--shadow-lg` only on the auth card and landing illustration.
- Motion: 160ms for hover and press, 220ms for entrances (`rise`). Under
  `prefers-reduced-motion` all animation and transitions are effectively disabled, except a
  slowed spinner.

## App shell

`AppLayout` renders one shell with three breakpoints:

| Width      | Navigation                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| >= 1024px  | 236px sidebar: wordmark, Home, Families, Friends, Account, user card, theme toggle, sign out    |
| 640-1023px | 84px rail with icon plus short visible label                                                    |
| < 640px    | Sticky top bar (mark, theme toggle, sign out) and a fixed bottom bar with the four destinations |

Main content is centred with a 1260px maximum width. The landing page keeps its own top bar.

## Components

All classes live in `src/client/styles.css`; React pieces live in `src/client/components/ui.tsx`.

- **Buttons** `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, sizes `.btn-sm` / `.btn-lg`,
  `.btn-block`. Disabled is 55% opacity.
- **Fields** `.input`, `.select` (custom chevron), `.textarea`; focus is a primary border plus
  a soft ring. `Field` provides label, optional marker and hint.
- **Cards** `.card`, `.card-header`, `.card-body`; `.card-link` lifts on hover.
- **Lists** `.list`, `.list-item` (60px minimum row).
- **Tabs** `.tabs` is a segmented control; the active tab is a raised white pill.
- **Badges** `.badge`, `.badge-creator` (solid primary), `.badge-editor` (soft primary).
- **Avatar** circle with photo or initials. Initials use a deterministic tone from the name
  (`avatar-tone-0..4`), never from gender. Deceased people get a thin muted ring.
- **Feedback** `Alert` (error, success, info), `EmptyState` on dot grid, `Loading` spinner,
  `ErrorState` for failed primary data.
- **Family map** (`src/client/tree/`, ADR-007). `.tree-stage` is a dot-grid canvas on
  `--surface-sunken` that fills most of the viewport and pans and zooms inside itself (the page
  never scrolls sideways). Generations are columns, eldest on the left. `.tree-card` is a
  248×84 card: 48px avatar, two-line name, life years and a descendant count. A circular
  `.tree-toggle` on the right edge shows "+" with a count of hidden children, or "−"; a matching
  one on the left edge reveals parents. Toggles are 34px (40px on touch screens) with a 44px hit
  area, and are counter-scaled as the map zooms out so they stay at least 24px (mouse) or 40px
  (touch) on screen. Connectors are 2px `--border-strong` curves; those touching the selected or
  just-expanded person use `--primary`. The selected card has a primary ring, the just-expanded
  card a softer one. Deceased people get a quieter card and the avatar's pencil ring. Hovering a
  card with a mouse shows `.tree-preview`; clicking opens `.tree-inspector`, a pane at the right
  of the canvas that becomes a bottom sheet above the navigation on phones. Motion: cards move
  over 440ms, new cards fade and scale in with a 45ms stagger, connectors draw in, the camera
  pans just far enough to show new people. All of it is instant under reduced motion.
- **Person chip** `.person-node` is a 72px-high card with a 44px avatar, two-line name and life
  years, used for people who are not yet in the tree.
- **Feed** `.composer`, `.post`, pill `.reaction` buttons and bubble `.comment`s.

## Accessibility checklist

- Every interactive element shows the `--focus` ring on `:focus-visible`.
- Navigation icons always have a visible text label.
- Body and label pairs meet WCAG 2.2 AA in both themes; lineage tints always carry dark text.
- Layouts work at 320px width with no horizontal scroll (the tree canvas scrolls inside itself).

## Not implemented yet

These came from the October 2026 design proposal and still need product, data or API work
before they can be built. See `docs/execution/current-state.md` for status.

- Partner/union edges on the family map (needs a typed union relationship in the data model).
- An account-to-person claim workflow (claim requests, verifier approval, audit).
- Memories, albums, a people directory, user-created events and family settings routes.
- A family switcher and global search.
