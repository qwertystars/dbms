# Banyan: brand kit and implementation spec

Working name. Version 0.1, 23 September 2026.
Inputs: the red-pen sketch on a papergrid notebook page, FeralUI (feralui.dev) and its Brandkit board builder (feralui.dev/brandkit).
Assets that ship with this file: `brand/banyan-mark.svg`, `brand/banyan-mark-slate.svg`, `brand/banyan-favicon.svg`, `brand/banyan-mark.png`, `brand/banyan-app-icon.png`.

This document turns a one-page sketch into something buildable. It is written for the engineer who will own the implementation and covers what the sketch asks for, the brand system, which FeralUI pieces to use and where, the tree renderer, the data model, permissions and milestones. Where the sketch is ambiguous, the doc picks a default and records the question in §17, so nothing here should block work.

## 0. Decisions at a glance

| Area          | Decision                                                                                                                                                       | Why                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Product       | A private family network built around a living family tree                                                                                                     | The sketch is a tree, person profiles, access roles and a requests card              |
| Brand concept | "The family register": dot-grid paper, ink for facts, pencil for guesses, red pen for "look here", highlighter for celebrations, slate and chalk for dark mode | It is literally what the sketch is: red pen on a dot-grid notebook                   |
| Logo          | A kinship glyph: two partners joined by a marriage line, a line of descent, and a child in red                                                                 | Taken from the sketch's couple nodes and tested against alternatives (§3.3)          |
| Base UI       | shadcn/ui on Base UI primitives, Tailwind v4                                                                                                                   | FeralUI has no forms, dialogs, tables or menus                                       |
| FeralUI       | PullCord, ClawCaptcha, Blob and AniMaps as packages; Crumple, Vacuum and Hologram rebuilt in-house; Brandkit for the brand board                               | Only some pieces are published, and licences vary (§4)                               |
| Tree renderer | `@xyflow/react` canvas with a `d3-hierarchy` layout over households                                                                                            | Pan, zoom, dotted background and minimap are built in; custom nodes match the sketch |
| Storage       | Postgres, modelled as a graph (people, unions, child links) and drawn as a hierarchy                                                                           | Real families are not strict hierarchies (§7.1)                                      |
| Type          | Anek for UI and names (Latin plus nine Indian scripts), Kavivanar for red-pen handwriting                                                                      | Names are the core content and many will be written in Tamil                         |

## 1. Reading the sketch

Every red-pen element on the page maps to a feature. The table follows the page roughly from top to bottom.

| On the page                                                                                                                                 | What it means                                                   | Built as                                              | See      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- | -------- |
| "Social Media"                                                                                                                              | The product category                                            | A private feed per family                             | §11      |
| "HDB, Hierarchical Data Base", "Family Tree"                                                                                                | Family data is hierarchical                                     | Graph storage, hierarchical rendering                 | §6, §7   |
| Left chain: Koothan (circled), a blank line, N…than, Chinaiyan, Annadurai, Swaminathan, Aadhira                                             | A father-to-child lineage with an unknown stretch in the middle | Lineage view and an "unknown generations" placeholder | §6.7, §7 |
| Profile box: Name\*, Gender\*, D.O.B, D.O.D, Height, Weight, Address, Mail, Phone No, Job, Degree, Job location, Other info, a photo square | The person record                                               | Profile sheet and form                                | §10      |
| "Friends Request" card                                                                                                                      | People asking to connect                                        | Requests inbox                                        | §9       |
| Access box: Creator (tree: delete, update), Editor (edit), Viewer (view, download)                                                          | Roles per tree                                                  | Role-based access plus field visibility               | §8       |
| Small box with a dotted tree labelled G1 to G4                                                                                              | An overview of the whole tree by generation                     | Minimap plus a generation ruler                       | §6.4     |
| Bar with a "Q" above the tree                                                                                                               | Find a person and jump to them                                  | Search palette; the red pen circles the result        | §6.6     |
| Ovals holding two small circles, labelled Parent/G1, G2, G3                                                                                 | A couple is one node, and generations stack downward            | Household ("pod") nodes in generation bands           | §6.2     |
| In G2, one circle filled and one hollow                                                                                                     | Our reading: filled was born into the family, hollow married in | Derived from the data, never stored                   | §6.2     |
| Row: G1, F_Name, M_Name, 1950/2010, No. of child 4, "OF"                                                                                    | A tabular view of each family unit                              | Table view                                            | §6.7     |
| Right chain: X, Sankar P…, Sourab, Srijan                                                                                                   | A second lineage that starts from an unknown ancestor           | An "unknown person" placeholder                       | §7       |

"Sign", the cursive "Papergrid", "Play" and the tic-tac-toe grid are printed on the notebook page in grey and black rather than drawn in red pen, so they are treated as the page's decoration, not requirements. Games are out of scope unless §17 changes that.

Three details in the sketch shape the data model more than anything else. Both chains contain people nobody remembers (the blank line after Koothan, the X above Sankar), so unknown ancestors and unknown stretches of generations must be first-class records. The names are Tamil, and Tamil naming often uses the father's initial instead of a surname ("S. Aadhira"), so a surname can never be required and every name must be storable in Tamil script. Finally, the sketch calls this a hierarchical database, but a family is a graph: two parents per child, remarriage, adoption and, in many South Indian families, marriages within the extended family that put one person in two branches. §7.1 explains how we store a graph and still draw exactly the hierarchy the sketch shows.

## 2. Scope

| Now (MVP, M0 to M3)                                              | Later (M4, M5)                                     | Not doing                                    |
| ---------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Phone OTP and email sign-in, invite links                        | Journeys map (AniMaps)                             | Chat and DMs (families already use WhatsApp) |
| Trees, people, couples, children, placeholders                   | Heirloom cards (Hologram-style)                    | Public profiles or public trees              |
| Tree, Lineage and Table views, search, minimap                   | GEDCOM import and export                           | Games, unless §17 changes this               |
| Profile sheet with field visibility                              | Kinship terms in Tamil and Hindi                   | Ads                                          |
| Creator, Editor and Viewer roles, audit log                      | Links between two families' trees                  |                                              |
| Requests: join, claim profile, confirm relative, friend          | Transliterated search (typing Aadhira finds ஆதிரா) |                                              |
| Feed, posts tagged to people, birthday and remembrance reminders | Installable PWA with push notifications            |                                              |
| Export the tree as PNG or PDF                                    |                                                    |                                              |

## 3. Brand kit

### 3.1 Name and story

Banyan is a working name, and nothing below depends on it. A banyan's aerial roots, விழுது (vizhudhu) in Tamil, grow down from its branches and become new trunks that hold the old tree up. That is the product: each generation puts down its own roots without leaving the tree. Tagline: "Every branch has roots." Run a trademark and domain check before committing to the name.

### 3.2 Concept: the family register

Families have kept lineages in notebooks and registers for generations, and the sketch is exactly that: red pen on a dot-grid page. The product should feel like that register come alive. Each stationery material has one job, and those jobs are the entire colour system.

| Material                                   | Job                                                                                        | Never used for                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Paper (white, with a dot grid on the tree) | Canvas and surfaces                                                                        |                                                       |
| Ink                                        | Confirmed facts, primary text, primary actions, lines of descent                           | Decoration                                            |
| Pencil                                     | Approximate or unverified facts, placeholder people, secondary text                        | Anything confirmed                                    |
| Red pen                                    | "Look here": you, the selected person, a search hit, the lineage path, errors, unread dots | Decoration or large fills                             |
| Highlighter                                | Celebration: birthdays, anniversaries, new members                                         | Loss, errors, or anything about a person who has died |
| Slate and chalk                            | The dark theme, like a school blackboard                                                   |                                                       |

The rule that makes this more than a palette: ink is fact, pencil is a guess. A birth year entered as "about 1920" renders in pencil with a dashed underline and turns to ink once an editor confirms it. Placeholder people are drawn in pencil. The red pen appears only where the eye should go next.

### 3.3 Logo

The mark is the family-tree glyph from the sketch: two partners joined by a marriage line, a line of descent, and a child. Hollow means married in, filled means born in, red means you. We first tried enclosing the partners in the sketch's oval, but every version (rounded, pointed, tilted) read as a face or an eye, which is the wrong signal for an app that holds family data. Without the oval, the glyph reads as exactly what it is.

```svg
<!-- brand/banyan-mark.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" role="img" aria-labelledby="t">
  <title id="t">Banyan</title>
  <circle cx="14.5" cy="19" r="8.5" stroke="#1D2A6B" stroke-width="4"/>                  <!-- married in -->
  <circle cx="49.5" cy="19" r="9.5" fill="#1D2A6B"/>                                      <!-- born in -->
  <path d="M23 19H40M32 19V41" stroke="#1D2A6B" stroke-width="4" stroke-linecap="round"/> <!-- marriage, descent -->
  <circle cx="32" cy="49" r="7.5" fill="#C8262B"/>                                        <!-- you -->
</svg>
```

