# Dashboard motion, more life: design

- **Date:** 2026-11-05
- **Status:** approved in chat
- **For:** Ronit Barash, אור הצדיק (built by Clix Solution)
- **Readers:** whoever builds or changes the dashboard's screens

## 1. Goal

The dashboard should feel alive, and as smooth as the Miyo Sushi call dashboard (Clix's `MIYO_SUSHI-CallAnalyzer`):
- every page opens with a soft rise;
- rows cascade in;
- whatever can be clicked answers the pointer;
- whatever changes in front of you moves to its new state instead of jumping there.

It must still never look like loading. On 2026-11-03 sections that rebuilt themselves on every visit looked like they were "loading from the start again". That's why only the visit's first page builds up ([shell design](2026-10-28-ronit-dashboard-shell-design.md), section 8, and PR #19).

## 2. Decisions

| Question | Choice | Why |
|---|---|---|
| What a page does when it opens | A soft rise every time; numbers and bars show their values at once | The user's choice. Miyo does the rise, and leaving out the count-ups keeps it from looking like loading. |
| Desktop section switch | The reel stays; the page's content settles as the reel stops | The user's choice; they picked the reel on 2026-11-04 |
| How it's built | The dashboard's own motion system (`motion/`), extended with shared pieces in the shared components | One system of interruptible springs. Copying Miyo's CSS would run a second system beside it; hand-tuning each screen would drift. |

## 3. The reference: Miyo's motion

From `MIYO_SUSHI-CallAnalyzer/src/index.css`, `Calls.tsx` and `BarChart.tsx`:

| What | Miyo |
|---|---|
| A screen opening | rises from 8px below and fades in, 320 ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`, on every route change |
| Rows | rise from 9px below, 360 ms, each starting 36 ms after the last: delay `min(120 + 36·i, 540)` ms |
| Bars | grow over 700 ms, 45–55 ms apart |
| Buttons, links, rows | colors ease over 160 ms; a press scales to 0.97 |
| Glass cards | hover: up 1px and 2% larger with a deeper shadow; press: 0.98 |
| Reduce Motion | all of it off |

The dashboard keeps its own rule of springs only. A spring with no bounce, settling in about a third of a second, matches Miyo's curve.

## 4. Opening a page

- **The new spring.** `springs.settle` is `{ type: "spring", visualDuration: 0.32, bounce: 0 }`. A page's content rises 8px and fades in on it.
- **Every page settles.** Pages after the visit's first one no longer appear still. This includes pages within a section: a customer's card, the import, a trip.
- **The visit's first page** keeps its full build-up, as now: cards settle one after another, hero numbers count up, bars grow and meters fill.
- **On later pages, numbers, bars and meters stand at their values** from the first frame. Only the cards and rows holding them settle.
- **The desktop reel** keeps spinning as it does: 0.55 s for one section, 0.17 s more for each further one, at most 1.4 s.
  - The page it heads to holds its content back while it travels.
  - Its content starts to settle 0.15 s before the reel stops, so the page lands as its cards and rows fall into place.
  - Pages passing by stay as they are: drawn lighter, nothing moving inside them.
- **On phones**, switching tabs uses the same settle in place of today's 12px fade. Pushed screens keep their slide.

## 5. Rows and cards

- **When a page settles:**
  - its cards settle 40 ms apart (`STAGGER_SECONDS`, as on the first page);
  - rows in tables, lists, the kanban and the inbox cascade 36 ms apart, from 0.08 s.
  - No item starts later than 0.5 s, however long the list.
- **Filtering, searching, paging or sorting never cascade.** Rows glide to their new order through `layout`, as now.
- **A row that arrives while the page is open,** such as a lead that came in with a refresh, rises in. A removed row folds away, as now.

## 6. Hover and press

On devices with a mouse only (`@media (hover: hover)`), so a phone's tap never leaves anything lifted.

| What | Hover | Press |
|---|---|---|
| Cards that open something (`LinkCard`, the overview's cards with links) | up 2px, with a soft shadow | 0.98 |
| Table rows, list rows, kanban cards, inbox tiles | up 1px, with a soft shadow, and the row's tint eases in over 150 ms | 0.98 |
| Buttons (`Button`, `GooButton`, `IconButton`) | up 1px | 0.96, as now |
| Chips, tabs, segmented controls | tint only | 0.96, as now |

- **The shadow is never animated.** It's drawn on a layer of its own, whose opacity fades in.
- **Link cards** come down from 3px to 2px, so all cards answer alike.

## 7. Changes in front of you

- **Numbers that change while you watch** tick from the old value to the new one, on `gentle`. For example, today's lead count after a refresh or a copy from Monday. They never count from zero again.
- **The kanban:** when a lead's status changes, its card glides from its old column to the new one (a shared `layoutId` per lead).
- **The month calendars,** on the overview and on the leads page, slide to the next or previous month. That's 16px and a fade, in the direction of travel: in Hebrew, "next" comes from the left.
- **Loading placeholders** give way to the content, which fades in where they stood instead of being swapped in.
- **Already moving, and unchanged:** sheets, the side panel, toasts, the account panel, the tab and chip highlights (`layoutId`), and the liquid rail and tab bar.

## 8. Smooth, and kind to everyone

- **Only `transform` and `opacity` animate.** Never `backdrop-filter`, shadows or layout properties. Motion's layout animations count, since they move with transforms.
- **The budget is unchanged:** 60 fps on desktop, and on a mid-range phone profile (Chrome DevTools, 4× CPU throttling). No task over 50 ms during a transition.
- **The reel still moves one layer** the browser animates by itself. The settle starts only on the page that's arriving.
- **Under Reduce Motion** (`<MotionConfig reducedMotion="user">`), nothing moves:
  - pages and rows only fade;
  - hover lifts are off;
  - numbers change at once;
  - the reel jumps, as now.

## 9. Testing

- **Unit tests:**
  - the cascade's delays and their 0.5 s cap;
  - when the reel's settle starts;
  - a number ticking from its old value rather than zero;
  - no transform under Reduce Motion.
- **Existing motion tests** are updated where the rule "later pages stand still" changes: `outlets.test.tsx`, the screens' entrance tests.
- **By eye**, on sample data: desktop in Hebrew and English, phone, Reduce Motion. Check the frame rate with 4× CPU throttling on the overview, the leads kanban and the customers table.

## 10. Not in this step

- New page transitions: the reel and the phone push stay as they are.
- Dragging kanban cards between columns.
- Scroll-linked or parallax effects.
