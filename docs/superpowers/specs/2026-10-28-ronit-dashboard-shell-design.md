# Or HaTzadik dashboard shell: design

- **Date:** 2026-10-28
- **Status:** design approved, spec under review
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** whoever builds the shell, and the reviewer of this spec

## 1. Goal

Build a clickable shell of Ronit's business dashboard: every screen in the PRD, on desktop and on phones, in the approved look, with motion as smooth as macOS. It runs on mock data behind a small data layer, so her API can be connected later, one area at a time, without touching the screens.

## 2. Sources of truth

| What | Where |
|---|---|
| Requirements | `Ronit - project .pdf` (repo root) |
| Approved design | Canvas https://claude.ai/artifact/66CNW6TQi5C9HmxnXDjN9c: the Desktop page has 10 screens at 1440×900, the Mobile page has 10 screens at 390×844 |
| Design source | `design/canvas/project/*.dc.html` (one file per screen) |
| Tokens, components, motion curves | `design/canvas/assets/or-theme.css`; the code theme is ported from this file |
| Logo | `brand/logo-cropped.png`, `brand/logo.webp` |
| House conventions | Ronit's landing pages (`uman-tu-bav-landing`): RTL set on the document, logical CSS only, LTR numbers in `<bdi>`, tokens only in the theme, no Hebrew strings in JSX |

When the canvas and this spec disagree on looks, the canvas wins. When they disagree on behavior, this spec wins.

## 3. Scope

**In scope**

- Every screen on the canvas, in both shells:
  - sign in
  - overview
  - leads and lead detail
  - customers and passports, and the customer profile
  - groups and flights
  - holiday greetings
  - birthdays
  - users and access, which becomes the account screen on phones
  - Monday import
- Navigation, deep links and browser back.
- The design system as React components.
- The motion system in section 8.
- Mock data with working filters, search and edits, plus loading, empty and error states.
- Unit, component and end-to-end smoke tests.

**Out of scope for the shell** (section 16 lists what comes later)

- Real sign-in and two-step verification.
- Any call to Ronit's API, and any database.
- Sending WhatsApp messages.
- Reading passports from photos.
- Running the Monday import.
- Deployment.
- Dark mode.
- A translation layer.

## 4. Stack

- **Core:** Vite, React 19 and TypeScript in strict mode.
- **Styling:** Tailwind CSS v4, with every token in one `@theme` block.
- **Motion:** Motion (`motion/react`), the successor of the Framer Motion her landing pages use.
- **Routing:** React Router v7 (`createBrowserRouter`).
- **Data fetching:** TanStack Query v5.
- **Font:** Rubik, self-hosted through `@fontsource-variable/rubik`. The app makes no font requests to Google.
- **Tests:** Vitest with Testing Library, and Playwright.
- **Tooling:** npm, the same as her landing pages. Install the current stable versions at setup time, and check that the installed Node version meets Vite's minimum.

## 5. Repository layout

The git repo root is `D:\work\RONIT-AUTOMATION`. The app lives in `dashboard/`.

```
docs/superpowers/specs/      this spec
dashboard/
  index.html                 <html lang="he" dir="rtl">, notranslate meta
  src/
    main.tsx
    app/                     router, providers, auth guard
    shells/                  DesktopShell, PhoneShell, useShell
    screens/                 one folder per screen
    ui/                      design-system components
    motion/                  springs, PageTransition, PushStack
    data/
      types.ts               domain model
      services/              one interface per area
      mock/                  fixtures, seeded generator, mock adapter
      http/                  API adapter stubs (later)
      queries/               TanStack Query hooks
    content/                 UI strings per screen (*.he.ts)
    lib/                     formatting helpers
    styles/                  theme.css (@theme tokens), scene.css
  tests/e2e/                 Playwright
```