| Asset                   | Use                                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| `banyan-mark.svg`       | Default mark on paper and on highlighter                                  |
| `banyan-mark-slate.svg` | Chalk version for slate and ink backgrounds                               |
| `banyan-favicon.svg`    | 24 px and below; heavier strokes keep the hollow ring open                |
| `banyan-app-icon.png`   | 1024 px, full bleed on highlighter; platforms apply their own corner mask |
| `banyan-mark.png`       | 1024 px on transparent, for tools that don't accept SVG                   |

Clear space around the mark equals the child dot's diameter. Minimum size is 20 px for the mark and 16 px for the favicon. The red dot is always the child and never moves. The wordmark is "banyan" in lowercase Anek Latin at weight 800 and 125% width, set in ink, with the mark to its left at cap height.

### 3.4 Colour

Brand tokens are prefixed `--bn-` so they never collide with shadcn's variable names; §5 maps one onto the other. Every contrast ratio below was computed against the surface the token actually sits on, and every text pairing meets WCAG AA. `data-theme` lives on `<html>`; the default follows the operating system, and a user's choice overrides it.

| Token               | Notebook (light) | Slate (dark) | Role                                            | Contrast, light / dark      |
| ------------------- | ---------------- | ------------ | ----------------------------------------------- | --------------------------- |
| `--bn-bg`           | `#F3F4F7`        | `#1B2421`    | App background behind sheets                    |                             |
| `--bn-surface`      | `#FFFFFF`        | `#222D29`    | Sheets, the tree canvas, popovers               |                             |
| `--bn-ink`          | `#1D2A6B`        | `#EEF0EA`    | Text, lines of descent                          | 13.2 : 1 / 12.4 : 1         |
| `--bn-primary`      | `#1D2A6B`        | `#AFC0FF`    | Buttons, links, focus ring                      |                             |
| `--bn-on-primary`   | `#FFFFFF`        | `#141B3D`    | Text on primary                                 | 13.2 : 1 / 9.4 : 1          |
| `--bn-pencil`       | `#5E6573`        | `#A7B1AC`    | Secondary text, approximate facts, placeholders | 5.9 : 1 / 6.5 : 1           |
| `--bn-pen`          | `#C8262B`        | `#FF7A70`    | Look here, errors                               | 5.6 : 1 / 5.6 : 1           |
| `--bn-on-pen`       | `#FFFFFF`        | `#1B2421`    | Text on pen, such as badges                     | 5.6 : 1 / 6.3 : 1           |
| `--bn-pen-wash`     | `#FCE9E9`        | `#3A2624`    | Error banner and selection halo                 | pen on it 4.8 : 1 / 5.6 : 1 |
| `--bn-highlight`    | `#FFE45C`        | `#4A4218`    | Celebration background                          |                             |
| `--bn-on-highlight` | `#1D2A6B`        | `#FFE45C`    | Text on highlight                               | 10.3 : 1 / 7.9 : 1          |
| `--bn-success`      | `#1C7A4A`        | `#6FD3A0`    | Saved, done                                     | 5.3 : 1 / 8.7 : 1           |
| `--bn-rule`         | `#D9DDE5`        | `#34423D`    | Hairlines (decorative)                          |                             |
| `--bn-rule-strong`  | `#8A93A6`        | `#6B7A74`    | Input borders (3 : 1 minimum)                   | 3.1 : 1 / 3.2 : 1           |
| `--bn-dot`          | `#C3C9D4`        | `#3F4E48`    | The dot grid (decorative)                       |                             |

```css
/* styles/tokens.css */
:root,
:root[data-theme="notebook"] {
  --bn-bg: #f3f4f7;
  --bn-surface: #ffffff;
  --bn-ink: #1d2a6b;
  --bn-primary: #1d2a6b;
  --bn-on-primary: #ffffff;
  --bn-pencil: #5e6573;
  --bn-pen: #c8262b;
  --bn-on-pen: #ffffff;
  --bn-pen-wash: #fce9e9;
  --bn-highlight: #ffe45c;
  --bn-on-highlight: #1d2a6b;
  --bn-success: #1c7a4a;
  --bn-rule: #d9dde5;
  --bn-rule-strong: #8a93a6;
  --bn-dot: #c3c9d4;
  --bn-shadow: 0 1px 0 var(--bn-rule), 0 12px 32px rgb(29 42 107 / 0.12);
  color-scheme: light;
}
:root[data-theme="slate"] {
  --bn-bg: #1b2421;
  --bn-surface: #222d29;
  --bn-ink: #eef0ea;
  --bn-primary: #afc0ff;
  --bn-on-primary: #141b3d;
  --bn-pencil: #a7b1ac;
  --bn-pen: #ff7a70;
  --bn-on-pen: #1b2421;
  --bn-pen-wash: #3a2624;
  --bn-highlight: #4a4218;
  --bn-on-highlight: #ffe45c;
  --bn-success: #6fd3a0;
  --bn-rule: #34423d;
  --bn-rule-strong: #6b7a74;
  --bn-dot: #3f4e48;
  --bn-shadow: 0 1px 0 var(--bn-rule), 0 12px 32px rgb(0 0 0 / 0.35);
  color-scheme: dark;
}
```

### 3.5 Typography

| Face                                                                                          | Role                                         | Scripts         | Source                                              |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------- | --------------------------------------------------- |
| Anek (Latin, Tamil, Devanagari, Bangla, Telugu, Kannada, Malayalam, Gujarati, Gurmukhi, Odia) | Everything: UI, names, headings, posts       | 10              | Google Fonts, OFL; variable weight and width        |
| Kavivanar                                                                                     | Red-pen annotations only, four words at most | Tamil and Latin | Google Fonts, OFL; use Kalam for Devanagari locales |

Anek was chosen because its ten scripts were designed together, so a Tamil name and a Latin name on the same node look like siblings rather than a fallback. Its width axis does real work here:

| Use                         | Width (`font-stretch`)                              | Weight      |
| --------------------------- | --------------------------------------------------- | ----------- |
| Wordmark, marketing display | 125%                                                | 800         |
| Page titles                 | 112.5%                                              | 700         |
| Headings                    | 100%                                                | 650         |
| Body and UI                 | 100%                                                | 400 and 500 |
| Names inside tree nodes     | 87.5%, stepping to 75% before anything is truncated | 600         |

Anek was designed mainly for large sizes and short texts. Most of this product is short text; long "life story" pages are the exception. Set those at 17 px with a 1.7 line height and a measure of about 68 characters, then test with older relatives. If reading fatigue shows up, add Noto Serif and its script companions for the story view only.

| Token       | Size / line height, Latin | Indian scripts | Use                              |
| ----------- | ------------------------- | -------------- | -------------------------------- |
| `text-xs`   | 12 / 16                   | 12 / 18        | Timestamps only                  |
| `text-sm`   | 14 / 20                   | 14 / 22        | Secondary text                   |
| `text-base` | 16 / 24                   | 16 / 26        | Body                             |
| `text-lg`   | 18 / 28                   | 18 / 30        | Person name in the profile sheet |
| `h3`        | 21 / 28                   | 21 / 32        | Section titles                   |
| `h2`        | 24 / 32                   | 24 / 36        | Page sections                    |
| `h1`        | 30 / 36                   | 30 / 42        | Page titles                      |
| `display`   | 48 / 52                   | 48 / 60        | Marketing only                   |

Indian scripts need taller lines for their vowel signs, so apply the third column through `:lang(ta)`, `:lang(hi)` and so on, and on any element that renders a native-script name. There are no all-caps labels anywhere; Indian scripts have no case, and caps slow everyone else down. A user text-size setting (100, 115 or 130 percent) scales the whole ramp, because many readers will be grandparents.

```ts
// app/fonts.ts (confirm exact subset names against next/font's type definitions)
import { Anek_Latin, Anek_Tamil, Anek_Devanagari, Kavivanar } from "next/font/google";

export const anekLatin = Anek_Latin({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-anek-latin",
});
export const anekTamil = Anek_Tamil({
  subsets: ["tamil"],
  axes: ["wdth"],
  variable: "--font-anek-tamil",
  preload: false,
});
export const anekDeva = Anek_Devanagari({
  subsets: ["devanagari"],
  axes: ["wdth"],
  variable: "--font-anek-deva",
  preload: false,
});
export const kavivanar = Kavivanar({
  subsets: ["latin", "tamil"],
  weight: "400",
  variable: "--font-kavivanar",
  preload: false,
});
```

```css
:root {
  --bn-font-ui: var(--font-anek-latin), var(--font-anek-tamil), var(--font-anek-deva), system-ui,
    sans-serif;
  --bn-font-hand: var(--font-kavivanar), var(--font-anek-latin), cursive;
}
```

Only Latin preloads. Each script's font loads the first time a glyph from that script appears, which matters on Indian mobile networks.

### 3.6 Shape, space and texture

Spacing is a 4 px scale: 4, 8, 12, 16, 24, 32, 48, 64. Radius follows the role of the element rather than one value everywhere.

