# Dashboard motion (more life) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dashboard page opens with a soft rise, and its cards and rows cascade in; clickable things answer the mouse; numbers tick and calendars slide. This implements [the motion design](../specs/2026-11-05-dashboard-motion-design.md).

**Architecture:**
- **Page state.** A new page-motion context says how a page opens: `build` (the visit's first page), `settle` (any later one) or `still` (a page the reel only passes, or a pushed phone screen). It also says whether the content is `held` while the reel travels.
- **Who sets it.** The outlets set it through `PageEntrance`. `ScreenFrame` turns it into variant labels.
- **Who follows it.** Cards (`cardVariants`) and rows (`rowVariants`) follow those labels. Rows cascade only for the keys their list showed first.
- **Hover.** Hover shadows are a CSS layer whose opacity fades in, so no shadow is animated.

**Tech stack:**
- React 19, Vite 8, Tailwind 4 (`@utility` in `src/styles/theme.css`);
- `motion/react` 14, with springs only;
- Vitest and Testing Library on jsdom.

## Global constraints

- **Springs only**, from `motion/springs.ts`. The new spring is `settle: { type: "spring", visualDuration: 0.32, bounce: 0 }`.
- **Only `transform` and `opacity` animate.** Never `backdrop-filter`, shadows or layout properties. Motion's `layout` counts as fine, since it moves with transforms.
- **Reduce Motion stays respected.** `<MotionConfig reducedMotion="user">` already turns transforms into fades, and nothing may bypass it.
- **Settling:** the rise is 8px (`SETTLE_RISE`). Cards are 40ms apart (`STAGGER_SECONDS`). Rows start at 0.08s, then 0.036s apart, and none starts later than 0.5s.
- **The desktop reel** keeps its timings: 0.55s, plus 0.17s for each further section, at most 1.4s. The arriving page's content is released 150ms before the reel stops.
- **Pages after the first** never count numbers up or grow bars again. `useEntrance()` stays false for them.
- **Hover** applies only on devices with a mouse. Tailwind 4's `hover:` already compiles to `@media (hover: hover)`, and Motion's `whileHover` ignores touch.
- **RTL:** in Hebrew, "next month" slides in from the left.
- **Checks:** `npm run typecheck` and `npm run lint`, plus the motion tests touched. The user checks the UI by eye. Five shell and route tests already fail on main (3 in DesktopShell, 2 in routes); they are not regressions.
- **The repo is public:** no secrets, and no real names or phone numbers in fixtures.
- **Demo files stay out:** `src/demo-services.ts` and `vite.demo.config.ts` are local-only (excluded in `.git/info/exclude`) and must never be committed.

## Files

| File | Change |
|---|---|
| `dashboard/src/motion/springs.ts` | the `settle` spring and the constants |
| `dashboard/src/motion/cascade.ts` (new) | `RowMotion`, `cascadeDelay`, `useFirstKeys` |
| `dashboard/src/motion/page-motion.ts` (new) | `PageMode`, `PageMotionContext`, `usePageMotion`, `pageLabels` |
| `dashboard/src/motion/variants.ts` | `held`/`settled` labels; `headlineVariants`, `rowVariants`, `slideFrom`; a phone fade without the 12px rise |
| `dashboard/src/motion/settle.test.ts` (new) | the pure helpers |
| `dashboard/src/motion/PageEntrance.tsx` | provides the page's motion |
| `dashboard/src/motion/StackOutlet.tsx` | phone modes |
| `dashboard/src/motion/SectionReel.tsx` | the stop time, and holding and releasing the arriving page |
| `dashboard/src/motion/outlets.test.tsx` | the mode tests |
| `dashboard/src/ui/ScreenFrame.tsx`, `ui/Headline.tsx` | follow the page labels; the headline stands while cards settle |
| `dashboard/src/ui/DataTable.tsx`, `ui/ListRow.tsx` | the row cascade; list-row hover tint |
| `dashboard/src/screens/leads/LeadsKanban.tsx`, `leads/LeadsPhoneList.tsx` | the row cascade; kanban card hover and press |
| `dashboard/src/screens/overview/ActivityCard.tsx`, `overview/PassportsCard.tsx`, `customers/CustomerList.tsx`, `customers/IntakeInbox.tsx`, `groups/GroupDetails.tsx`, `overview/CalendarCard.tsx` | rows cascade |
| `dashboard/src/styles/theme.css` | `@utility lift-shadow` |
| `dashboard/src/ui/surface-tones.ts` | `HOVER_TINT` |
| `dashboard/src/ui/LinkCard.tsx`, `ui/Button.tsx`, `ui/IconButton.tsx`, `ui/GooButton.tsx` | hover lift and press |
| `dashboard/src/ui/count-up.ts`, `ui/BigNumber.tsx` | numbers tick from the old value |
| `dashboard/src/ui/MonthSlide.tsx` (new) | a month's days sliding in |
| `dashboard/src/screens/leads/LeadsDayPanel.tsx` | uses `MonthSlide` (and so does `overview/CalendarCard.tsx`) |
| `docs/superpowers/specs/2026-11-05-dashboard-motion-design.md` | the refinements found while planning (Task 6) |

---

### Task 1: Motion building blocks

**Files:**
- Modify: `dashboard/src/motion/springs.ts`
- Create: `dashboard/src/motion/cascade.ts`, `dashboard/src/motion/page-motion.ts`
- Modify: `dashboard/src/motion/variants.ts`
- Test: `dashboard/src/motion/settle.test.ts`

**Interfaces:**
- **Produces:**
  - `springs.settle`, `CARD_PRESS_SCALE = 0.98`, `SETTLE_RISE = 8`, `SLIDE_DISTANCE = 16`, `CASCADE = { first: 0.08, step: 0.036, last: 0.5 }`, `SETTLE_LEAD_MS = 150`;
  - `interface RowMotion { index: number; cascade: boolean }`, `cascadeDelay(index: number): number`, `useFirstKeys(keys: readonly string[]): (key: string) => boolean`;
  - `type PageMode = "build" | "settle" | "still"`, `interface PageMotion { mode: PageMode; held: boolean }`, `PageMotionContext`, `usePageMotion()`, `pageLabels(m: PageMotion): { initial: false | "initial" | "held"; animate: "enter" | "held" | "settled" }`;
  - `staggerVariants`, `cardVariants` (with `held`/`settled`), `headlineVariants`, `rowVariants` (custom: `RowMotion`), `slideFrom(direction: -1 | 0 | 1, rtl: boolean): number`.

- [ ] **Step 1: Write the failing test** `dashboard/src/motion/settle.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cascadeDelay, useFirstKeys } from "./cascade";
import { pageLabels } from "./page-motion";
import { slideFrom } from "./variants";

describe("cascadeDelay", () => {
  it("starts the first row at 0.08 s and each next one 0.036 s later", () => {
    expect([0, 1, 2].map(cascadeDelay)).toEqual([0.08, 0.116, 0.152]);
  });

  it("never starts a row later than 0.5 s, however long the list", () => {
    expect(cascadeDelay(11)).toBe(0.476);
    expect(cascadeDelay(12)).toBe(0.5);
    expect(cascadeDelay(400)).toBe(0.5);
  });
});

describe("useFirstKeys", () => {
  it("cascades only the rows a list showed when it first had rows", () => {
    const { result, rerender } = renderHook(({ keys }: { keys: string[] }) => useFirstKeys(keys), { initialProps: { keys: [] } });
    rerender({ keys: ["a", "b"] });
    rerender({ keys: ["a", "b", "c"] });
    expect(["a", "b", "c"].map(result.current)).toEqual([true, true, false]);
  });
});

describe("pageLabels", () => {
  it("builds up the first page, settles later ones once the reel lets them, and leaves passing pages still", () => {
    expect(pageLabels({ mode: "build", held: false })).toEqual({ initial: "initial", animate: "enter" });
    expect(pageLabels({ mode: "settle", held: true })).toEqual({ initial: "held", animate: "held" });
    expect(pageLabels({ mode: "settle", held: false })).toEqual({ initial: "held", animate: "settled" });
    expect(pageLabels({ mode: "still", held: false })).toEqual({ initial: false, animate: "settled" });
  });
});

describe("slideFrom", () => {
  it("brings the next month in from the left in Hebrew and from the right in English", () => {
    expect(slideFrom(1, true)).toBe(-16);
    expect(slideFrom(1, false)).toBe(16);
    expect(slideFrom(-1, true)).toBe(16);
    expect(slideFrom(0, true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd dashboard && npx vitest run src/motion/settle.test.ts --no-file-parallelism`
Expected: FAIL. The modules `./cascade` and `./page-motion` don't exist yet.

- [ ] **Step 3: Add the spring and constants** in `dashboard/src/motion/springs.ts`. Add `settle` after `gentle` in `springs`:

```ts
  /** A page's content as it opens: Miyo's soft rise, as a spring with no bounce. */
  settle: { type: "spring", visualDuration: 0.32, bounce: 0 },
```

and below `PRESS_SCALE`:

```ts
/** Cards and rows give a little less than buttons when pressed. */
export const CARD_PRESS_SCALE = 0.98;
/** How far content rises as a page settles, in px. */
export const SETTLE_RISE = 8;
/** How far the month calendars slide, in px. */
export const SLIDE_DISTANCE = 16;
/** Rows cascade: the first starts at `first` s, each next one `step` s later, none later than `last`. */
export const CASCADE = { first: 0.08, step: 0.036, last: 0.5 } as const;
/** The reel lets the arriving page's content settle this long before it stops, in ms. */
export const SETTLE_LEAD_MS = 150;
```

- [ ] **Step 4: Create `dashboard/src/motion/cascade.ts`**

```ts
import { useState } from "react";
import { CASCADE } from "./springs";

/** A row's place in its list, and whether it cascades: only the rows a list showed first do. */
export interface RowMotion {
  index: number;
  cascade: boolean;
}

/** When the i-th row of a list starts to settle, in seconds: never past CASCADE.last, however long the list. */
export function cascadeDelay(index: number): number {
  const delay = Math.min(CASCADE.first + CASCADE.step * Math.max(0, index), CASCADE.last);
  return Math.round(delay * 1000) / 1000;
}

/**
 * The keys a list showed when it first had rows: those cascade in, whether the list opened with its page or after its
 * data arrived. Rows a filter, a search or a refresh adds later rise in together instead, so filtering never cascades.
 */
export function useFirstKeys(keys: readonly string[]): (key: string) => boolean {
  const [first, setFirst] = useState<ReadonlySet<string> | null>(() => (keys.length > 0 ? new Set(keys) : null));
  // React's pattern for reacting to a changed value while rendering: the first time the list has rows.
  if (first === null && keys.length > 0) setFirst(new Set(keys));
  const shown = first ?? new Set(keys);
  return (key) => shown.has(key);
}
```

- [ ] **Step 5: Create `dashboard/src/motion/page-motion.ts`**

```ts
import { createContext, useContext } from "react";

/**
 * How a page's content opens.
 * - "build": the visit's first page builds up: cards settle one after another, numbers count up, bars grow.
 * - "settle": any later page: its cards and rows rise softly into place; numbers and bars stand at their values.
 * - "still": a page the reel only passes, or a phone screen pushed in: its content stands as it is.
 */
export type PageMode = "build" | "settle" | "still";

export interface PageMotion {
  mode: PageMode;
  /** The desktop reel is still travelling to this page: its content waits. */
  held: boolean;
}

/** Outside the outlets, as in tests, content builds up as the visit's first page did (like EntranceContext). */
export const PageMotionContext = createContext<PageMotion>({ mode: "build", held: false });

export function usePageMotion(): PageMotion {
  return useContext(PageMotionContext);
}

/** The variant labels a page's content moves between, for the component that leads it, like ScreenFrame. */
export function pageLabels({ mode, held }: PageMotion): { initial: false | "initial" | "held"; animate: "enter" | "held" | "settled" } {
  if (mode === "build") return { initial: "initial", animate: "enter" };
  if (mode === "still") return { initial: false, animate: "settled" };
  return { initial: "held", animate: held ? "held" : "settled" };
}
```

- [ ] **Step 6: Extend `dashboard/src/motion/variants.ts`.**

Replace the imports:

```ts
import type { Variants } from "motion/react";
import { cascadeDelay, type RowMotion } from "./cascade";
import { SETTLE_RISE, SLIDE_DISTANCE, STAGGER_SECONDS, fadeOut, springs } from "./springs";
import type { ScreenTransition } from "./transitions";
```

Replace `staggerVariants` and `cardVariants`:

```ts
/** Leads cards that settle one after another: "enter" on the visit's first page, "settled" on later ones. */
export const staggerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: STAGGER_SECONDS } },
  held: {},
  settled: { transition: { staggerChildren: STAGGER_SECONDS } },
};

/** Cards: they build up on the visit's first page (initial → enter) and rise softly on later ones (held → settled). */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
  held: { opacity: 0, y: SETTLE_RISE, scale: 1 },
  settled: { opacity: 1, y: 0, scale: 1, transition: springs.settle },
};

/** A page's headline builds up with the first page's cards; on later pages it stands while their cards settle. */
export const headlineVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
};

function shownRow({ index, cascade }: RowMotion) {
  return { opacity: 1, y: 0, transition: { ...springs.settle, delay: cascade ? cascadeDelay(index) : 0 } };
}

/** Table rows, kanban cards and list rows, with their RowMotion as `custom`: they cascade in and fade out. */
export const rowVariants: Variants = {
  initial: { opacity: 0, y: SETTLE_RISE },
  held: { opacity: 0, y: SETTLE_RISE },
  enter: shownRow,
  settled: shownRow,
  exit: { opacity: 0, transition: fadeOut },
};

/** Where a new month comes in from, in px: in Hebrew "next" comes from the left. 0 when there's no change to show. */
export function slideFrom(direction: -1 | 0 | 1, rtl: boolean): number {
  if (direction === 0) return 0;
  return direction * (rtl ? -1 : 1) * SLIDE_DISTANCE;
}
```

In `screenVariants`, the content now does the rising, so the tab fade only fades. Replace `if (kind === "fade") return { opacity: 0, y: 12 };` with `if (kind === "fade") return { opacity: 0 };`. In `enter`, replace `{ opacity: 1, y: 0, transition: springs.surface }` with `{ opacity: 1, transition: springs.surface }`.

- [ ] **Step 7: Run the test to see it pass**

Run: `cd dashboard && npx vitest run src/motion/settle.test.ts --no-file-parallelism`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/motion/springs.ts dashboard/src/motion/cascade.ts dashboard/src/motion/page-motion.ts dashboard/src/motion/variants.ts dashboard/src/motion/settle.test.ts
git commit -m "feat(motion): the settle spring, row cascade and page motion state"
```

---

### Task 2: Pages settle each time they open

**Files:**
- Modify: `dashboard/src/motion/PageEntrance.tsx`, `dashboard/src/motion/StackOutlet.tsx`, `dashboard/src/motion/SectionReel.tsx`, `dashboard/src/ui/ScreenFrame.tsx`, `dashboard/src/ui/Headline.tsx`
- Test: `dashboard/src/motion/outlets.test.tsx`

**Interfaces:**
- **Consumes:** `PageMode`, `PageMotionContext`, `pageLabels`, `usePageMotion` (Task 1); `staggerVariants` and `headlineVariants` (Task 1); `SETTLE_LEAD_MS` (Task 1).
- **Produces:** `PageEntrance({ mode, held?, children })`, which replaces `PageEntrance({ entrance, children })`.

- [ ] **Step 1: Write the failing tests.** Append to `dashboard/src/motion/outlets.test.tsx`, and add `import { usePageMotion } from "./page-motion";` to its imports:

```tsx
/** A page that notes, as it mounts, how its content opens. */
function Probe({ name, seen }: { name: string; seen: string[] }) {
  const { mode } = usePageMotion();
  useLayoutEffect(() => {
    seen.push(`${name}:${mode}`);
  }, [name, mode, seen]);
  return <h1>{name}</h1>;
}

describe("page motion", () => {
  it("builds up the first page, settles the next one, and leaves the pages the reel passes still", async () => {
    const seen: string[] = [];
    const sections = [MAIN_PAGES[0], { path: "/leads", element: <Probe name="passing" seen={seen} /> }, MAIN_PAGES[2]];
    const { router } = renderRoutes([
      {
        path: "/",
        element: <SectionReel pageKey={leadsKey} sectionOf={placeOf} sections={sections} />,
        children: [
          { index: true, element: <Probe name="home" seen={seen} /> },
          { path: "groups", element: <Probe name="groups" seen={seen} /> },
        ],
      },
    ]);
    await screen.findByRole("heading", { name: "home" });
    await act(() => router.navigate("/groups"));
    await screen.findByRole("heading", { name: "groups" });
    expect(seen).toEqual(["home:build", "passing:still", "groups:settle"]);
  });

  it("settles a phone tab and leaves a pushed screen still", async () => {
    const seen: string[] = [];
    const { router } = renderRoutes(
      [
        {
          path: "/",
          element: <StackOutlet isPushed={(pathname) => pathname.startsWith("/customers/")} />,
          children: [
            { path: "customers", element: <Probe name="list" seen={seen} /> },
            { path: "customers/:id", element: <Probe name="profile" seen={seen} /> },
            { path: "groups", element: <Probe name="groups" seen={seen} /> },
          ],
        },
      ],
      "/customers",
    );
    await screen.findByRole("heading", { name: "list" });
    await act(() => router.navigate("/groups"));
    await screen.findByRole("heading", { name: "groups" });
    await act(() => router.navigate("/customers/c1"));
    await screen.findByRole("heading", { name: "profile" });
    expect(seen).toEqual(["list:build", "groups:settle", "profile:still"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd dashboard && npx vitest run src/motion/outlets.test.tsx --no-file-parallelism`
Expected: FAIL. Every probe reads the default `build` (for example `"groups:build"`), because nothing provides the page's motion yet.

- [ ] **Step 3: Rewrite `dashboard/src/motion/PageEntrance.tsx`**

```tsx
import { motion } from "motion/react";
import { useMemo, type ReactNode } from "react";
import { EntranceContext } from "./entrance";
import { PageMotionContext, pageLabels, type PageMode } from "./page-motion";
import { staggerVariants } from "./variants";

interface PageEntranceProps {
  mode: PageMode;
  /** The desktop reel is still travelling here: the content waits, then settles. */
  held?: boolean;
  children: ReactNode;
}

/**
 * A page's content as it opens. The visit's first page builds up under its outlet's own motion. Any other page settles
 * (or, passing by, stands) between labels of its own, so the outlet's movement never replays the build-up.
 */
export function PageEntrance({ mode, held = false, children }: PageEntranceProps) {
  const motionState = useMemo(() => ({ mode, held }), [mode, held]);
  const labels = pageLabels(motionState);
  return (
    <EntranceContext value={mode === "build"}>
      <PageMotionContext value={motionState}>
        {mode === "build" ? (
          children
        ) : (
          // "contents" keeps it out of the layout.
          <motion.div initial={labels.initial} animate={labels.animate} variants={staggerVariants} className="contents">
            {children}
          </motion.div>
        )}
      </PageMotionContext>
    </EntranceContext>
  );
}
```

- [ ] **Step 4: Make `ScreenFrame` follow the page.** Replace `dashboard/src/ui/ScreenFrame.tsx` with:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { pageLabels, usePageMotion } from "../motion/page-motion";
import { staggerVariants } from "../motion/variants";

/**
 * A screen's content column. Its cards build up on the visit's first page and settle softly on later ones; while the
 * desktop reel travels to the page, they wait. Below lg it leaves room for the tab bar.
 */
export function ScreenFrame({ children, className }: { children: ReactNode; className?: string }) {
  const labels = pageLabels(usePageMotion());
  return (
    <motion.div
      initial={labels.initial}
      animate={labels.animate}
      variants={staggerVariants}
      className={cx("flex flex-col gap-3.5 px-4 pt-3.5 pb-[124px] lg:gap-[18px] lg:px-0 lg:pt-0 lg:pb-0", className)}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 5: The headline stands on later pages.** In `dashboard/src/ui/Headline.tsx`, import `headlineVariants` in place of `cardVariants`, and use `variants={headlineVariants}`.

- [ ] **Step 6: The phone outlet** (`dashboard/src/motion/StackOutlet.tsx`):
  1. Add `import type { PageMode } from "./page-motion";`.
  2. In `StackScreenProps`, replace `entrance: boolean;` with:

     ```ts
       /** How its content opens: "build" on the visit's first screen, "still" for a pushed one, "settle" otherwise. */
       mode: PageMode;
     ```
  3. In `StackScreen`, destructure `mode` instead of `entrance`, and render `<PageEntrance mode={mode}>{children}</PageEntrance>`.
  4. In `StackOutlet`, rename `const entrance = useFirstPage(location.pathname);` to `const first = useFirstPage(location.pathname);`. After `const screenMotion…`, add:

     ```ts
       // A pushed screen's slide is its entrance, so its content stands; a tab's screen settles; the first one builds up.
       const mode: PageMode = first ? "build" : transition.kind === "push" ? "still" : "settle";
     ```
  5. Pass `mode={mode}` to `StackScreen` in place of `entrance={entrance}`.
  6. Update the doc comment's last sentence to: "The visit's first screen builds up; a tab's screen settles softly as it fades in; a pushed one slides in with its content in place."

- [ ] **Step 7: The desktop reel** (`dashboard/src/motion/SectionReel.tsx`):
  1. **Imports.** Add `type RefObject` to the react import. Add `import type { PageMode } from "./page-motion";`. Import `SETTLE_LEAD_MS` alongside `STAGGER_SECONDS`.
  2. **The context.** Replace the context line with:

     ```ts
     /** Where the reel is heading, whether it's still turning, and when it will stop (performance.now() ms). */
     const ReelContext = createContext<{ target: number; turning: boolean; stopsAt: RefObject<number> } | null>(null);
     ```
  3. **`ReelPage`.** After `const pinned = …`, add:

     ```ts
       // How the content opens is fixed when the page mounts: one that came in passing by stays still if the reel stops on it.
       const [mode] = useState<PageMode>(() => (entrance ? "build" : passing ? "still" : "settle"));
       // The reel's stop, mounted while it turns: the content waits, and settles just before the stop.
       const [released, setReleased] = useState(() => !(mode === "settle" && reel.turning));
       if (!released && !reel.turning) setReleased(true);
       const { stopsAt } = reel;
       useEffect(() => {
         if (released) return;
         const timer = setTimeout(() => setReleased(true), Math.max(0, stopsAt.current - performance.now() - SETTLE_LEAD_MS));
         return () => clearTimeout(timer);
       }, [released, stopsAt]);
     ```

     Render `<PageEntrance mode={mode} held={!released}>{children}</PageEntrance>`.
  4. **`SectionReel`.** After `const spin = useRef(0);`, add `const stopsAt = useRef(0);`. In the layout effect:
     - before `if (distance < 0.001 || …)`, add `stopsAt.current = performance.now();`;
     - after `const duration = …`, add `stopsAt.current = performance.now() + duration;`.
  5. **The context value.** It becomes `useMemo(() => ({ target, turning, stopsAt }), [target, turning])`.
  6. **The doc comment.** Replace "Only the visit's first page builds up; the others arrive with their content in place." with "The visit's first page builds up; any later page's cards and rows settle softly as it lands, released just before the reel stops."
  7. **`ReelPageProps`.** Update the `entrance` doc to: "The visit's first page: it fades in and builds up."

- [ ] **Step 8: Run the tests, type-check and lint**

Run: `cd dashboard && npx vitest run src/motion --no-file-parallelism && npm run typecheck && npm run lint`
Expected: all motion tests PASS, including the two new ones; typecheck and lint clean.

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/motion dashboard/src/ui/ScreenFrame.tsx dashboard/src/ui/Headline.tsx
git commit -m "feat(motion): every page settles softly as it opens; the reel lets its content land"
```

---

### Task 3: Rows cascade

**Files:**
- Modify: `dashboard/src/ui/DataTable.tsx`, `dashboard/src/ui/ListRow.tsx`, `dashboard/src/ui/surface-tones.ts`
- Modify: `dashboard/src/screens/leads/LeadsKanban.tsx`, `leads/LeadsPhoneList.tsx`, `overview/ActivityCard.tsx`, `overview/PassportsCard.tsx`, `overview/CalendarCard.tsx`, `customers/CustomerList.tsx`, `customers/IntakeInbox.tsx`, `groups/GroupDetails.tsx`

**Interfaces:**
- **Consumes:** `rowVariants`, `RowMotion`, `useFirstKeys` (Task 1).
- **Produces:** `ListRow` gets the prop `row?: RowMotion`: when set, the row settles with its list. Also `HOVER_TINT: Record<SurfaceVariant, string>`.

- [ ] **Step 1: DataTable rows** (`dashboard/src/ui/DataTable.tsx`):
  1. **Imports.** Import `useFirstKeys, type RowMotion` from `../motion/cascade` and `rowVariants` from `../motion/variants`. Keep `fadeOut` only if it's still used; it isn't after this step.
  2. **Signature.** `renderRows` gains a third parameter, `isFirst: (key: string) => boolean`, and maps with `(row, index)`.
  3. **The motion row** becomes:

     ```tsx
      <motion.tr
        key={key}
        layout="position"
        variants={rowVariants}
        custom={{ index, cascade: isFirst(key) } satisfies RowMotion}
        exit="exit"
        transition={{ layout: springs.surface }}
        onClick={onClick}
        className={rowClass}
      >
     ```
  4. **In `TableView`,** before the early return:

     ```ts
       // The rows the table first showed cascade in as its page opens; rows a filter adds later rise in together.
       const isFirst = useFirstKeys((visibleGroups ? visibleGroups.flatMap((group) => group.rows) : (rows ?? [])).map(props.rowKey));
     ```
  5. **`body`** becomes:

     ```tsx
       // A turned page fades in as a whole; otherwise the rows shown first cascade in and later ones rise in together.
       const body = (bodyRows: Row[]) =>
         animateRows ? <AnimatePresence initial={!fade}>{renderRows(bodyRows, props, isFirst)}</AnimatePresence> : renderRows(bodyRows, props, isFirst);
     ```
  6. **The `animateRows` doc** in `DataTableProps` becomes: "Rows cascade in as the page opens, rise in or fade out as filters change, and the rest glide into place. On by default."

- [ ] **Step 2: ListRow** (`dashboard/src/ui/ListRow.tsx`). Its hover tint goes in `dashboard/src/ui/surface-tones.ts`:

```ts
/** A link or button row under the mouse: a soft tint that eases in. */
export const HOVER_TINT: Record<SurfaceVariant, string> = {
  card: "hover:bg-sand-light/60",
  glass: "hover:bg-white/50",
  ink: "hover:bg-white/6",
};
```

In `ListRow.tsx`:
1. **Imports.** Add `import { motion } from "motion/react";`, `import type { RowMotion } from "../motion/cascade";` and `import { rowVariants } from "../motion/variants";`. Add `HOVER_TINT` to the surface-tones import.
2. **The prop.** Add to `ListRowProps`:

   ```ts
     /** Settles with its list as the page opens: its place, and whether it cascades (see useFirstKeys). */
     row?: RowMotion;
   ```
3. **The hover tint.** Destructure `row`. Change `rowClass` to:

   ```ts
     const rowClass = cx("flex w-full gap-3 py-3", align === "start" ? "items-start" : "items-center");
     // Link and button rows tint under the mouse, a little past their edges so the tint isn't tight on the avatar.
     const interactiveClass = cx(rowClass, "-mx-2.5 rounded-[14px] px-2.5 transition-colors", HOVER_TINT[surface]);
   ```

   and use `interactiveClass` (in place of `rowClass`) on the `<Link>` and the `<button>`.
4. **The outer element.** Replace the return with:

   ```tsx
     const outerClass = cx("border-t first:border-t-0", DIVIDER[surface], className);
     const inner = to ? (
       <Link to={to} className={cx("group/row", interactiveClass, FOCUS_RING[surface])}>
         {body}
       </Link>
     ) : onClick ? (
       <button type="button" onClick={onClick} className={cx("group/row text-start", interactiveClass, FOCUS_RING[surface])}>
         {body}
       </button>
     ) : (
       <div className={rowClass}>{body}</div>
     );
     if (row) {
       const MotionOuter = Outer === "li" ? motion.li : motion.div;
       return (
         <MotionOuter variants={rowVariants} custom={row} className={outerClass}>
           {inner}
         </MotionOuter>
       );
     }
     return <Outer className={outerClass}>{inner}</Outer>;
   ```
5. **The doc comment** becomes: "One row of a list: lines between rows, the first without one. Link and button rows tint and underline their title on hover. With `row`, it settles with its list as the page opens."

- [ ] **Step 3: Kanban cards** (`dashboard/src/screens/leads/LeadsKanban.tsx`):
  1. **Imports.** Import `useFirstKeys, type RowMotion` from `../../motion/cascade`, `rowVariants` from `../../motion/variants`, and `CARD_PRESS_SCALE` from `../../motion/springs`. Remove `fadeOut` from the springs import.
  2. **`BoardColumn`.** After `const shown = …`, add `const isFirst = useFirstKeys(leads.map((lead) => lead.id));`. Make the presence `<AnimatePresence mode="popLayout">`, without `initial={false}`. Map with:

     ```tsx
               {shown.map((lead, index) => (
                 <LeadCard key={lead.id} lead={lead} selected={lead.id === selectedId} href={leadHref(lead.id)} row={{ index, cascade: isFirst(lead.id) }} />
               ))}
     ```
  3. **`LeadCard`** takes `row: RowMotion`. Its `motion.li` becomes:

     ```tsx
       <motion.li
         layout="position"
         variants={rowVariants}
         custom={row}
         exit="exit"
         transition={{ layout: springs.surface }}
         whileHover={{ y: -1 }}
         whileTap={{ scale: CARD_PRESS_SCALE }}
         className={cx("lift-shadow relative rounded-inner p-3.5 shadow-card transition-colors", selected ? "bg-cream ring-1 ring-ink/15 ring-inset" : "bg-paper")}
       >
     ```

     The `lift-shadow` utility is added in Task 4. Until then the class does nothing, which is harmless.
  4. **The component doc** gains a sentence: "Cards cascade in as the page opens; a lead whose status changed fades out of its old column and rises into the new one."

- [ ] **Step 4: Phone leads list** (`dashboard/src/screens/leads/LeadsPhoneList.tsx`, `TripSection`):
  1. Add `const isFirst = useFirstKeys(leads.map((lead) => lead.id));`.
  2. Make the presence `<AnimatePresence mode="popLayout">`.
  3. Map with `(lead, index)`. The `motion.li` becomes:

     ```tsx
                 <motion.li
                   key={lead.id}
                   layout="position"
                   variants={rowVariants}
                   custom={{ index, cascade: isFirst(lead.id) } satisfies RowMotion}
                   exit="exit"
                   transition={{ layout: springs.surface }}
                   className="border-t border-line first:border-t-0"
                 >
     ```
  4. Fix the imports: add `useFirstKeys, type RowMotion` and `rowVariants`, and drop `fadeOut` if it's unused.

- [ ] **Step 5: The lists that cascade.** The pattern is the same everywhere: `const isFirst = useFirstKeys(<items>.map((item) => item.id));` at the top of the component, before any early return, then `row={{ index, cascade: isFirst(<item>.id) }}` on the `ListRow` with `(item, index)` in the map. Import `useFirstKeys` from `"../../motion/cascade"`.
  - `overview/ActivityCard.tsx`:
    - add `const isFirst = useFirstKeys(items.map((item) => item.id));` after `items` is computed;
    - `items.map((item, index) => …)` with `row={{ index, cascade: isFirst(item.id) }}`.
  - `overview/PassportsCard.tsx`:
    - add `const isFirst = useFirstKeys(todays.map((intake) => intake.id));` after `todays`;
    - `todays.slice(0, SHOWN.passports).map((intake, index) => …)` with `row={{ index, cascade: isFirst(intake.id) }}`.
  - `customers/CustomerList.tsx`:
    - add `const isFirst = useFirstKeys(list.data?.items.map((customer) => customer.id) ?? []);` with the other hooks;
    - the `row` render function takes `(customer: …, index: number)` and passes `row={{ index, cascade: isFirst(customer.id) }}`;
    - `list.data.items.map(row)` already passes the index.
  - `customers/IntakeInbox.tsx`:
    - **`IntakeInbox`:** add `const isFirst = useFirstKeys(all?.map((intake) => intake.id) ?? []);` and map `all.map((intake, index) => <IntakeTile key={intake.id} intake={intake} row={{ index, cascade: isFirst(intake.id) }} />)`.
    - **`IntakeTile`** takes `row: RowMotion` and renders `<motion.li variants={rowVariants} custom={row} className="flex flex-col gap-2.5 rounded-inner bg-white/6 p-4">` (import `motion`, `rowVariants`, `RowMotion`).
    - **`IntakeList`:** add `const isFirst = useFirstKeys(today?.map((intake) => intake.id) ?? []);` and map `today.map((intake, index) => …)` with `row={{ index, cascade: isFirst(intake.id) }}`.
  - `groups/GroupDetails.tsx`:
    - in the missing-passports list's component, `const isFirst = useFirstKeys(missing.map((person) => person.id));` and `missing.map((person, index) => …)` with `row={{ index, cascade: isFirst(person.id) }}`;
    - in `ParticipantsList`, `const isFirst = useFirstKeys(shown.map((person) => person.id));` and `shown.map((person, index) => …)` with `row={{ index, cascade: isFirst(person.id) }}`.
  - `overview/CalendarCard.tsx` (`CalendarView`):
    - add `const isFirst = useFirstKeys(listed.map((item) => item.key));` after `listed`;
    - the items become:

      ```tsx
                    {listed.map((item, index) => (
                      <motion.li key={item.key} variants={rowVariants} custom={{ index, cascade: isFirst(item.key) } satisfies RowMotion}>
                        <ItemRow phone={phone} item={item} />
                      </motion.li>
                    ))}
      ```

      (import `motion`, `rowVariants`, `useFirstKeys`, `RowMotion`).

- [ ] **Step 6: Type-check, lint, and run the screen tests once**

Run: `cd dashboard && npm run typecheck && npm run lint && npx vitest run src/ui src/screens/overview src/screens/leads src/screens/customers src/screens/groups --no-file-parallelism`
Expected: typecheck and lint clean; tests pass. The 5 known failures are in DesktopShell and routes, which aren't in these folders.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/ui dashboard/src/screens
git commit -m "feat(motion): rows cascade in as a page opens; list rows tint under the mouse"
```

---

### Task 4: Hover and press

**Files:**
- Modify: `dashboard/src/styles/theme.css`, `dashboard/src/ui/LinkCard.tsx`, `dashboard/src/ui/Button.tsx`, `dashboard/src/ui/IconButton.tsx`, `dashboard/src/ui/GooButton.tsx`

**Interfaces:**
- **Consumes:** `CARD_PRESS_SCALE`, `springs.ui` (Task 1).
- **Produces:** the CSS utility `lift-shadow`.

- [ ] **Step 1: The shadow layer.** In `dashboard/src/styles/theme.css`, after `@utility surface-ink { … }`:

```css
/* A card that lifts under the mouse. Its deeper shadow is a layer of its own that fades in, so no shadow is animated.
   It needs no overflow clipping on the card itself (the black card clips, and keeps its own shadow). */
@utility lift-shadow {
  position: relative;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--shadow-card-hover);
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }
  @media (hover: hover) {
    &:hover::after {
      opacity: 1;
    }
  }
}
```

- [ ] **Step 2: LinkCard** (`dashboard/src/ui/LinkCard.tsx`):
  1. **The classes.** `card: "surface-card lift-shadow"` (in place of `hover:shadow-card-hover`), `glass: "surface-glass lift-shadow"`, `ink: "surface-ink"`.
  2. **The motion.** `whileHover={{ y: -2, transition: springs.ui }}` and `whileTap={{ scale: CARD_PRESS_SCALE, transition: springs.ui }}`. Import `CARD_PRESS_SCALE`.
  3. **The doc comment** becomes: "…It settles in with the other cards, lifts 2px with a deeper shadow under the mouse, and gives a little when pressed."

- [ ] **Step 3: Buttons lift 1px under the mouse.**
  - **`Button.tsx`:** add `whileHover={{ y: -1 }}` to the `MotionLink` and the `motion.button`, next to `whileTap`.
  - **`IconButton.tsx`:** the same, on both elements.
  - **`GooButton.tsx`:** add `variants: { rest: { y: 0 }, hover: { y: -1 } },` to the `shared` object. Its labels are already `rest` and `hover`, so the whole button lifts while its circle leans.

- [ ] **Step 4: Type-check, lint, and run the UI and theme tests**

Run: `cd dashboard && npm run typecheck && npm run lint && npx vitest run src/ui src/styles --no-file-parallelism`
Expected: clean, and the tests pass. The theme test counts `prefers-reduced-transparency` blocks, and this step adds none.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/styles/theme.css dashboard/src/ui
git commit -m "feat(motion): cards, kanban cards and buttons lift under the mouse"
```

---

### Task 5: Changes in front of you

**Files:**
- Modify: `dashboard/src/ui/count-up.ts`, `dashboard/src/ui/BigNumber.tsx`
- Create: `dashboard/src/ui/MonthSlide.tsx`
- Modify: `dashboard/src/screens/overview/CalendarCard.tsx`, `dashboard/src/screens/leads/LeadsDayPanel.tsx`

**Interfaces:**
- **Consumes:** `slideFrom` (Task 1); `springs.settle`, `springs.gentle`.
- **Produces:**
  - `useCountUp(value, ref, fromZero = true)`;
  - `MonthSlide({ month: string; direction: -1 | 0 | 1; className?: string; children: ReactNode })`.

- [ ] **Step 1: Numbers tick** (`dashboard/src/ui/count-up.ts`):
  1. **The signature** becomes `export function useCountUp(value: number, ref: RefObject<Element | null>, fromZero = true): MotionValue<string>`.
  2. **The initial state** becomes `useState(() => fromZero && entrance && !reduceMotion && typeof IntersectionObserver !== "undefined")`.
  3. **The effect's first branch** becomes:

     ```ts
         if (counted.current) {
           // A new value while it's on screen ticks over from the old one; it never counts from zero again.
           if (reduceMotion || current.get() === value) {
             current.set(value);
             return;
           }
           const ticking = animate(current, value, springs.gentle);
           return () => ticking.stop();
         }
     ```
  4. **The effect's deps** become `[value, current, ref, reduceMotion]`.
  5. **The doc comment** becomes: "A number as text. On the visit's first page, a hero number counts up from zero once, the first time it comes into view. After that, and on later pages, a new value ticks over from the old one. Without IntersectionObserver (as in tests) or with Reduce Motion, it never moves."

- [ ] **Step 2: Every big number ticks.** In `dashboard/src/ui/BigNumber.tsx`, add:

```tsx
/** A figure that ticks over from its old value when it changes; it never counts from zero. */
function TickingValue({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = useCountUp(value, ref, false);
  return <motion.span ref={ref}>{text}</motion.span>;
}
```

and render `{typeof value === "number" ? (countUp ? <CountingValue value={value} /> : <TickingValue value={value} />) : value}`.

- [ ] **Step 3: Create `dashboard/src/ui/MonthSlide.tsx`**

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useDirection } from "../content/locale";
import { springs } from "../motion/springs";
import { slideFrom } from "../motion/variants";

interface MonthSlideProps {
  /** YYYY-MM: a new month remounts and slides in. */
  month: string;
  /** 1 after "next", -1 after "previous", 0 when the month hasn't changed (it stands, as when the page opens). */
  direction: -1 | 0 | 1;
  className?: string;
  children: ReactNode;
}

/** A month calendar's days: a new month slides 16px in from the side it comes from (in Hebrew, "next" from the left). */
export function MonthSlide({ month, direction, className, children }: MonthSlideProps) {
  const rtl = useDirection() === "rtl";
  return (
    <motion.div
      key={month}
      initial={direction === 0 ? false : { opacity: 0, x: slideFrom(direction, rtl) }}
      animate={{ opacity: 1, x: 0 }}
      transition={springs.settle}
      className={className}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: The overview calendar** (`dashboard/src/screens/overview/CalendarCard.tsx`):
  1. **State.** In `CalendarCard`, add `const [direction, setDirection] = useState<-1 | 0 | 1>(0);`. In `onMonth`, before `setMonth(next)`, add `setDirection(next > month ? 1 : -1);`.
  2. **Pass it down.** Add `direction: -1 | 0 | 1;` to `CalendarState`, include `direction` in `state`, and pass `direction` to `MonthGrid`.
  3. **The grid.** `MonthGrid` takes `direction`, and its days grid `<div className="grid grid-cols-7 gap-y-0.5">…</div>` becomes `<MonthSlide month={month} direction={direction} className="grid grid-cols-7 gap-y-0.5">…</MonthSlide>`. Import `MonthSlide` from `../../ui/MonthSlide`.

- [ ] **Step 5: The leads calendar** (`dashboard/src/screens/leads/LeadsDayPanel.tsx`):
  1. **State.** Add `const [direction, setDirection] = useState<-1 | 0 | 1>(0);` next to `month`.
  2. **The buttons.** The step buttons call `setDirection(-1)` or `setDirection(1)` before `setMonth(shiftMonth(month, -1))` and `setMonth(shiftMonth(month, 1))`.
  3. **The grid.** Pass `direction` to `MonthGrid`. There, `<div className="grid grid-cols-7 gap-1">` becomes `<MonthSlide month={month} direction={direction} className="grid grid-cols-7 gap-1">`, closed with `</MonthSlide>`. Add `direction: -1 | 0 | 1` to `MonthGrid`'s props type.

- [ ] **Step 6: Type-check, lint, and run the tests touched**

Run: `cd dashboard && npm run typecheck && npm run lint && npx vitest run src/ui src/screens/overview src/screens/leads --no-file-parallelism`
Expected: clean, and the tests pass. A number still renders as its formatted text on the first frame.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/ui dashboard/src/screens/overview/CalendarCard.tsx dashboard/src/screens/leads/LeadsDayPanel.tsx
git commit -m "feat(motion): numbers tick to their new value; calendars slide to the next month"
```

---

### Task 6: Spec refinements, and checking it by eye and by frame rate

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-dashboard-motion-design.md`

- [ ] **Step 1: Bring the spec in line with what planning found.**
  - **Section 6:** table rows and list rows tint under the mouse instead of lifting, because a lift would tear the lines between rows. Kanban cards, link cards and buttons lift. Inbox tiles hold no single link, so they only cascade.
  - **Section 7:**
    - a kanban card whose status changed fades out of its old column and rises into the new one; the columns scroll and clip, so a glide across would be cut off;
    - content replacing a placeholder comes in as rows that cascade and cards that rise, and inline text swaps stay as they are.
  - **Section 4:** the headline stands while the cards settle, so a page arriving on the reel is never blank.
  - **Section 9:** jsdom has no Web Animations, so two checks move to the demo's frame screenshots (Step 3): when the reel releases a page's content, and a number ticking from its old value. The page modes are unit-tested in `outlets.test.tsx`.

- [ ] **Step 2: Build and serve the demo.** The local-only demo config swaps in made-up data.

Run: `cd dashboard && npx vite build --config vite.demo.config.ts --outDir dist-demo --emptyOutDir`. The preview server on port 5180 serves the new files on reload.

- [ ] **Step 3: Frames.** A Playwright script (in the session scratchpad, using the installed Chromium) takes screenshots:
  - on desktop: the overview, then the leads tab through the reel at 0, 150, 350, 550, 700 and 900ms;
  - a hover on a link card and on a kanban card;
  - the calendar going to the next month;
  - on phone: a tab switch.

  Check that the arriving page is never blank: its headline is visible during the spin. Check that rows cascade and the hover shadow fades in.

- [ ] **Step 4: Frame rate.** Using the same script with CDP `Emulation.setCPUThrottlingRate({ rate: 4 })`, record `requestAnimationFrame` intervals during a reel switch to the leads kanban and to the customers table.

  Expected: no long task over 50ms, and at most an occasional frame over 33ms. If it's worse, lower the work: cascade only the rows on screen, or drop `layout` on rows that don't move.

- [ ] **Step 5: Commit the spec**

```bash
git add docs/superpowers/specs/2026-11-05-dashboard-motion-design.md docs/superpowers/plans/2026-11-05-dashboard-motion.md
git commit -m "docs(motion): the plan, and the design refined while planning"
```