Conventions:
- Hebrew UI strings live in `src/content/`. Names and notes are data and live in `data/mock/`.
- Use only logical utilities (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`).
- JSX contains no hex values.

## 6. Shells and navigation

One route tree serves both shells. `useShell()` returns `desktop` from 1024px wide and up, and `phone` below that. Screens read it to pick their layout.

**DesktopShell**

- **Rail (at the screen edge: on the right in Hebrew, on the left in English):**
  - The logo.
  - The six sections as icons: סקירה, לידים (with the new-leads count), לקוחות ודרכונים, קבוצות וטיסות, ברכות לחגים, ימי הולדת. Their names appear beside the rail on hover.
  - WhatsApp passports, with a count badge, linking to `/customers?filter=whatsapp`.
  - Monday import.
  - Message history, linking to the history on `/greetings/holidays`.
  - Users and permissions.
  - Ronit's avatar, which signs out.
- **Top bar:**
  - The search field at the start; the language switch and notifications at the end.
- **Content panel:** a large rounded panel beside the rail holds the top bar and the page. It is drawn as one shape whose edge reaches out around the current rail item, so that item sits in a bump of the panel.
- **Scrolling:** the rail and the panel stay fixed and only the content area scrolls.

**PhoneShell**

- **Tab bar:** a floating glass bar with בית, לידים, לקוחות, קבוצות and ברכות. Holidays and birthdays share the ברכות tab through a segmented control.
- **Avatar:** Ronit's avatar at the top opens the account and admin screen.
- **Pushed screens:** lead detail, customer profile, account and import slide in as pushed screens, and their back arrow points right.

**Routes**

| Path | Screen | Desktop | Phone |
|---|---|---|---|
| `/login` | Sign in | composition with the orb card | stacked cards |
| `/` | Overview | bento grid | stacked cards, groups carousel |
| `/leads` | Leads | table grouped by trip, filters | grouped list, filter chips |
| `/leads/:leadId` | Lead detail | side panel over the table | pushed screen |
| `/customers` | Customers and passports | WhatsApp inbox and table | inbox and list |
| `/customers/:customerId` | Customer profile | page | pushed screen |
| `/groups` and `/groups/:groupId` | Groups and flights | group cards, participants, readiness, flight | selected group, carousel, missing passports |
| `/greetings/holidays` | Holiday greetings | orb countdown, editor, preview, send, history | same, stacked |
| `/greetings/birthdays` | Birthdays | today, automation, week, template | same, stacked |
| `/users` | Users and access | tables and security | account and admin screen |
| `/import` | Monday import | results, steps, boards, mapping | same, stacked, pushed screen |

**Sign-in guard:** an unauthenticated visitor goes to `/login`. In the shell, any email and password signs in. The mock session is kept in `sessionStorage` and cleared on sign-out.

**Global controls**
- **Search (desktop top bar):**
  - As you type, a glass dropdown shows up to five matching leads and customers by name or phone.
  - Enter opens the first match.
  - On phones, search lives in the leads and customers screens, as designed.
- **Notifications:**
  - The bell opens a glass popover with the two mock notifications: passports waiting for review, and the Hanukkah greeting waiting for approval.
  - Each notification links to its screen.
- **Sign-in helpers:** "שכחתי" and "צריכים עזרה?" each open a short sheet with mock text: a reset link was sent, and how to reach the office.

## 7. Design system

### Tokens (ported from `or-theme.css`)

**Colors**

| Token | Value | Use |
|---|---|---|
| `ink` | #1c1a18 | headings, black cards, primary buttons |
| `text` | #36312d | body |
| `mute` | #635b55 | secondary text, at least 5:1 on white and glass |
| `mute-2` | #4f4843 | small text on the frosted strip over the orb |
| `faint` | #7d756e | second line of headlines, 24px and larger only |
| `line` | #efe9e2 | dividers |
| `gold` | #e0ab57 | highlights, current step, the switch on dark |

**Surfaces**

| Surface | Look | Use |
|---|---|---|
| Ground | Sand gradient from #f3eee8 to #e3d9ce, plus the CSS scene (pearls, pebbles, glass dome, gold glow) | The page background |
| Glass | `rgba(251,248,244,.5)` with blur 28px and saturate 1.3, a white rim and an inner highlight | Navigation, panels and some lists |
| White | #fff with a long soft shadow | Tables and lists |
| Ink | #1c1a18 with a gold glow in the corner | One highlight per screen |

**Orb:** a radial gold gradient taken from the logo, sitting half behind a frosted strip.

**Status:** each status is a dot plus its word, never color alone.

| Status | Dot |
|---|---|
| חדש | #d39c43 |
| בשיחה | #b46c46 |
| נשלחו פרטים | #8a7867 |
| הרשמה הושלמה | #5b8753 |
| לא רלוונטי | #c2b9b0 |
| Warning | #bd4b2e |

**Type:** Rubik.

| Role | Size | Weight |
|---|---|---|
| Display | 44px, 42px or 30px | 300 |
| Card title | 17px | 500 |
| Body | 15px | 400 |
| Small | 13.5px | 400 |
| Extra small | 12.5px | 400 |

Headlines are two-tone, `ink` over `faint`, as on the canvas.

**Shape:**
- Radii: cards 30px (26px on phones), inner blocks 18–22px, pills fully round.

### Components (`src/ui`)

Every component has typed props, an accessible name and correct RTL behavior.

| Component | Purpose |
|---|---|
| `Scene` | Background pearls, dome and glow |
| `GlassPanel`, `Card`, `InkCard` | The three surfaces |
| `OrbCard` | Orb, frosted strip and side area: date, countdown, readiness |
| `GooButton` | The joined pill and circle for primary actions |
| `Button` | Solid, outline, white and small variants |
| `IconButton` | Round icon-only control with a label |
| `Field`, `TextArea` | Pill input with an icon circle and an optional inline action such as "שכחתי" |
| `Chip`, `ChipGroup`, `Segmented` | Filters and switches between views |
| `StatusTag`, `Avatar` | Status dot and word, initials or the gold avatar |
| `DataTable` | Group header rows, row hover, selected row, horizontal scroll inside its card |
| `KeyValue`, `Timeline`, `Meter`, `SegBar`, `Steps` | Details, history, progress |
| `BarChart`, `StackedBar` | Weekly leads; read, delivered and failed |
| `Switch` | Settings toggles |
| `ChatPreview` | WhatsApp-style message preview |
| `Toast`, `Skeleton`, `EmptyState`, `ErrorState` | Feedback and states |
| `Rail`, `LiquidPanel`, `TabBar`, `LiquidDrop`, `StackOutlet` | Navigation |

## 8. Motion

Motion is a first-class requirement: it should feel like macOS.

**Rules**
- Only spring physics.
- Only `transform` and `opacity` animate.
- Every animation is interruptible, short and purposeful.
- `<MotionConfig reducedMotion="user">` turns movement off for anyone with Reduce Motion on, keeping fades only.
- With Reduce Transparency on, glass becomes the solid #f6f2ed.

**Springs** (`motion/springs.ts`)

| Name | Settings | Used for |
|---|---|---|
| `ui` | `{ type: "spring", visualDuration: 0.25, bounce: 0.15 }` | Segmented control, presses, showing and hiding |
| `surface` | `{ type: "spring", visualDuration: 0.4, bounce: 0.1 }` | Pages, cards, panels, sheets |
| `gentle` | `{ type: "spring", visualDuration: 0.6, bounce: 0 }` | Charts, meters, number count-ups |
| `liquidLead`, `liquidTrail` | `visualDuration` 0.3 and 0.5, `bounce` 0.3 and 0.2 | The navigation bump and drop: the edge in front leads, the edge behind follows |

**Choreography**

- **Liquid navigation:** on desktop the content panel's bump flows along its edge to the current rail item; on phones the tab bar's ink drop flows to the current tab. Both move on two springs: the edge in front leads and the edge behind follows, so the shape stretches on the way, thins a little and settles with a wobble. On the rail a bead of water follows the pointer. Under Reduce Motion they move without travel.
- **Shared highlights:** the segmented controls and the selected filter chip move between items through `layoutId`.
- **Which transition:** switching between top-level sections (menu items, tabs) uses the page change. Opening a lead, a customer, the account or the import on a phone uses the push.
- **Page change:**
  - Pages are wrapped in `AnimatePresence`, keyed by route.
  - The new page fades in and rises 12px on the `surface` spring.
  - Its cards stagger by 40ms, on the visit's first page only. The pages opened after it already have their data, so they rise in with their content in place.
  - The old page fades out in 120ms, without moving.
- **Phone push:**
  - The new screen enters from the left (`x: -100% → 0`, forward in RTL).
  - The screen underneath shifts right by 30% and dims slightly.
  - Back reverses both, and the direction follows browser history.
- **Lists:**
  - Rows use `layout`, so filtering reflows them smoothly.
  - Removed rows leave through `AnimatePresence mode="popLayout"`.
  - Re-filtering never staggers.
- **Panels and sheets:**
  - The desktop lead panel slides in from the inline-end side.
  - Phone sheets rise from the bottom and can be dragged closed, past 30% of their height or above 500px/s.
- **Feedback:**
  - Buttons, chips and tabs press to scale 0.96 on the `ui` spring.
  - Link cards lift 3px on hover.
- **Data** (on the visit's first page; later pages show it in place):
  - Weekly bars grow from the baseline, staggered by 30ms.
  - Meters fill from the inline-start side.
  - Hero numbers count up once, the first time they come into view.

**Performance budget**
- 60fps on desktop, and on a mid-range phone profile (Chrome DevTools with 4× CPU throttling). No task over 50ms during a transition.
- Never animate `backdrop-filter`, shadows or layout properties.
- At most three glass layers in view on phones.
- The customers table pages at 25 rows. Every other list is short enough to show in full.

The canvas prototype already uses the same curves in CSS, so it doubles as the motion reference.

## 9. Data layer

### Domain model (`data/types.ts`)

**Leads**
- `Lead`: id, name, phone, source, status, groupId, assigneeId, createdAt, updatedAt, lastNote, history.
- `LeadStatus`: one of the five statuses in section 7.
- `LeadEvent`: one entry in a lead's history.

**Customers and passports**
- `Customer`: id, first and last name, phone, whatsappConnected, groupIds, source, assigneeId, since, passport, notes, messages.
- `Passport`: number, birth date, issue date, expiry date, nationality, received via, received at, photo available.
- `PassportIntake`: one passport from the WhatsApp inbox, with the result `matched`, `new-card` or `needs-review` and the reason.

**Groups**
- `Group`: id, name, type (flight or event), womenOnly, capacity, registered, dates, flight, participants.
- `Flight`: outbound and return legs, airline, hotel, guide.

**Greetings**
- `HolidayCampaign`: holiday, Hebrew year, send time, audience, recipients, message, status, stats, send rate.
- `BirthdaySettings`: enabled, send time, channel, Shabbat-aware, template, sent this year.
- `BirthdayEntry`: one person's birthday and its send status.

**Users and access**
- `User`: role (admin, office or sales), passport access, last sign-in, two-step status, invite pending.
- `PermissionMatrix`: what each role can do in each area.
- `SecuritySettings`: the security switches.
- `AuditEntry`: one sensitive action in the access log.

**Other**
- `ImportRun`: boards, counts, steps, field mapping, Monday read-only flag.
- `Activity`: one item in the overview feed.
- `OverviewStats`: the overview numbers and weekly series.

### Services (`data/services`)

One interface per area:
- `session`
- `leads`
- `customers`
- `passports`
- `groups`
- `greetings`
- `birthdays`
- `users`
- `imports`
- `activity`

Every method is async, returns typed data, and takes typed filter parameters.

### Adapters

**Mock (the default)**
- **Store:** an in-memory store seeded from fixtures.
  - The hand-written records from the canvas come first, so screens match the design: יעל פרץ, שרה כהן, the Poland group and so on.
  - A seeded generator then adds realistic volume, so totals match the design: 412 customers, 24 open leads, 1,284 imported leads.
- **Speed and state:**
  - Responses take 250–600ms.
  - Edits update the store and refresh the affected queries.
  - Everything resets on reload.
- **Fixed date:** the demo date is fixed at 2026-10-28 (`VITE_DEMO_TODAY`), so the data always lines up.
- **Errors:** in development only, `?mock-error=<service>` makes a service fail, to show error states.

**HTTP (later)**
- Stubs implement the same interfaces against `api.ronitbarash.site`.
- `VITE_DATA_SOURCE` picks `mock` or `http` per service, so areas move to the real API one at a time.

### Queries (`data/queries`)

- One TanStack Query hook per service method, keyed like `['leads', filters]`.
- Status changes, notes and switches update optimistically and roll back on error.

## 10. Screens

Content follows the canvas board of the same name.

**Sign in**
- Frosted card: email, password with a "שכחתי" pill, "לזכור אותי במכשיר הזה", the joined "כניסה" button, a privacy line and the two-step line.
- Black card: "הכל במקום אחד".
- Tall orb card with the Hebrew date and the days until the next holiday.

**Overview**
- Two-tone greeting, and three key numbers: open leads, customers, active groups.
- Black card: leads this week, with the 8-week bars.
- Orb card for today.
- Glass card: the Hanukkah greeting waiting for approval, with its stage bar.
- Recent leads table, active groups, WhatsApp passports and the activity feed.

**Leads**
- Header: the two-tone count, table and board view switch, filters, "ליד חדש".
- A note that everything came over from Monday.
- Status chips with counts, and source, group and assignee filters.
- Table grouped by trip.
- **Board view:**
  - Five columns, one per status, holding lead cards (name, trip, last note).
  - Clicking a card opens the lead detail.
  - Status changes happen in the detail; there is no drag and drop.
- Selecting a lead opens its detail:
  - status, contact actions and details
  - status chips
  - history timeline
  - new note

**Customers and passports**
- Black WhatsApp passport inbox:
  - matched, new card, or needs review
  - with open and review actions
- How a passport gets captured, in four steps.
- Filter chips and the customer table:
  - passport numbers masked
  - passports expiring soon tagged

**Customer profile**
- Header with tags and actions: WhatsApp and edit.
- Passport fields, with the photo hidden behind a "הצגה" button.
- Passport access log, in black.
- Messages sent, details, and internal notes.

**Groups and flights**
- Group cards, with the selected one in black.
- Participants table with passport status.
- Readiness orb card, 91%.
- Flight details: airline and hotel are placeholders until real data exists.

**Holiday greetings**
- Stage pill bar.
- Orb card: חנוכה over 04.12.
- Message editor with name tokens, and the WhatsApp preview.
- Sending:
  - recipients and audience chips
  - time, rate, estimated duration
  - approve, and send a test to me
- Last campaign result and history.

**Birthdays**
- Today, as an orb card.
- Automation switch and settings, with the Shabbat rule.
- The coming week, the template and its preview, and recent sends.

**Users and access**
- Users table and permission matrix by role.
- Security switches and the sensitive-actions log.
- On phones this is the account and admin screen, with links to import, message history and sign-out.

**Monday import**
- Result summary: 0 errors and the four counts.
- The five steps, the boards with counts, and the field mapping.
- "אישור וסגירת Monday.com".

**Actions that send messages or close Monday**

These are approving a greeting, sending a test and closing Monday. Each opens a confirmation with a Cancel. In the shell they only change mock state.

## 11. States and feedback

- **Loading:** skeletons shaped like the final content. They pulse softly, and not at all under Reduce Motion.
- **Empty:** one line and the next step. For example, "אין לידים בסינון הזה", with a button to clear the filters.
- **Error:** shown inside the card that failed, with "לנסות שוב". Never a blocking alert.
- **Confirmations:**
  - Toasts slide in at the top on desktop, and above the tab bar on phones.
  - They close after 4 seconds.
  - They offer undo for reversible actions, such as a status change.

## 12. Accessibility, RTL and copy

**Document**
- `<html lang="he" dir="rtl">` by default (English switches both, see **English** below) and `<meta name="google" content="notranslate">`.
- Logical CSS only.
- Phone numbers, passport numbers and other LTR runs go in `<bdi dir="ltr">`.

**Contrast**
- All text is at least 4.5:1.
- `faint` is used only on text 24px or larger.
- Status always pairs its dot with its word.

**Controls**
- Every icon-only control has an `aria-label`.
- The current menu item carries `aria-current`.
- Focus rings are visible, and everything is reachable by keyboard.
- Touch targets are at least 44px.

**Copy**
- Hebrew, with no em-dashes.
- Ronit is addressed in the feminine.
- Customers and staff get gender-neutral wording, such as "גיל 45" and "בקשה לפרטים".

**Dates:** Hebrew dates come from `Intl.DateTimeFormat` with the Hebrew calendar and Hebrew numerals. A unit test pins the exact string that ICU produces for 2026-10-28, which is 17 Cheshvan 5787, written in Hebrew letters (י״ז בחשוון תשפ״ז, in whatever spelling ICU uses).

**English**
- A switch on the sign-in screen and in the top bar (desktop and phone) flips the app between Hebrew and English. Hebrew is the default, and each device remembers the choice.
- English sets `<html lang="en" dir="ltr">`. Logical CSS mirrors the layout. The forward and back arrows, the push and pop slide, and the action button's hover lean follow the direction.
- Every `src/content/*.he.ts` file has a `*.en.ts` twin of the same shape, checked by TypeScript. Components read copy with `useCopy()`. Data, such as customer names, shows as stored.
- English dates: the short weekday ("Wed"), day before month ("28/10"), the Hebrew date from ICU ("17 Heshvan 5787"), and holiday names in English ("Hanukkah in 37 days").

## 13. Testing

**Unit (Vitest)**
- Formatters: he-IL numbers, dd.mm dates, Hebrew dates, masked phones and passports.
- Mock services: filters, search, edits.
- The generator produces the same data from the same seed.
- Permission matrix rules.

**Components (Testing Library)**
- `StatusTag` shows its word, not just a color.
- `Switch` updates `aria-checked`.
- `ChipGroup` changes the selection.
- `DataTable` renders its group rows.

**End to end (Playwright, at 1440×900 and at 390×844)**
- Sign in, then see the overview.
- Filter leads to חדשים, open a lead and change its status.
- Switch leads to the board view and open a lead from a card.
- Go from customers to a profile.
- Approve a holiday greeting through its confirmation.
- Switch groups.
- On a phone: tab navigation, push and back.
- With Reduce Motion emulated, no transforms run.

**Gate:** typecheck, lint and all tests pass, and `npm run build` succeeds.

## 14. Acceptance criteria

1. All 10 desktop and 10 phone screens on the canvas exist in code and match the approved look when checked side by side with the canvas.
2. Every link and tab works, every URL deep-links, and browser back works, including the push and pop direction on phones.
3. Motion behaves as in section 8, holds 60fps within the budget, and respects Reduce Motion and Reduce Transparency.
4. Each screen can show its loading, empty and error states through the mock.
5. The app makes no network requests (the font is self-hosted).
6. Build, typecheck, unit tests and end-to-end tests pass.

## 15. Assumptions to confirm with Ronit

**Roles and security**
- The roles ניהול, משרד and מכירות, and the permission matrix shown on the users screen.
- The security switches:
  - two-step sign-in required
  - passport numbers masked in lists
  - auto sign-out after 30 minutes
  - an access log for every passport view

**Sending**
- Greetings go out at 50 messages every 10 minutes.
- Birthdays that fall on Shabbat go out after Shabbat ends.

**Placeholder content**
- Staff names (שירה, מורן).
- Airline and hotel.
- Mock counts and dates, including Hanukkah 5787 starting on the evening of 04.12.2026.

**API**
- The API endpoints beyond the existing `/api/website/lead`; the HTTP adapters stay stubs until the backend owner shares them.

## 16. Later

- Connect Ronit's API one area at a time.
- Real sign-in with two-step verification.
- WhatsApp sending through a provider.
- Reading passports from photos.
- Running the Monday import.
- Deploying to Vercel, with `dashboard/` as the root, when asked.