| Element              | Radius        |
| -------------------- | ------------- |
| Pods, chips, avatars | Full (999 px) |
| Sheets and dialogs   | 16 px         |
| Buttons and inputs   | 10 px         |
| Tooltips             | 6 px          |

Sheets sit flat on the background with a 1 px rule. Only floating layers (the profile sheet over the canvas, popovers, menus) get `--bn-shadow`, which is tinted with ink rather than grey. The dot grid (24 px pitch, 1.4 px dots, `--bn-dot`) appears on the tree canvas and on empty states and nowhere else; it means "this is the register", so it never sits behind forms or the feed.

### 3.7 Icons, illustration and imagery

Icons are Lucide (shadcn's default) at a 1.75 px stroke with round caps, which matches the ink lines. Draw these custom icons in the same style: household, placeholder person, generation, lineage and heirloom. Illustrations are single-weight ink line drawings with at most one red-pen mark: no gradients, no 3D renders, no stock photos of families. The family's own photos are the imagery.

For someone who has died there is no religious symbol by default: no cross, no lamp. Their profile shows their years ("1950 – 2010") and a pencil ring around the photo. Families can choose a symbol for a person in settings.

### 3.8 Motion and the whimsy budget

The signature move is the red pen drawing itself: a hand-drawn loop around a search result, the arrows along a lineage, a small "you" beside your own node on your first visit. It animates `stroke-dashoffset` over 450 ms with an ease-out. Everything else is quick and quiet: 120 ms for state changes, 200 ms for enter and exit, 320 ms for sheets, and a spring (stiffness 260, damping 30) when the canvas moves to a person. Under `prefers-reduced-motion` the red pen appears without drawing, and the FeralUI pieces handle it themselves (PullCord and ClawCaptcha both respect the setting).

Playful physics is rationed by surface.

| Surface                                                                    | Motion allowed                                   | Pieces                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Sign-up and onboarding                                                     | Playful                                          | ClawCaptcha, for sign-ups without an invite                     |
| Theme switch                                                               | Playful                                          | PullCord                                                        |
| Log-out dialog, empty states                                               | Character                                        | Blob                                                            |
| Deleting your own drafts, comments, notifications or photos                | Playful                                          | Crumple for one item, Vacuum for several, both rebuilt in-house |
| Journeys and heirloom cards                                                | Cinematic                                        | AniMaps, a Hologram-style card built in-house                   |
| Tree canvas                                                                | Functional: the spring and the red pen           | Custom                                                          |
| Editing people, access and privacy                                         | Nothing beyond the state change                  |                                                                 |
| Anyone who has died: their profile, remembrance days, posts tagged to them | Fades only: no mascot, confetti, foil or physics |                                                                 |

Removing a person or deleting a tree never uses Crumple or Vacuum. It is a plain confirmation dialog that says what will happen and how to undo it.

### 3.9 Voice and words

The voice is plain, warm and respectful to elders. Everything is sentence case. An action keeps its name through the whole flow, so "Invite" becomes "Invite sent". Errors say what happened and how to fix it, without apologising.

| Moment               | Write                                                                                                       | Avoid              |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| Empty tree           | Start with you. Add yourself, then your parents.                                                            | No data yet        |
| Invite               | Invite Paati to the family tree                                                                             | Share access link  |
| Unknown ancestor     | Unknown. Add what you know.                                                                                 | N/A                |
| Approximate date     | about 1920                                                                                                  | ~1920?             |
| Someone who has died | 1950 – 2010                                                                                                 | Dead, RIP          |
| Removing a person    | Remove Annadurai from this tree? Their photos and posts stay, and you can restore this profile for 30 days. | Are you sure?      |
| A join request       | Meena wants to join as a viewer                                                                             | New friend request |
| A save error         | Couldn't save the birth date. Enter a year like 1950, or choose "about".                                    | Invalid input      |

### 3.10 The brand board in FeralUI Brandkit

Brandkit lays a brand out on a single 2048 × 1536 sheet cut into a bento grid. Every tile is drawn live from your logo, colours and typeface, and the board exports as PNG for free. Enter these values:

| Brandkit input         | Value                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Logo                   | `brand/banyan-mark.svg`, or `brand/banyan-mark.png` if SVG isn't accepted                                                                |
| Colours, in this order | Ink `#1D2A6B`, Red pen `#C8262B`, Highlighter `#FFE45C`, Pencil `#5E6573`, Slate `#1B2421`                                               |
| Typeface               | Anek Latin. If the picker doesn't offer it, pick the nearest wide grotesque and note the substitution; the product uses Anek regardless. |

Draw a 4 × 3 grid (512 px cells) and merge tiles like this:

```
┌───────────────────────────────┬───────────────┬───────────────┐
│                               │               │  Watch face   │
│  Logo, 2 × 2                  │  Phone lock   │               │
│  mark and wordmark on white   │  screen,      ├───────────────┤
│                               │  1 × 2        │  Lanyard      │
│                               │               │  badge        │
├───────────────┬───────────────┼───────────────┴───────────────┤
│  Palette      │  Type         │  Browser tab with favicon,    │
│               │               │  2 × 1                        │
└───────────────┴───────────────┴───────────────────────────────┘
```

Where a tile accepts text, use real product moments. For the lock screen, show a highlighter notification reading "Paati turns 80 today", so the celebration colour is doing its one job. The watch face reads "Aadhira's birthday in 2 days". The lanyard badge reads "Swaminathan family reunion". The browser tab title is "Banyan: Annadurai's family". The type tile sample is "Aadhira ஆதிரா", to show Latin and Tamil side by side.

Skip business cards, since a family app has no one to hand them to. Export at 4096 × 3072 for the repository README. The board is a presentation of the brand; the tokens in §3.4 remain the source of truth.

## 4. FeralUI: what to use and where

FeralUI is a set of standalone showcase pieces by a single author, not a design system: it has no buttons, inputs, dialogs, menus or tables. Some pieces are published to npm with a licence, and some exist only as demos. Treat it as a source of a few signature moments layered on the base system in §5.

| Piece            | Verdict          | Where it goes                                                                      | How to get it                                                   | Licence                                                                    |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| PullCord         | Use              | Theme switch (Notebook and Slate), desktop only                                    | `npm i pullcord`                                                | MIT                                                                        |
| ClawCaptcha      | Use              | Sign-up without an invite, in front of Turnstile                                   | `npm i playcaptcha`, then copy its `assets/` into `public/`     | MIT                                                                        |
| Blob             | Use              | Log-out dialog, empty states, onboarding                                           | Published on the author's npm profile; confirm the package name | Confirm before M3                                                          |
| AniMaps          | Use in M4        | Journeys: native places across generations, exported as video to share on WhatsApp | `npm i animaps-react` (browser only)                            | README says MIT but the repo has no LICENSE file; get written confirmation |
| DeskFolio        | Reference only   | Idea for a "life story" book view of an ancestor                                   | Do not ship the package                                         | No licence file; artwork includes Freepik assets                           |
| Crumple          | Rebuild in-house | Deleting one draft, comment or notification                                        | Recreate the effect                                             | No public source                                                           |
| Vacuum           | Rebuild in-house | Clearing several notifications or your own photos                                  | Recreate the effect                                             | No public source                                                           |
| Hologram         | Rebuild in-house | Foil heirloom card for elders and milestones (M4)                                  | Recreate the effect                                             | No public source                                                           |
| Brandkit         | Design tool      | The brand board (§3.10)                                                            | feralui.dev/brandkit                                            | Free, no watermark                                                         |
| Screenery        | Reference        | Onboarding transitions                                                             | Study only                                                      | Demo                                                                       |
| Matchday         | Reference        | Diary layout for a later family journal                                            | Study only                                                      | Demo                                                                       |
| Gradient Builder | Not used         | The brand is flat                                                                  |                                                                 |                                                                            |
| Fur              | Not used         | Possibly pet profiles, much later                                                  |                                                                 |                                                                            |

"No public source" means none was found when this document was written. If the author publishes any of these, prefer the package over a rebuild.

**PullCord.** It fixes itself to the top of the viewport, so it is desktop only; on mobile the same toggle is a Switch in Settings.

```tsx
// components/theme-cord.tsx
"use client";
import { PullCord } from "pullcord";
import "pullcord/pullcord.css";
import { useTheme } from "@/lib/theme"; // 'notebook' | 'slate'; defaults to the OS setting

export function ThemeCord() {
  const { theme, toggle } = useTheme();
  return (
    <PullCord
      pulled={theme === "notebook"} // lamp on means light
      onPull={toggle}
      ariaLabel="Switch between light and dark"
      className="hidden md:block"
    />
  );
}
```

**Theming FeralUI.** The pieces read CSS variables, so point them at brand tokens once.

```css
:root {
  --pullcord-ink: var(--bn-pencil);
  --pullcord-right: 7rem;
  --pullcord-z: 40;
}
.claw-scope {
  --clawcap-bg: var(--bn-surface);
  --clawcap-ink: var(--bn-ink);
  --clawcap-muted: var(--bn-pencil);
  --clawcap-accent: var(--bn-primary);
  --clawcap-action: var(--bn-pen);
}
```

**ClawCaptcha.** Its author is explicit that it proves someone is playing, not who they are. The real check is Cloudflare Turnstile, verified on the server; the claw machine only unlocks the button. Invited relatives never see it, which covers every grandparent who joins from a WhatsApp link.

```tsx
// Rendered only when sign-up has no invite token
import { ClawCaptcha } from "playcaptcha";
import "playcaptcha/clawcaptcha.css";

<div className="claw-scope">
  <ClawCaptcha
    title="One quick game before you join"
    assetBase="/vendor/playcaptcha" // copy the package's assets/ folder here
    onVerify={() => setPlayed(true)}
  />
</div>;
```

**AniMaps.** It is browser only, so load it with `ssr: false`, on the Journey route alone. Stops are native places ordered from the oldest generation to the youngest along a lineage, which is why places store coordinates (§7.2). Before production, check which map tiles and geocoder it calls and whether they need keys or carry usage terms.

```tsx
// components/journey-map.tsx
"use client";
import dynamic from "next/dynamic";
import "animaps-react/style.css";

const AniMaps = dynamic(() => import("animaps-react").then((m) => m.AniMaps), { ssr: false });

type Stop = { city: string; country: string; lat: number; lng: number };
export function JourneyMap({ stops }: { stops: Stop[] }) {
  return <AniMaps routeColor="#C8262B" initialStops={stops} />;
}
```

Loading rule: every FeralUI piece is dynamically imported on the route that uses it. None of them may land in the tree route's initial bundle.

## 5. Base components and screens

Use shadcn/ui with Base UI primitives, the default for new shadcn projects since July 2026; Radix is still supported if the team prefers it. Styling is Tailwind v4 with the tokens from §3.4. Map shadcn's variables onto brand tokens once and never use a raw hex value in a component.

```css
/* styles/shadcn-map.css, loaded after tokens.css */
:root {
  --background: var(--bn-bg);
  --foreground: var(--bn-ink);
  --card: var(--bn-surface);
  --card-foreground: var(--bn-ink);
  --popover: var(--bn-surface);
  --popover-foreground: var(--bn-ink);
  --primary: var(--bn-primary);
  --primary-foreground: var(--bn-on-primary);
  --secondary: var(--bn-bg);
  --secondary-foreground: var(--bn-ink);
  --muted: var(--bn-bg);
  --muted-foreground: var(--bn-pencil);
  --accent: var(--bn-bg);
  --accent-foreground: var(--bn-ink); /* hover stays neutral */
  --destructive: var(--bn-pen);
  --border: var(--bn-rule);
  --input: var(--bn-rule-strong);
  --ring: var(--bn-primary); /* focus is ink, not red pen */
  --radius: 10px;
}
```

Because `data-theme` sits on `<html>`, these variables resolve against the active theme's brand tokens.

| Screen             | shadcn/ui components                                                                                                   | FeralUI                                         | Built here                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Sign in, sign up   | Card, Tabs (phone or email), Input, Input OTP, Button, Label                                                           | ClawCaptcha when there's no invite              |                                                                                       |
| Accept invite      | Card, Avatar, Button                                                                                                   |                                                 | A preview of "you" in the tree                                                        |
| Feed               | Avatar, Button, Dropdown Menu, Textarea, Dialog (composer), Badge, Skeleton, Toast                                     | Crumple, for deleting your own draft or comment | PostItem, ReminderStrip                                                               |
| Tree               | Command (search), Toggle Group (Tree, Lineage, Table), Tooltip, Context Menu, Sheet (desktop), Drawer (mobile), Button | PullCord (desktop)                              | TreeCanvas, PodNode, PersonNode, PlaceholderNode, PortalNode, GenerationRuler, RedPen |
| Lineage            | Toggle Group (father's line, mother's line)                                                                            |                                                 | LineageStrip                                                                          |
| Table              | Table, Dropdown Menu, Input (filter)                                                                                   |                                                 | GenerationTable                                                                       |
| Profile            | Sheet or Drawer, Tabs, Input, Select, Radio Group, Textarea, Switch, Popover, Avatar, Separator                        |                                                 | FuzzyDateInput, NameFields, VisibilityPicker                                          |
| Members and access | Table, Select (role), Dialog (invite), Alert Dialog (remove, transfer), Badge                                          |                                                 |                                                                                       |
| Requests           | Tabs (received, sent), Avatar, Button, Badge                                                                           | Vacuum, for clearing handled requests           | RequestItem                                                                           |
| Notifications      | Popover (desktop), Sheet (mobile), Scroll Area                                                                         | Vacuum, for "Clear all"                         |                                                                                       |
| Settings           | Switch (theme, on mobile), Select (language), Radio Group (text size), Alert Dialog (delete tree)                      |                                                 |                                                                                       |
| Log out            | Alert Dialog                                                                                                           | Blob                                            |                                                                                       |
| Journey (M4)       | Sheet, Button                                                                                                          | AniMaps                                         |                                                                                       |
| Heirloom card (M4) | Dialog                                                                                                                 |                                                 | HeirloomCard                                                                          |

The tree screen on desktop. The canvas takes the full width until a person is selected; then the profile sheet slides over the right edge.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [mark] banyan    Feed   Tree   Requests 2   Members        ( Search people )  │  PullCord hangs here
├──────┬───────────────────────────────────────────────────────┬───────────────┤
│  G1  │ · · · · · · · · · · ( o ● ) · · · · · · · · · · · · · │ Annadurai      │
│      │ · · · · · · · · · · · · │ · · · · · · · · · · · · · · │ 1950 – 2010    │
│  G2  │ · · · · ( o ● )─────────┴─────────( o ● ) · · · · · · │ About  Life    │
│      │ · · · · · · │ · · · · · · · · · · · · │ · · · · · · · │ Contact Photos │
│  G3  │ · · · · (●)   (●) · · · · · · · · · (●)   (●) · · · · │               │
│      │ · · · · · · · · · · · · · · · · · · · · ·  ┌─────────┐ │               │
│ ruler│ [ Tree | Lineage | Table ]   [ Add person ] │ minimap │ │ profile sheet  │
└──────┴──────────────────────────────────────────────└─────────┘─┴───────────────┘
```

On mobile the minimap is hidden below 768 px and the ruler shrinks to a 24 px strip; the profile opens as a bottom drawer.

```
┌───────────────────────────┐
│ ( Search people )         │
├───────────────────────────┤
│G1 · · · ( o ● ) · · · · · │
│   · · · · · │ · · · · · · │
│G2 · ( o ● )─┴─( o ● ) · · │
│   · · · · · · · · · · · · │
│ [ Tree | Lineage | Table ]│
├───────────────────────────┤
│ Feed  Tree  Requests  Me  │
└───────────────────────────┘
```

## 6. The tree

### 6.1 Stack

`@xyflow/react` provides the canvas: pan and zoom, a dotted `Background`, a `MiniMap` whose node colours can be computed per node, `Controls`, `Panel`, `NodeToolbar` and `ViewportPortal`. Layout comes from `d3-hierarchy`'s `tree()` run over households (§6.5); above roughly 300 people, run it in a Web Worker. Dragging is off (`nodesDraggable={false}`) because positions are computed rather than placed by hand, so every relative sees the same tree. family-chart (MIT, built on D3) is worth a one-day spike for comparison, but it renders its own DOM, which makes the pod nodes and the red-pen overlay harder to build.

### 6.2 Nodes

| Node            | Looks like                                                                                                                                                                                                           | Data                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| PodNode         | A pill holding two avatar circles and both names. The born-in partner's circle is ink-filled and the married-in partner's is a hollow ink ring; with photos, that becomes a 2.5 px ink ring against a 1 px rule ring | A union and its partners                       |
| PersonNode      | A pill with one avatar                                                                                                                                                                                               | A person with no union                         |
| PlaceholderNode | A dashed pencil pill reading "Unknown" or "Unknown generations"                                                                                                                                                      | A placeholder person                           |
| PortalNode      | A small pill reading "Also appears under Chinaiyan" or "Continues in Meena's tree"                                                                                                                                   | A repeat appearance, or a link to another tree |

Born-in versus married-in is derived, never stored: a partner with parents in this tree was born in, and the other married in. In the root household neither partner has parents in the tree, so both circles are hollow, exactly as G1 is drawn in the sketch. Names use Anek at 87.5% width and lifespans sit under them in pencil. A person who has died gets a pencil ring and their years, nothing more (§3.7).

### 6.3 Edges

| Edge              | Style                                        | Meaning                                                                                |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Descent           | Ink, 1.5 px, orthogonal with rounded corners | A child of this union; biological, adopted, step and foster children all look the same |
| Uncertain         | Pencil, 1.5 px, dashed                       | Any link to or from a placeholder                                                      |
| Lineage highlight | Red pen, 2.5 px, drawn in                    | The path currently being shown                                                         |

Adoption is not drawn differently on the canvas. The relation is stated on the profile, where the family chooses how to describe it.

### 6.4 Generations, ruler and minimap

A generation is the depth from the root household, which is G1. Bands alternate between `--bn-surface` and `--bn-bg` behind each row. The GenerationRuler is a fixed strip on the left whose labels follow the canvas vertically; read the transform from `useViewport()` and ignore x. The MiniMap draws nodes in ink and the current lineage path in red pen, and it is pannable and zoomable, which gives the overview box from the sketch.

### 6.5 Layout

```text
layout(tree):
  root = tree.root_union_id ?? the union whose partners have the earliest birth year

  visit(household H, depth):
    for each child C of H, ordered by birth_order, then birth date:
      if C was already placed:   emit PortalNode(C) under H, pointing to the first placement
      else if C has unions:      for each union U of C, earliest first: visit(U, depth + 1)
      else:                      emit PersonNode(C) at depth + 1

  positions = d3.tree()
    .nodeSize([POD_WIDTH + 32, ROW_HEIGHT])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.25))
    (d3.hierarchy(root, visit))

  collapse households deeper than 4 levels by default (a "12 more" chip expands them), remembered per user
```

Three cases need care. A person reached twice, most often through a marriage within the extended family, is drawn in full at the first placement and as a PortalNode after that; activating the portal pans to the original and draws the red pen between the two. A person with two marriages appears in two pods side by side, drawn in pencil in the second with a link to the first. Placeholders take part in layout exactly like people. The layout is deterministic, so cache it by `trees.version`.

### 6.6 Search and the red pen

The command palette (`⌘K`, `/`, or tapping the search pill) matches display name, native-script name, nicknames and Latin transliteration. It searches the loaded tree on the client and falls back to `pg_trgm` on the server for large trees. Choosing a result expands any collapsed ancestors, eases the viewport to the node with `setCenter` at zoom 1.1 using the spring from §3.8, and then the RedPen draws a loop around it.

RedPen is an SVG overlay rendered inside `ViewportPortal`, so it pans and zooms with the canvas. Its loop is an ellipse of about 1.1 turns with a small wobble seeded by the person's id, so the same person always gets the same loop, drawn with `stroke-dashoffset`. Any labels it writes use Kavivanar in red pen.

### 6.7 Three views: Tree, Lineage, Table

Lineage is the sketch's left-hand chain: a vertical strip from the earliest known ancestor down to the selected person, with the red pen drawing the arrows between names. It follows the father's line by default, as sketched, with a switch for the mother's line. Unknown stretches appear as pencil rows reading "Unknown generations", and every name opens its profile.

Table is the sketch's bottom row: one row per household, grouped by generation, with the columns Generation, Father, Mother, Years, Children and Details. When a union isn't one man and one woman, the cells carry a small "Parent" label instead. "Years" is the marriage span until §17 says otherwise, and Details opens the profile. The table doubles as the accessible equivalent of the canvas, so every canvas action must also be available here.

### 6.8 Keyboard and screen readers

Nodes are focusable with a roving tab index. Arrow up moves to the parents, arrow down to the first child, and left and right move between siblings; P moves to the partner, Enter opens the profile, Escape closes it and `/` focuses search. Each node's accessible name reads as a sentence: "Annadurai, 1950 to 2010, generation 4, 3 children, born into this family." A "Skip to table view" link comes first inside the canvas region.

### 6.9 Performance budgets

| Budget                                         | Target                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| 500-person tree interactive after data arrives | Under 1 second on a mid-range Android phone         |
| Pan and zoom with 2,000 people                 | 60 fps with `onlyRenderVisibleElements`             |
| Graph payload for 2,000 people                 | Under 400 KB gzipped                                |
| Avatars                                        | 64 and 128 px thumbnails, AVIF with a WebP fallback |
| Tree route initial JavaScript                  | No FeralUI code and no map code                     |

## 7. Data model

### 7.1 Why a graph, drawn as a hierarchy

The sketch's instinct, a hierarchical database, is right about how the tree is shown and wrong about how it should be stored. A strict hierarchy gives each record one parent, but every child has two parents, people remarry, children are adopted, and when cousins marry, one person descends from the root twice. So storage is a small graph: people, unions (the sketch's two-dot ovals) and child links from a union to each of its children. The hierarchy is computed when the tree is drawn (§6.5). Postgres handles this comfortably with recursive CTEs, so no graph database is needed.

### 7.2 Schema

Postgres 16 or later. Every tree-scoped table carries `tree_id`, so authorisation and any future row-level security have a single key to check.

```sql
create extension if not exists pgcrypto;  -- gen_random_uuid()
create extension if not exists citext;
create extension if not exists pg_trgm;

create type tree_role      as enum ('creator', 'editor', 'viewer');
create type gender         as enum ('female', 'male', 'other', 'unknown');
create type living_status  as enum ('living', 'deceased', 'unknown');
create type placeholder    as enum ('unknown_person', 'unknown_generations');
create type child_link     as enum ('biological', 'adopted', 'step', 'foster', 'unknown');
create type visibility     as enum ('self', 'editors', 'members');  -- 'self' = the claimed account, else the creator
create type request_kind   as enum ('join_tree', 'claim_profile', 'confirm_relative', 'friend');
create type request_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');

create table users (
  id           uuid primary key default gen_random_uuid(),
  phone_e164   text unique,
  email        citext unique,
  display_name text not null,
  locale       text not null default 'en-IN',
  created_at   timestamptz not null default now(),
  check (phone_e164 is not null or email is not null)
);

create table trees (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  root_union_id uuid,                                  -- FK added below
  successor_id  uuid references users(id),             -- can take over as creator (§8)
  name_style    text not null default 'as_entered'
                check (name_style in ('as_entered', 'initial_first', 'given_family')),
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,                           -- 30-day grace period
  version       bigint not null default 0              -- bumped on every graph write; the graph ETag
);

create table places (
  id       uuid primary key default gen_random_uuid(),
  tree_id  uuid not null references trees(id),
  name     text not null,                              -- "Thanjavur"
  district text, state text, country text,
  lat      double precision, lng double precision      -- geocoded once; feeds Journeys
);

create table persons (
  id              uuid primary key default gen_random_uuid(),
  tree_id         uuid not null references trees(id),
  display_name    text not null,                       -- how the family says it: "Annadurai"
  given_name      text,
  family_name     text,                                -- optional; many Tamil names have none
  initials        text,                                -- "S.", usually from the father's name
  native_name     text,                                -- "ஆதிரா"
  native_script   text,                                -- ISO 15924: 'Taml', 'Deva', 'Beng'
  name_latin      text,                                -- transliteration, for search
  nicknames       text[] not null default '{}',        -- "Paati", "Chinna Thatha"
  gender          gender not null,
  placeholder     placeholder,                         -- null for real people
  living          living_status not null default 'unknown',
  birth           jsonb,                               -- FuzzyDate (§7.3)
  death           jsonb,                               -- FuzzyDate
  birth_sort      date,                                -- derived from birth, for ordering
  birth_order     smallint,                            -- among siblings; elder or younger drives kinship terms
  native_place_id uuid references places(id),         -- the family's native place
  occupation      text,                                -- sketch: Job
  education       text,                                -- sketch: Degree
  work_place_id   uuid references places(id),          -- sketch: Job location
  photo_key       text,                                -- object storage key; metadata stripped
  claimed_by      uuid references users(id),           -- the account that is this person
  created_by      uuid not null references users(id),
  updated_by      uuid not null references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  row_version     integer not null default 1,          -- optimistic concurrency
  search_text     text generated always as (
    coalesce(display_name, '') || ' ' || coalesce(native_name, '') || ' ' || coalesce(name_latin, '')
  ) stored,
  check (placeholder is null or claimed_by is null)
);
create index persons_by_tree  on persons (tree_id) where deleted_at is null;
create index persons_search   on persons using gin (search_text gin_trgm_ops);
create unique index one_claim_per_tree on persons (tree_id, claimed_by) where claimed_by is not null;

-- Private details live in their own tables so they can never leak through a join on persons.
create table person_contact (                          -- sketch: Address, Mail, Phone No
  person_id  uuid primary key references persons(id) on delete cascade,
  phone_e164 text,
  email      citext,
  address    jsonb,                                    -- line, city, district, state, PIN, country
  visibility visibility not null default 'editors'
);
create table person_body (                             -- sketch: Height, Weight
  person_id  uuid primary key references persons(id) on delete cascade,
  height_cm  numeric(5,1),
  weight_kg  numeric(5,1),
  visibility visibility not null default 'self'
);
create table person_facts (                            -- sketch: Other info
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references persons(id) on delete cascade,
  label      text not null,                            -- "Favourite dish", "Village temple"
  value      text not null,
  visibility visibility not null default 'members'
);

create table unions (                                  -- the sketch's two-dot oval
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references trees(id),
  partner_a   uuid references persons(id),
  partner_b   uuid references persons(id),
  kind        text not null default 'marriage' check (kind in ('marriage', 'partnership', 'unknown')),
  started     jsonb,                                   -- FuzzyDate
  ended       jsonb,                                   -- FuzzyDate
  end_reason  text check (end_reason in ('death', 'divorce', 'separation')),
  hidden      boolean not null default false,          -- hide from the canvas; editors still see it
  row_version integer not null default 1,
  deleted_at  timestamptz,
  check (partner_a is not null or partner_b is not null),
  check (partner_a is distinct from partner_b)
);
alter table trees add constraint trees_root_union_fk foreign key (root_union_id) references unions(id);

create table union_children (
  union_id uuid not null references unions(id),
  child_id uuid not null references persons(id),
  link     child_link not null default 'biological',
  primary key (union_id, child_id)
);
create unique index one_biological_origin on union_children (child_id) where link = 'biological';

create table tree_members (
  tree_id   uuid not null references trees(id),
  user_id   uuid not null references users(id),
  role      tree_role not null,
  joined_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);
create unique index one_creator_per_tree on tree_members (tree_id) where role = 'creator';

create table invites (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references trees(id),
  token_hash bytea not null unique,                    -- only the hash is stored; the token lives in the link
  role       tree_role not null check (role <> 'creator'),
  person_id  uuid references persons(id),              -- "you are Aadhira in this tree"
  created_by uuid not null references users(id),
  expires_at timestamptz not null,
  max_uses   smallint not null default 1,
  uses       smallint not null default 0
);

create table requests (
  id            uuid primary key default gen_random_uuid(),
  kind          request_kind not null,
  from_user     uuid not null references users(id),
  to_user       uuid references users(id),             -- friend
  tree_id       uuid references trees(id),             -- join_tree, claim_profile, confirm_relative
  person_id     uuid references persons(id),           -- claim_profile, confirm_relative
  proposed_role tree_role,
  proposal      jsonb,                                 -- confirm_relative: the proposed links
  message       text,
  status        request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  decided_by    uuid references users(id),
  decided_at    timestamptz
);

create table friendships (
  user_a     uuid not null references users(id),
  user_b     uuid not null references users(id),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table posts (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references trees(id),
  author_id  uuid not null references users(id),
  kind       text not null check (kind in ('note', 'photo', 'milestone', 'memory')),
  body       text,
  media_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table post_people (
  post_id   uuid not null references posts(id),
  person_id uuid not null references persons(id),
  primary key (post_id, person_id)
);
-- comments and reactions follow the usual shape and are omitted here.

create table tree_events (                             -- the audit log
  id        bigint generated always as identity primary key,
  tree_id   uuid not null references trees(id),
  actor_id  uuid not null references users(id),
  action    text not null,                             -- 'person.update', 'union.child.add', 'member.role'
  entity_id uuid not null,
  before    jsonb,
  after     jsonb,
  at        timestamptz not null default now()
);
```

### 7.3 Dates, names and who is living

Old records rarely have exact dates, so every date is a FuzzyDate. The schema is shared by the client form and the server.

```ts
// lib/fuzzy-date.ts
import { z } from "zod";

const year = z.number().int().min(1500).max(2100);
const month = z.number().int().min(1).max(12);

export const FuzzyDate = z
  .union([
    z.object({
      q: z.literal("exact"),
      y: year,
      m: month.optional(),
      d: z.number().int().min(1).max(31).optional(),
    }),
    z.object({ q: z.enum(["about", "before", "after"]), y: year, m: month.optional() }),
    z.object({ q: z.literal("between"), y: year, y2: year }),
  ])
  .superRefine((v, ctx) => {
    if (v.q === "between" && v.y2 <= v.y)
      ctx.addIssue({ code: "custom", message: "The second year must be later than the first." });
  });
export type FuzzyDate = z.infer<typeof FuzzyDate>;
```

| Stored                                 | Shown       | Ink or pencil            |
| -------------------------------------- | ----------- | ------------------------ |
| `{ q: 'exact', y: 1950, m: 3, d: 14 }` | 14 Mar 1950 | Ink                      |
| `{ q: 'exact', y: 1950 }`              | 1950        | Ink                      |
| `{ q: 'about', y: 1920 }`              | about 1920  | Pencil, dashed underline |
| `{ q: 'before', y: 1950 }`             | before 1950 | Pencil                   |
| `{ q: 'between', y: 1918, y2: 1922 }`  | 1918 – 1922 | Pencil                   |

`birth_sort` is the earliest date the value allows: 1 January of the year when month and day are missing, and the first year of a range.

A person counts as deceased if a death date is present or they are marked deceased; otherwise, anyone born 110 or more years ago is treated as deceased for display and privacy. Everyone else, including anyone whose status is unknown, is treated as living, which is the more private default.

Names display as `display_name` everywhere. The native-script name appears beneath it whenever it differs from the viewer's script. The tree's `name_style` decides whether initials come first, as in "S. Aadhira", given and family names are combined, or the name is shown exactly as entered.

### 7.4 Key queries

For the canvas, fetch the whole tree graph in one request (people with fields filtered by visibility, unions, child links) and compute generations in the layout worker. The recursive queries below serve server-side features: the lineage endpoint, cycle checks and reminders such as a great-grandfather's remembrance day.

```sql
-- All known ancestors of :person with their depth; the lineage view picks one line in application code.
with recursive up (person_id, depth, path) as (
  select :person::uuid, 0, array[:person::uuid]
  union all
  select parent.id, up.depth + 1, up.path || parent.id
  from up
  join union_children uc on uc.child_id = up.person_id
  join unions u          on u.id = uc.union_id and u.deleted_at is null
  join persons parent    on parent.id in (u.partner_a, u.partner_b) and parent.deleted_at is null
  where not parent.id = any (up.path)          -- guard only; writes already reject cycles
)
select * from up;

-- Every household below the root with its generation number (G1 = root).
with recursive hh (union_id, gen, path) as (
  select t.root_union_id, 1, array[t.root_union_id] from trees t where t.id = :tree
  union all
  select cu.id, hh.gen + 1, hh.path || cu.id
  from hh
  join union_children uc on uc.union_id = hh.union_id
  join unions cu         on uc.child_id in (cu.partner_a, cu.partner_b) and cu.deleted_at is null
  where not cu.id = any (hh.path)
)
select union_id, min(gen) as gen from hh group by union_id;
```

### 7.5 Integrity rules

These are enforced in the service layer inside the same transaction as the write, which keeps them testable and readable.

| Rule                                                                   | Enforcement                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Nobody is their own ancestor                                           | Before adding a child to a union or changing a partner, run the ancestors query from both partners and reject if the child appears |
| At most one biological origin per person                               | Partial unique index `one_biological_origin`                                                                                       |
| Partners and children belong to the same tree as the union             | Checked on write                                                                                                                   |
| Placeholders cannot be claimed or hold contact details                 | Check constraint, plus a service check on `person_contact`                                                                         |
| Removing a person is a soft delete                                     | Links are kept; restoring brings them back; a nightly job purges after 30 days                                                     |
| Every graph write bumps `trees.version` and writes a `tree_events` row | One helper wraps all graph mutations                                                                                               |
| Concurrent edits don't overwrite each other                            | Writes send `row_version`; a mismatch returns 409 and the form shows both values                                                   |

## 8. Access control

The roles come straight from the sketch's Access box. They govern the tree's data; posting, commenting and reacting are open to every member, because a viewer is still family.

| Action                                                             | Creator  | Editor                   | Viewer                            |
| ------------------------------------------------------------------ | -------- | ------------------------ | --------------------------------- |
| See the tree and profiles, subject to field visibility             | Yes      | Yes                      | Yes                               |
| Download the tree as PNG or PDF, containing only what they can see | Yes      | Yes                      | Yes                               |
| Export all data as JSON or GEDCOM                                  | Yes      | No                       | No                                |
| Add and edit people, unions, children and photos                   | Yes      | Yes                      | No (suggesting edits comes later) |
| Remove a person (soft delete, 30 days)                             | Yes      | No                       | No                                |
| Rename the tree or change its root                                 | Yes      | No                       | No                                |
| Delete the tree (typed confirmation, 30-day grace period)          | Yes      | No                       | No                                |
| Invite members                                                     | Any role | Viewers only             | No; they can ask the creator      |
| Approve join and claim requests                                    | Yes      | For the viewer role only | No                                |
| Change roles or remove members                                     | Yes      | No                       | No                                |
| Transfer the creator role, name a successor                        | Yes      | No                       | No                                |
| Post, comment and react                                            | Yes      | Yes                      | Yes                               |

| Field group                                                | Default visibility                                              | Can be changed to        |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| Name, gender, lifespan, photo, relationships               | Members                                                         |                          |
| Contact details of a living person (phone, email, address) | Editors                                                         | Self, editors or members |
| Height and weight                                          | Self                                                            | Self, editors or members |
| Other info                                                 | Members                                                         | Set per fact             |
| Anyone under 18                                            | Viewers see birth year only; no contact or address fields exist |                          |

"Self" means the account that has claimed the profile, or the creator while it is unclaimed. Visibility is applied in the server's serializer, so hidden fields never reach the client, and exports go through the same serializer.

Authorisation lives in one policy module, `can(user, action, resource)`, which every route calls. Each row of the matrix above gets an API test. Postgres row-level security keyed on `tree_id` is optional defence in depth, not the primary mechanism.

Families outlive accounts. The creator can transfer the role at any time and can name a successor (`trees.successor_id`), who can claim the creator role after 12 months of creator inactivity, with notice sent to the creator first.

## 9. Requests and invites

The sketch's "Friends Request" card becomes one inbox with four kinds of request.

| Kind                                                       | Sent by                                                      | Approved by                               | On accept                                                                          | Ships in |
| ---------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Join tree                                                  | Anyone signed in who has the tree's link                     | Creator, or an editor for the viewer role | A membership row with the proposed role                                            | M2       |
| Claim profile ("this is me")                               | A member, from a node                                        | Creator or editor                         | `persons.claimed_by` is set, and that account can now edit its own contact details | M2       |
| Confirm relative ("Meena is my cousin, through Chinaiyan") | A member                                                     | Creator or editor                         | The missing people and links are created from the proposal                         | M3       |
| Friend                                                     | One user to another, for family friends who aren't relatives | The recipient                             | A friendship row; friends appear on each other's profile                           | M3       |

Requests move from pending to accepted, declined, cancelled or expired, and expire after 30 days. Pending duplicates of the same kind, sender and target are rejected, and each user can send at most 20 requests a day. Every create and decision sends a notification.

Invites are how most relatives will arrive. An invite link carries a random token (only its hash is stored), a role and optionally the person it's for, so the invitee lands on "You're Aadhira in this tree" with the right node already circled in red pen. Sharing uses the Web Share API with a WhatsApp fallback link. Invited sign-ups skip ClawCaptcha and go straight to a phone OTP.

## 10. The profile form

Every field from the sketch's profile box is kept. Two fields are added because the rest of the product needs them: native place (for Journeys) and birth order (for elder and younger kinship terms).

| Field         | On the sketch  | Type                                                                                            | Required | Default visibility               | Notes                                              |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------- | -------- | -------------------------------- | -------------------------------------------------- |
| Name          | Name\*         | Display name, plus optional given name, family name, initials, native-script name and nicknames | Yes      | Members                          | Never requires a surname                           |
| Gender        | Gender\*       | Female, male, other, unknown                                                                    | Yes      | Members                          | "Unknown" suits placeholders and distant ancestors |
| Date of birth | D.O.B          | FuzzyDate                                                                                       | No       | Members; year only for under-18s |                                                    |
| Date of death | D.O.D          | FuzzyDate, or "died, date unknown"                                                              | No       | Members                          | Sets the person as deceased                        |
| Height        | Height         | cm                                                                                              | No       | Self                             |                                                    |
| Weight        | Weight         | kg                                                                                              | No       | Self                             |                                                    |
| Address       | Address        | Structured: line, city, district, state, PIN, country                                           | No       | Editors                          | Living people only; never shown on the canvas      |
| Email         | Mail           | Email                                                                                           | No       | Editors                          |                                                    |
| Phone         | Phone No       | E.164, defaulting to +91                                                                        | No       | Editors                          |                                                    |
| Occupation    | Job            | Text                                                                                            | No       | Members                          |                                                    |
| Education     | Degree         | Text                                                                                            | No       | Members                          |                                                    |
| Work location | Job location   | Place                                                                                           | No       | Members                          |                                                    |
| Other info    | Other info     | Label and value pairs                                                                           | No       | Set per fact                     |                                                    |
| Photo         | The square box | Image, cropped square                                                                           | No       | Members                          | Metadata stripped on upload                        |
| Native place  | Added          | Place                                                                                           | No       | Members                          | Feeds Journeys                                     |
| Birth order   | Added          | Number among siblings                                                                           | No       | Members                          | Elder and younger kinship terms depend on it       |

The sheet groups the fields into tabs: About (name, gender, dates, photo), Contact (only for living people), Life (occupation, education, work location, native place), Body (height, weight) and Other info. FuzzyDateInput is a segmented control (Exact, About, Before, After, Between) followed by a year, with month and day appearing only for Exact. Saving is explicit through a "Save changes" button, validated by the same zod schemas on both sides. If someone else saved first, the 409 response shows "Meena changed this while you were editing" with both values side by side.

## 11. Feed and reminders

Each tree has one private feed. A post is a note, a photo, a milestone (a birth, wedding or graduation, marked with highlighter) or a memory. Posts can tag people, including ancestors who never had an account, and a tagged post also appears on that person's profile. Memories tagged to someone who has died follow the calm rules from §3.8.

Reminders are what bring families back. Birthdays and anniversaries appear as a highlighter strip at the top of the feed on the day, and as a notification the evening before. Remembrance days (death anniversaries) are opt-in per person, use calm styling and never use highlighter. Many families mark these by the Tamil or Hindu lunar calendar rather than the Gregorian date; support for that comes later and must be noted in the UI until then. In the MVP, posts are visible to tree members only.

## 12. API surface

REST over JSON, with every route calling the policy module from §8. "Editor+" means the creator or an editor.

| Method and path                                                                       | Who                                                         | Notes                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /auth/otp/start`, `POST /auth/otp/verify`                                       | Anyone                                                      | Phone or email; rate-limited                                                         |
| `GET /trees`                                                                          | Signed in                                                   | Trees I belong to                                                                    |
| `POST /trees`                                                                         | Signed in                                                   | Creates the tree, the creator membership and a person for "me"                       |
| `GET /trees/:treeId/graph`                                                            | Member                                                      | People (fields filtered by visibility), unions, child links; ETag is `trees.version` |
| `POST /trees/:treeId/people`                                                          | Editor+                                                     |                                                                                      |
| `PATCH /people/:personId`                                                             | Editor+, or the claimed account for its own contact fields  | Send `row_version`; 409 on conflict                                                  |
| `DELETE /people/:personId`                                                            | Creator                                                     | Soft delete; `POST /people/:personId/restore` within 30 days                         |
| `POST /trees/:treeId/unions`, `PATCH /unions/:unionId`                                | Editor+                                                     |                                                                                      |
| `POST /unions/:unionId/children`                                                      | Editor+                                                     | Runs the cycle check                                                                 |
| `GET /people/:personId/lineage?line=father`                                           | Member                                                      | `line` is `father` or `mother`; the ordered chain includes placeholders              |
| `GET /trees/:treeId/search?q=`                                                        | Member                                                      | Trigram match on names                                                               |
| `GET /trees/:treeId/members`, `PATCH` and `DELETE /trees/:treeId/members/:userId`     | Creator                                                     | Role changes are audited                                                             |
| `POST /trees/:treeId/invites`                                                         | Creator for any role, editor for viewers                    | Returns the share link once                                                          |
| `POST /invites/:token/accept`                                                         | Signed in                                                   |                                                                                      |
| `GET /requests`, `POST /requests`, `POST /requests/:id/accept`, `/decline`, `/cancel` | Per §9                                                      |                                                                                      |
| `GET /trees/:treeId/export?format=png`                                                | Member for `png` and `pdf`; creator for `json` and `gedcom` | Only ever contains what the requester can see                                        |
| `GET` and `POST /trees/:treeId/posts`, plus comments and reactions                    | Member                                                      |                                                                                      |
| `GET /trees/:treeId/events`                                                           | Creator                                                     | The audit log                                                                        |

## 13. Stack

| Layer         | Default                                                             | Why                                                                              | Fine to swap for                                         |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Web app       | Next.js App Router, React 19, TypeScript                            | The FeralUI pieces are React; server rendering suits invite previews and sign-in | A Vite SPA plus an API, if server rendering isn't needed |
| Styling       | Tailwind v4 with the tokens from §3.4                               | shadcn's current setup; FeralUI pieces theme through CSS variables               |                                                          |
| Components    | shadcn/ui on Base UI                                                | Owned code on accessible primitives                                              | Radix                                                    |
| Motion        | `motion` (motion.dev)                                               | Springs for canvas focus and sheets                                              |                                                          |
| Tree          | `@xyflow/react` and `d3-hierarchy`                                  | §6                                                                               | A family-chart spike                                     |
| Forms         | react-hook-form with zod, schemas shared with the server            |                                                                                  |                                                          |
| Data fetching | TanStack Query                                                      | Caching, optimistic updates, ETag revalidation                                   |                                                          |
| Database      | Postgres 16 or later with `pg_trgm` and `citext`                    | Recursive CTEs, jsonb and trigram search                                         |                                                          |
| Data access   | Drizzle                                                             | SQL-first, so the CTEs stay readable                                             | Prisma                                                   |
| Auth          | Any provider with phone OTP and email magic links                   | Many elders have a phone number but no email address                             |                                                          |
| Media         | S3-compatible storage; `sharp` strips metadata and makes thumbnails | §14                                                                              |                                                          |
| Realtime      | Server-sent events for notifications                                | Enough for the MVP                                                               | WebSockets                                               |
| Bot check     | Cloudflare Turnstile, verified on the server                        | ClawCaptcha is not security (§4)                                                 | hCaptcha                                                 |
| Languages     | next-intl with ICU messages                                         | en-IN and ta-IN first                                                            |                                                          |
| Tests         | Vitest, Playwright, axe                                             | Every row of the §8 matrix gets an API test                                      |                                                          |

## 14. Privacy and safety

A family tree is mostly information about people who never signed up for anything, including children and the dead, so the defaults lean private.

| Risk                                                     | Mitigation                                                                                                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Distant relatives harvesting phone numbers and addresses | Contact fields default to editors, are never drawn on the canvas and never appear in viewer exports                                                                                                                        |
| Children's data                                          | Under 18, viewers see the birth year only, and contact and address fields don't exist. India's Digital Personal Data Protection Act, 2023 has specific consent rules for children's data; get a legal review before launch |
| Photos revealing where people live                       | Strip EXIF and GPS data on the server at upload, re-encode, and serve through signed URLs                                                                                                                                  |
| People added without having a say                        | A living person can claim their profile and hide fields; anyone can ask the creator to remove them                                                                                                                         |
| Divorce, estrangement and grief                          | A union can be hidden from the canvas while editors still see it; remembrance reminders are opt-in per person                                                                                                              |
| Edits nobody can trace                                   | Every write lands in `tree_events`; the creator can read the log; removed people can be restored for 30 days                                                                                                               |
| Account takeover                                         | OTP rate limits, a session list with revoke, alerts on role changes                                                                                                                                                        |
| A family losing its tree when the creator is gone        | Transfer and successor rules (§8)                                                                                                                                                                                          |
| Bots                                                     | Turnstile on sign-up; invite links are single-use by default                                                                                                                                                               |

## 15. Accessibility and language

The target is WCAG 2.2 AA. Touch targets are at least 44 px, the text-size setting (§3.5) scales everything, and the Table view is a complete equivalent of the canvas (§6.7). Keyboard paths through the tree are specified in §6.8, and reduced motion is honoured everywhere (§3.8). Run axe in CI on the kitchen-sink page, the tree and the profile sheet.

The UI launches in English (en-IN) and Tamil (ta-IN), with Hindi next. Names are data rather than translations, and every name field accepts any script.

Kinship terms (M5) are where this product can feel native in a way generic tree apps don't. English collapses distinctions that Tamil and Hindi make, such as which side of the family and whether someone is older or younger. The engine should therefore compute a structured path between two people, and each locale maps that path to a word.

| Computed path            | English     | Tamil     | Hindi  |
| ------------------------ | ----------- | --------- | ------ |
| Father's father          | Grandfather | Thatha    | Dada   |
| Mother's father          | Grandfather | Thatha    | Nana   |
| Father's elder brother   | Uncle       | Periyappa | Tau    |
| Father's younger brother | Uncle       | Chithappa | Chacha |
| Father's sister          | Aunt        | Athai     | Bua    |
| Mother's brother         | Uncle       | Mama      | Mama   |
| Mother's younger sister  | Aunt        | Chithi    | Mausi  |

Elder and younger terms need birth order, which is why the form asks for it (§10). Regional variants are common, so a family can override the word used for any relative.

## 16. Milestones

Sizes are relative: S is about a week for one engineer, M two to three weeks, L four or more.

| Milestone              | Scope                                                                                                                                                                  | Done when                                                                                                                                                                                                                                                                                                                                                                     | Size |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| M0 Foundations         | Tokens, fonts, shadcn mapping, the Notebook and Slate themes with PullCord, CI with typecheck, Vitest, Playwright and axe                                              | A kitchen-sink page renders every token in both themes with no axe violations                                                                                                                                                                                                                                                                                                 | S    |
| M1 Tree core           | Schema, people and union editing, placeholders, the tree canvas (pods, ruler, minimap, search with the red pen), profile sheet, Lineage and Table views, ta-IN strings | Both lineages from the sketch can be entered, including the blank gap and the X. The sketch's shape (one couple, two couples below, four children) renders with the correct filled and hollow circles. Searching "Aadhira" centres and circles her. The Table view shows the sketch's row. A 500-person fixture is interactive in under 1 second on a mid-range Android phone | L    |
| M2 Access and requests | Roles, invites with WhatsApp sharing, join and claim requests, field visibility, audit log, soft delete and restore, ClawCaptcha plus Turnstile on uninvited sign-up   | Every row of the §8 matrix has a passing API test; a viewer's export contains no hidden fields; a removed person can be restored for 30 days                                                                                                                                                                                                                                  | M    |
| M3 Social              | Feed, posts tagged to people, reminders, notifications, friend and confirm-relative requests, Blob                                                                     | The birthday strip appears on the day; memory posts on the profile of someone who has died show no playful motion                                                                                                                                                                                                                                                             | M    |
| M4 Delight             | Journeys with AniMaps, the heirloom card, Crumple and Vacuum, a PDF poster export                                                                                      | A lineage's native places export as a vertical video; AniMaps' licence is confirmed in writing                                                                                                                                                                                                                                                                                | M    |
| M5 Depth               | GEDCOM import and export, kinship terms in Tamil and Hindi, links between trees, transliterated search, PWA push                                                       | A GEDCOM round trip loses no people or links; the kinship table above passes as tests                                                                                                                                                                                                                                                                                         | L    |

## 17. Open questions

Each question has a default, so work proceeds while it's being answered.

| Question                                                                                                                               | Default until answered                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| "Play" and the tic-tac-toe grid are printed on the notebook page. Do you want games at all?                                            | Out of scope                                                              |
| What do the filled and hollow circles in G2 mean?                                                                                      | Filled was born into this tree; hollow married in                         |
| Whose years are "1950/2010" in the table row?                                                                                          | The marriage span                                                         |
| What is the last cell of the row ("OF")?                                                                                               | Other info, opening the full profile                                      |
| Do the double-headed arrows (after the blank line, and between Sourab and Srijan) mean something different, such as an uncertain link? | An ordinary parent-to-child link                                          |
| Should Lineage follow the father's line by default?                                                                                    | Yes, as sketched, with a switch for the mother's line                     |
| Tamil-first, or pan-Indian from launch?                                                                                                | Pan-Indian product, launching in English and Tamil, under the name Banyan |
| Can editors remove people?                                                                                                             | No, only the creator                                                      |
| How are "N…than" and "Sankar P…" spelled?                                                                                              | Left marked for confirmation in the seed data                             |
| What are height and weight for?                                                                                                        | Kept, private to the person by default                                    |

## Appendix A. Seed data from the sketch

```ts
// fixtures/sketch-lineages.ts
// Transcribed from the sketch. Spellings marked "confirm" were hard to read.
// Genders are left as 'unknown' on purpose; fill them in rather than guessing from names.

type SeedPerson = {
  key: string;
  name: string;
  placeholder?: "unknown_person" | "unknown_generations";
  note?: string;
};

// Each array is a parent-to-child chain. The seeder creates one single-partner union per parent,
// with gender 'unknown' and no dates, and makes the first union of lineageA the tree's root.
export const lineageA: SeedPerson[] = [
  { key: "koothan", name: "Koothan", note: "circled in the sketch: earliest known ancestor" },
  { key: "gapA", name: "Unknown generations", placeholder: "unknown_generations" },
  { key: "nthan", name: "N…than", note: "confirm spelling" },
  { key: "chinaiyan", name: "Chinaiyan" },
  { key: "annadurai", name: "Annadurai" },
  { key: "swaminathan", name: "Swaminathan" },
  { key: "aadhira", name: "Aadhira" },
];

export const lineageB: SeedPerson[] = [
  { key: "unknownB", name: "Unknown", placeholder: "unknown_person", note: "the X in the sketch" },
  { key: "sankar", name: "Sankar P…", note: "confirm spelling" },
  { key: "sourab", name: "Sourab" },
  { key: "srijan", name: "Srijan" },
];

// Shape fixture for rendering tests: the sketch's tree with generated names.
// One root couple (G1) -> two married children (G2) -> two children each (G3).
```

## Appendix B. References

| Resource                          | Link                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| FeralUI                           | https://feralui.dev/                                         |
| FeralUI Brandkit                  | https://feralui.dev/brandkit                                 |
| PullCord                          | https://github.com/mortspace/pullcord                        |
| ClawCaptcha (playcaptcha)         | https://github.com/mortspace/playcaptcha                     |
| AniMaps                           | https://github.com/mortspace/animaps                         |
| DeskFolio                         | https://github.com/mortspace/Deskfolio                       |
| React Flow MiniMap                | https://reactflow.dev/api-reference/components/minimap       |
| shadcn/ui, Base UI as the default | https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default |
| Anek                              | https://design.google/library/anek-multiscript               |
| Kavivanar                         | https://fonts.google.com/specimen/Kavivanar/about            |
| family-chart                      | https://github.com/donatso/family-chart                      |
