# Or HaTzadik Dashboard Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of Ronit Barash's dashboard shell in `dashboard/`. It covers:
- the toolchain and theme
- the UI components
- the motion system
- the mock data layer
- the desktop and phone shells with routing and transitions
- a working sign-in screen and a first overview screen

Every other screen is a placeholder, to be refined later.

**Architecture:** One React app serves two shells, and `useShell()` switches between them at 1024px.
- **Desktop:** a glass rail and a pill menu, with page transitions.
- **Phone:** a floating tab bar, with push and pop transitions.

Screens read data only through TanStack Query hooks. The hooks call a `Services` interface, which is implemented here by a seeded in-memory mock, so Ronit's API can replace it one service at a time.

**Tech Stack:** Vite 8, React 19, TypeScript 6.0, Tailwind CSS 4, Motion 14 (`motion/react`), React Router 8, TanStack Query 5, `@fontsource-variable/rubik`, Vitest 5, Testing Library, Playwright 1.64 (installed Chrome).

**Spec:** `docs/superpowers/specs/2026-10-28-ronit-dashboard-shell-design.md`.

**Design reference:** canvas https://claude.ai/artifact/66CNW6TQi5C9HmxnXDjN9c (local source `design/canvas/project/*.dc.html`; tokens `design/canvas/assets/or-theme.css`).

## Scope of this plan

This plan builds the foundation of the spec. These spec items come later, with the screens that use them:

**Screens**
- Every screen except sign-in and the first overview. They are placeholders here.
- The lead panel, the customer profile, groups, greetings, birthdays, users and the import.

**Components**
- `DataTable`, `KeyValue`, `Timeline`, `SegBar`, `Steps`, `BarChart`, `StackedBar`, `ChatPreview`, `TextArea`, `Toast`.

**Global controls**
- The search dropdown and the notifications popover. The search field and the bell with its count are here.
- The sign-in helper sheets. "שכחתי" and "צריכים עזרה?" show their text inline for now.

**Motion**
- List reflow, panels and sheets, the weekly bars and count-ups.

**Services**
- `greetings`, `birthdays`, `users` and `imports`.

**Done when**
- All 16 tasks are committed.
- `npm run check`, `npm run build` and `npm run e2e` pass.
- `npm run dev` lets anyone sign in and land on the overview, with the desktop shell at 1440×900 and the phone shell at 390×844.
- Every other route shows its placeholder in the right shell.

**Verified before writing:** every file in this plan was extracted and run on this machine (Node 24, Windows). The full plan type-checks, lints, and passes 121 unit and component tests and 8 Playwright tests. Expect each Vitest run to take 30 to 60 seconds; most of that is jsdom start-up.

## Global Constraints

**Runtime and tooling**
- **Node:** 22.22 or newer. React Router 8 needs ≥ 22.22, and Vitest 5 needs ^22.12 or ^24; this machine has 24.16.
- **TypeScript:** must be `~6.0.3`, not 7, because typescript-eslint 8.72 supports TypeScript `<6.1.0`.
- **Package versions:** exactly as listed in Task 1's `package.json`.
- **Commands:** run every command from `D:\work\RONIT-AUTOMATION\dashboard` (Git Bash path `/d/work/RONIT-AUTOMATION/dashboard`) unless a step says otherwise.

**Imports**
- Motion comes from `motion/react`.
- `RouterProvider` comes from `react-router/dom`; everything else from `react-router`.

**RTL**
- Layout:
  - The page is `<html lang="he" dir="rtl">`.
  - Use only logical utilities (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`, `text-end`), never `pl-`, `pr-`, `ml-`, `mr-`, `left-` or `right-`.
  - Decorative positions use `insetInlineStart` and `insetInlineEnd` styles.
- Direction:
  - "Forward" is to the left: chevrons point left, and pushed screens enter from the left.
  - The back arrow points right.
- **LTR runs:** phone and passport numbers render inside `<Ltr>` (`<bdi dir="ltr">`).

**Colors and copy**
- **Colors:** use only theme tokens (`bg-ink`, `text-mute`…). No hex values in `.tsx` files.
- **No Hebrew literals in `.tsx`:** UI copy lives in `src/content/*.he.ts`, and names and notes live in `src/data/mock/`. Tests may assert literal Hebrew text.
- **Hebrew style:**
  - No em-dashes.
  - Ronit is addressed in the feminine; everyone else in gender-neutral wording.

**Motion**
- Springs come only from `src/motion/springs.ts` (`ui`, `surface`, `gentle`).
- Animate only `transform` and `opacity`.
- `MotionRoot` sets `reducedMotion="user"`.

**Shells and demo data**
- **Breakpoint:** the desktop shell is used from 1024px wide (Tailwind `lg`), the phone shell below that.
- **Demo date:** today is `VITE_DEMO_TODAY` (default `2026-10-28`), and "now" is 15:30 Israel time that day.

**Code rules**
- **Fast refresh:** `.tsx` files export components (and types) only. Constants and hooks live in `.ts` files. The exceptions are `src/app/routes.tsx`, test files and `src/test/**`.
- **Tests:** Vitest and Testing Library live in `src/**/*.test.{ts,tsx}`. Playwright lives in `tests/e2e/` and runs on the installed Chrome (`channel: "chrome"`).
- **Commits:** commit after every task. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## File structure

```
dashboard/
  package.json  tsconfig.json  vite.config.ts  eslint.config.js  index.html  .env.example  playwright.config.ts  README.md
  public/favicon.webp
  src/
    main.tsx  env.d.ts
    assets/logo.png
    styles/theme.css                       tokens + surface/scene utilities (Task 2)
    lib/        cx.ts clock.ts format.ts hebrew.ts holidays.ts           (Task 3)
    content/    *.he.ts                    all Hebrew UI copy (Tasks 1, 3, 7, 9, 11, 13, 14, 15)
    motion/     springs.ts variants.ts transitions.ts MotionRoot.tsx AnimatedOutlet.tsx StackOutlet.tsx (Task 4)
    ui/         icons.ts Icon.tsx Surface.tsx Scene.tsx OrbCard.tsx Headline.tsx StatusTag.tsx Avatar.tsx Ltr.tsx Meter.tsx (Task 5)
                MotionLink.ts Button.tsx GooButton.tsx IconButton.tsx Field.tsx ChipGroup.tsx Segmented.tsx Switch.tsx (Task 6)
                states.tsx (Task 7)  ScreenFrame.tsx (Task 14)
    data/       types.ts rules.ts mock/{rng,names,fixtures,generate}.ts        (Task 8)
                services.ts mock/createMockServices.ts                           (Task 9)
                services-context.ts ServicesProvider.tsx queryClient.ts queries.ts (Task 10)
    app/        sections.ts useShell.ts useNavBadges.ts desktop/*  (Task 11)  phone/* (Task 12)
                AppProviders.tsx RequireSession.tsx Shell.tsx routes.tsx App.tsx (Task 14)
    screens/    shared/TodayCard.tsx sign-in/SignInScreen.tsx (Task 13)  Placeholder.tsx (Task 14)  overview/OverviewScreen.tsx (Task 15)
    test/       setup.ts viewport.ts (Task 1)  router.tsx (Task 4)  app.tsx (Task 10)
  tests/e2e/smoke.spec.ts                  (Task 16)
```

---

### Task 1: Scaffold the dashboard app

**Files:**
- Create: `dashboard/package.json`, `dashboard/tsconfig.json`, `dashboard/vite.config.ts`, `dashboard/eslint.config.js`, `dashboard/index.html`, `dashboard/.env.example`, `dashboard/src/env.d.ts`, `dashboard/src/main.tsx`, `dashboard/src/app/App.tsx`, `dashboard/src/content/common.he.ts`, `dashboard/src/test/setup.ts`, `dashboard/src/test/viewport.ts`
- Copy: `brand/favicon.webp` → `dashboard/public/favicon.webp`, `brand/logo-cropped.png` → `dashboard/src/assets/logo.png`
- Test: `dashboard/src/app/App.test.tsx`

**Interfaces:**
- Produces:
  - `common` (`src/content/common.he.ts`): `{ brand: string; owner: string; brandFull: string }`.
  - `setViewportWidth(width: number): void` (`src/test/viewport.ts`).
  - npm scripts `dev` (port 5180), `build`, `typecheck`, `lint`, `test`, `e2e`, `check`.
  - In tests, `window.matchMedia` evaluates `(min-width: Npx)` and `(max-width: Npx)` against `window.innerWidth`, which defaults to 1440. Motion animations are skipped in tests.

- [ ] **Step 1: Create the branch, the folders and `package.json`**

```bash
cd /d/work/RONIT-AUTOMATION
git checkout -b feat/dashboard-foundation
mkdir -p dashboard/src/app dashboard/src/content dashboard/src/test dashboard/src/assets dashboard/public
cp brand/favicon.webp dashboard/public/favicon.webp
cp brand/logo-cropped.png dashboard/src/assets/logo.png
```

Write `dashboard/package.json`:

```json
{
  "name": "or-hatzadik-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=22.22.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -p . && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p .",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "check": "npm run typecheck && npm run lint && npm run test"
  },
  "dependencies": {
    "@fontsource-variable/rubik": "^5.3.0",
    "@tanstack/react-query": "^5.105.0",
    "motion": "^14.7.1",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "react-router": "^8.5.1"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.64.1",
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.8",
    "@types/node": "^24.0.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "eslint": "^10.13.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.7",
    "globals": "^17.13.0",
    "jsdom": "^30.1.3",
    "tailwindcss": "^4.3.3",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.72.1",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```

- [ ] **Step 2: Install**

Run: `cd /d/work/RONIT-AUTOMATION/dashboard && npm install --no-audit --no-fund`
Expected: ends with `added … packages`, and there are no `ERESOLVE` errors.

- [ ] **Step 3: Write the config files**

`dashboard/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

`dashboard/vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: { VITE_DEMO_TODAY: "2026-10-28", VITE_MOCK_LATENCY: "0,0" },
    // jsdom start-up is slow on Windows when many files run in parallel; give each test room.
    testTimeout: 20_000,
  },
});
```

`dashboard/eslint.config.js`:

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "playwright-report", "test-results"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
  },
  {
    files: ["src/app/routes.tsx", "src/test/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["*.config.{js,ts}", "tests/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
]);
```

`dashboard/index.html`:

```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="google" content="notranslate" />
    <meta name="theme-color" content="#f3eee8" />
    <link rel="icon" href="/favicon.webp" />
    <title>אור הצדיק · ניהול</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`dashboard/.env.example`:

```
# Fixed "today" for the demo data
VITE_DEMO_TODAY=2026-10-28
# Mock response delay range in milliseconds: min,max
VITE_MOCK_LATENCY=250,600
```

`dashboard/src/env.d.ts`:

```ts
interface ImportMetaEnv {
  /** Fixed demo day, YYYY-MM-DD. */
  readonly VITE_DEMO_TODAY?: string;
  /** Mock response delay range in ms: "min,max". */
  readonly VITE_MOCK_LATENCY?: string;
}
```

`dashboard/src/test/viewport.ts`:

```ts
/** Sets window.innerWidth so the matchMedia stub in setup.ts picks the desktop or phone shell. */
export function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
}
```

`dashboard/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";
import { setViewportWidth } from "./viewport";

// Springs finish instantly in tests, so assertions never wait on animation.
MotionGlobalConfig.skipAnimations = true;

// findBy and waitFor wait up to 5 seconds: jsdom is slow on Windows when many test files run in parallel.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no matchMedia. Width queries are evaluated against window.innerWidth,
// so a test can pick the phone shell with setViewportWidth(390) before rendering.
function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) return window.innerWidth >= Number(min[1]);
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (max) return window.innerWidth <= Number(max[1]);
  return false;
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: evaluate(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

setViewportWidth(1440);

afterEach(() => {
  cleanup();
  setViewportWidth(1440);
  window.sessionStorage.clear();
});
```

- [ ] **Step 4: Write the failing test**

`dashboard/src/app/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the brand heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "אור הצדיק · רונית ברש" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx vitest run src/app/App.test.tsx`
Expected: FAIL with `Failed to resolve import "./App"`.

- [ ] **Step 6: Write the minimal app**

`dashboard/src/content/common.he.ts`:

```ts
export const common = {
  brand: "אור הצדיק",
  owner: "רונית ברש",
  brandFull: "אור הצדיק · רונית ברש",
} as const;
```

`dashboard/src/app/App.tsx`:

```tsx
import { common } from "../content/common.he";

export function App() {
  return (
    <main>
      <h1>{common.brandFull}</h1>
    </main>
  );
}
```

`dashboard/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Run the checks**

Run: `npm run check`
Expected: `tsc` and `eslint` print nothing, and Vitest reports `Tests  1 passed (1)`.

Run: `npm run build`
Expected: ends with `✓ built in …`.

- [ ] **Step 8: Commit**

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Scaffold the dashboard app with Vite, React, Tailwind and tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Theme tokens and surfaces

**Files:**
- Create: `dashboard/src/styles/theme.css`
- Modify: `dashboard/src/main.tsx` (import the font and the theme)
- Test: `dashboard/src/styles/theme.test.ts`

**Interfaces:**
- Produces the Tailwind utilities below. Later tasks use these exact class names.
- **Colors:** `ink`, `ink-text`, `ink-soft`, `ink-mute`, `copy`, `mute`, `mute-2`, `faint`, `line`, `paper`, `cream`, `sand`, `sand-light`, `gold`. Status colors: `status-new`, `status-talking`, `status-sent`, `status-registered`, `status-irrelevant`, `status-warning`. Each works with `bg-`, `text-`, `ring-` and `border-`, including opacity modifiers like `bg-ink/8`.
- **Text sizes:** `text-display` (60px), `text-display-2` (42px), `text-display-3` (30px), `text-title` (17px), `text-body` (15px), `text-small` (13.5px), `text-caption` (12.5px).
- **Radii:** `rounded-card` (30px), `rounded-card-phone` (26px), `rounded-inner` (22px).
- **Shadows:** `shadow-card`, `shadow-card-hover`, `shadow-ink`, `shadow-float`, `shadow-button`, `shadow-knob`.
- **Custom utilities:**
  - Surfaces: `surface-glass`, `surface-card`, `surface-ink`.
  - Orb pieces: `frost`, `orb`.
  - `avatar-gold`, and `goo-neck` (goes on the GooButton circle).
  - Scene pieces: `scene-glow`, `scene-dome`, `scene-pearl`, `scene-pebble`.
  - `no-scrollbar`.

- [ ] **Step 1: Write the failing test**

`dashboard/src/styles/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/theme.css"), "utf8");

describe("theme tokens", () => {
  it.each([
    ["--color-ink", "#1c1a18"],
    ["--color-copy", "#36312d"],
    ["--color-mute", "#635b55"],
    ["--color-mute-2", "#4f4843"],
    ["--color-faint", "#7d756e"],
    ["--color-line", "#efe9e2"],
    ["--color-gold", "#e0ab57"],
    ["--color-status-new", "#d39c43"],
    ["--color-status-talking", "#b46c46"],
    ["--color-status-sent", "#8a7867"],
    ["--color-status-registered", "#5b8753"],
    ["--color-status-irrelevant", "#c2b9b0"],
    ["--color-status-warning", "#bd4b2e"],
    ["--radius-card", "30px"],
    ["--radius-card-phone", "26px"],
  ])("defines %s as %s", (token, value) => {
    expect(css).toContain(`${token}: ${value};`);
  });

  it("uses Rubik for all text", () => {
    expect(css).toContain('--font-sans: "Rubik Variable", system-ui, sans-serif;');
  });

  it("makes glass and frost solid when Reduce Transparency is on", () => {
    expect(css.match(/prefers-reduced-transparency: reduce/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/styles/theme.test.ts`
Expected: FAIL with `ENOENT: no such file or directory` for `src/styles/theme.css`.

- [ ] **Step 3: Write the theme**

`dashboard/src/styles/theme.css`:

```css
@import "tailwindcss";

/*
 * Or HaTzadik design tokens, ported from design/canvas/assets/or-theme.css.
 * Components use them through Tailwind utilities (bg-ink, text-mute, rounded-card...).
 */
@theme {
  --font-sans: "Rubik Variable", system-ui, sans-serif;

  --color-ink: #1c1a18;
  --color-ink-text: #ece6df;
  --color-ink-soft: #a39b93;
  --color-ink-mute: #b9b1a9;
  --color-copy: #36312d;
  --color-mute: #635b55;
  --color-mute-2: #4f4843;
  --color-faint: #7d756e;
  --color-line: #efe9e2;
  --color-paper: #ffffff;
  --color-cream: #f7f3ee;
  --color-sand: #f3ede6;
  --color-sand-light: #f6f2ed;
  --color-gold: #e0ab57;

  --color-status-new: #d39c43;
  --color-status-talking: #b46c46;
  --color-status-sent: #8a7867;
  --color-status-registered: #5b8753;
  --color-status-irrelevant: #c2b9b0;
  --color-status-warning: #bd4b2e;

  --text-display: 60px;
  --text-display--line-height: 1;
  --text-display-2: 42px;
  --text-display-2--line-height: 1.05;
  --text-display-3: 30px;
  --text-display-3--line-height: 1.1;
  --text-title: 17px;
  --text-title--line-height: 1.3;
  --text-body: 15px;
  --text-body--line-height: 1.5;
  --text-small: 13.5px;
  --text-small--line-height: 1.45;
  --text-caption: 12.5px;
  --text-caption--line-height: 1.4;

  --radius-card: 30px;
  --radius-card-phone: 26px;
  --radius-inner: 22px;

  --shadow-card: 0 1px 2px rgb(74 52 34 / 0.04), 0 34px 70px -46px rgb(74 52 34 / 0.4);
  --shadow-card-hover: 0 1px 2px rgb(74 52 34 / 0.05), 0 40px 80px -44px rgb(74 52 34 / 0.5);
  --shadow-ink: 0 34px 70px -40px rgb(28 26 24 / 0.6);
  --shadow-float: 0 24px 50px -24px rgb(74 52 34 / 0.5);
  --shadow-button: 0 8px 20px -14px rgb(74 52 34 / 0.55);
  --shadow-knob: 0 2px 6px rgb(0 0 0 / 0.22);
}

@layer base {
  html {
    color-scheme: light;
  }
  body {
    margin: 0;
    min-height: 100dvh;
    font-family: var(--font-sans);
    font-size: var(--text-body);
    line-height: 1.5;
    color: var(--color-copy);
    background:
      radial-gradient(90% 60% at 92% 0%, #f8f4ef 0%, rgb(248 244 239 / 0) 70%),
      linear-gradient(170deg, #f3eee8 0%, #ece4db 55%, #e3d9ce 100%);
    background-attachment: fixed;
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible {
    outline: 2px solid var(--color-ink);
    outline-offset: 3px;
  }
}

/* The three surfaces. Glass turns solid under Reduce Transparency. */
@utility surface-glass {
  position: relative;
  background-color: rgb(251 248 244 / 0.5);
  border: 1px solid rgb(255 255 255 / 0.75);
  -webkit-backdrop-filter: blur(28px) saturate(1.3);
  backdrop-filter: blur(28px) saturate(1.3);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.85), 0 34px 70px -48px rgb(74 52 34 / 0.45);
  @media (prefers-reduced-transparency: reduce) {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background-color: var(--color-sand-light);
  }
}

@utility surface-card {
  position: relative;
  background-color: var(--color-paper);
  box-shadow: var(--shadow-card);
}

@utility surface-ink {
  position: relative;
  overflow: hidden;
  color: var(--color-ink-text);
  background:
    radial-gradient(320px 300px at 0% 100%, rgb(224 171 87 / 0.28), rgb(224 171 87 / 0) 70%),
    var(--color-ink);
  box-shadow: var(--shadow-ink);
}

/* The frosted strip that sits over the gold orb. */
@utility frost {
  background-color: rgb(245 240 234 / 0.5);
  border: 1px solid rgb(255 255 255 / 0.65);
  -webkit-backdrop-filter: blur(30px) saturate(1.35);
  backdrop-filter: blur(30px) saturate(1.35);
  @media (prefers-reduced-transparency: reduce) {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background-color: var(--color-sand-light);
  }
}

/* The gold light, taken from the flame in the logo. */
@utility orb {
  border-radius: 9999px;
  background: radial-gradient(circle at 34% 28%, #fdf0cc 0%, #f4d18a 20%, #e3ad59 50%, #c98f40 78%, #ad7832 100%);
  box-shadow: 0 0 60px rgb(227 173 89 / 0.25);
}

@utility avatar-gold {
  background: radial-gradient(circle at 34% 28%, #fdf0cc, #e8b968 55%, #c18a3e);
  color: var(--color-ink);
}

/* The bridge that joins the pill and the circle of a GooButton. Put it on the circle. */
@utility goo-neck {
  position: relative;
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    inset-inline-start: -14px;
    width: 20px;
    height: 30px;
    margin-top: -15px;
    background: inherit;
    -webkit-mask:
      radial-gradient(circle 12px at 50% -5px, #0000 96%, #000) top / 100% 50% no-repeat,
      radial-gradient(circle 12px at 50% calc(100% + 5px), #0000 96%, #000) bottom / 100% 50% no-repeat;
    mask:
      radial-gradient(circle 12px at 50% -5px, #0000 96%, #000) top / 100% 50% no-repeat,
      radial-gradient(circle 12px at 50% calc(100% + 5px), #0000 96%, #000) bottom / 100% 50% no-repeat;
  }
}

/* Background scene pieces. */
@utility scene-glow {
  border-radius: 9999px;
  background: radial-gradient(closest-side, rgb(232 176 92 / 0.42), rgb(232 176 92 / 0.12) 58%, rgb(232 176 92 / 0));
}

@utility scene-dome {
  border-radius: 9999px;
  border: 1px solid rgb(255 255 255 / 0.6);
  background:
    radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.9) 0, rgb(255 255 255 / 0.28) 9%, rgb(255 255 255 / 0) 26%),
    radial-gradient(circle at 72% 80%, rgb(255 255 255 / 0.45) 0, rgb(255 255 255 / 0) 18%),
    radial-gradient(closest-side, rgb(255 255 255 / 0) 80%, rgb(255 255 255 / 0.26) 93%, rgb(255 255 255 / 0.62) 99%, rgb(255 255 255 / 0) 100%),
    radial-gradient(circle at 50% 85%, rgb(150 118 92 / 0.1), rgb(150 118 92 / 0) 60%);
  box-shadow: inset 0 -50px 90px rgb(255 255 255 / 0.2), 0 70px 120px -70px rgb(74 52 34 / 0.3);
}

@utility scene-pearl {
  border-radius: 9999px;
  background:
    radial-gradient(70% 42% at 50% 100%, rgb(236 158 70 / 0.55), rgb(236 158 70 / 0) 72%),
    radial-gradient(circle at 34% 26%, #fff 0, #fbf8f4 15%, #ece4db 45%, #d7cabd 74%, #c3b3a4 100%);
  box-shadow: 0 70px 90px -60px rgb(74 52 34 / 0.55);
}

@utility scene-pebble {
  border-radius: 56% 44% 52% 48% / 62% 58% 42% 38%;
  background: radial-gradient(circle at 32% 24%, #fdfbf8 0, #efe8e0 40%, #d9cdc0 80%, #c7b9aa 100%);
  box-shadow: 0 34px 44px -28px rgb(74 52 34 / 0.5);
}

@utility no-scrollbar {
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 4: Load the font and the theme in `main.tsx`**

Replace `dashboard/src/main.tsx` with:

```tsx
import "@fontsource-variable/rubik";
import "./styles/theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Run the tests and the build**

Run: `npx vitest run src/styles/theme.test.ts`
Expected: PASS, 17 tests.

Run: `npm run build`
Expected: `✓ built in …`, with a `rubik-hebrew-wght-normal-….woff2` asset in the output list.

- [ ] **Step 6: Commit**

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the theme: tokens, surfaces, orb and scene utilities" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dates, numbers and Hebrew calendar helpers

**Files:**
- Create: `dashboard/src/lib/cx.ts`, `dashboard/src/lib/clock.ts`, `dashboard/src/lib/format.ts`, `dashboard/src/lib/hebrew.ts`, `dashboard/src/lib/holidays.ts`, `dashboard/src/content/time.he.ts`, `dashboard/src/content/holidays.he.ts`
- Test: `dashboard/src/lib/clock.test.ts`, `dashboard/src/lib/format.test.ts`, `dashboard/src/lib/hebrew.test.ts`, `dashboard/src/lib/holidays.test.ts`

**Interfaces:**
- Produces:
  - **`cx.ts`:** `cx(...parts: Array<string | false | null | undefined>): string`.
  - **`clock.ts`:**
    - `TIME_ZONE`
    - `isoDay(date: Date): string` (YYYY-MM-DD in Israel)
    - `dayAt(day: string, time?: string): Date`
    - `today(): Date` (demo day at noon)
    - `now(): Date` (demo day at 15:30)
    - `addDays(date: Date, days: number): Date`
    - `daysBetween(from: Date, to: Date): number`
    - `weekStart(date: Date): Date` (Sunday)
  - **`format.ts`:**
    - `formatNumber(n)` → `"1,284"`
    - `formatDayMonth(d)` → `"28.10"`
    - `formatDate(d)` → `"28.10.2026"`
    - `formatTime(d)` → `"09:05"`
    - `formatWeekday(d)` → `"רביעי"`
    - `maskPhone(phone)` → `"054-•••-2219"`
    - `maskPassport(n)` → `"38•••921"`
    - `formatRelative(date, reference)`
  - **`hebrew.ts`:**
    - `toHebrewNumeral(n: number): string`
    - `hebrewDateParts(d): { day: number; month: string; year: number }`
    - `formatHebrewDate(d)` → `"י״ז בחשוון תשפ״ז"`
    - `sameHebrewMonth(a, b): boolean`
  - **`holidays.ts`:**
    - type `HolidayKey`
    - `interface UpcomingHoliday { key: HolidayKey; day: Date; eve: Date; daysToEve: number }`
    - `nextHoliday(from: Date): UpcomingHoliday`
  - **`holidays.he.ts`:**
    - `holidayNames: Record<HolidayKey, string>`
    - `holidayCountdown(name: string, days: number): string`

- [ ] **Step 1: Write the failing tests**

`dashboard/src/lib/clock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, dayAt, daysBetween, isoDay, now, today, weekStart } from "./clock";

describe("clock", () => {
  it("anchors the demo day on 2026-10-28", () => {
    expect(isoDay(today())).toBe("2026-10-28");
    expect(now().toISOString()).toBe("2026-10-28T13:30:00.000Z");
  });

  it("counts calendar days in Israel time", () => {
    expect(daysBetween(dayAt("2026-10-28"), dayAt("2026-12-04"))).toBe(37);
    expect(daysBetween(dayAt("2026-10-28", "23:30"), dayAt("2026-10-29", "00:30"))).toBe(1);
  });

  it("adds days and finds the Sunday that starts the week", () => {
    expect(isoDay(addDays(dayAt("2026-10-28"), -3))).toBe("2026-10-25");
    expect(isoDay(weekStart(dayAt("2026-10-28")))).toBe("2026-10-25");
    expect(isoDay(weekStart(dayAt("2026-10-25")))).toBe("2026-10-25");
  });

  it("rejects malformed days", () => {
    expect(() => dayAt("28.10.2026")).toThrow("Expected YYYY-MM-DD");
  });
});
```

`dashboard/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayAt } from "./clock";
import { formatDate, formatDayMonth, formatNumber, formatRelative, formatTime, formatWeekday, maskPassport, maskPhone } from "./format";

const reference = dayAt("2026-10-28", "15:30");

describe("format", () => {
  it("formats numbers and dates the Israeli way", () => {
    expect(formatNumber(1284)).toBe("1,284");
    expect(formatDayMonth(dayAt("2026-10-28"))).toBe("28.10");
    expect(formatDate(dayAt("2026-10-28"))).toBe("28.10.2026");
    expect(formatTime(dayAt("2026-10-28", "09:05"))).toBe("09:05");
    expect(formatWeekday(dayAt("2026-10-28"))).toBe("רביעי");
  });

  it("masks phone and passport numbers", () => {
    expect(maskPhone("0542212219")).toBe("054-•••-2219");
    expect(maskPhone("054-221-2219")).toBe("054-•••-2219");
    expect(maskPassport("38412921")).toBe("38•••921");
  });

  it("writes relative times like the canvas", () => {
    expect(formatRelative(dayAt("2026-10-28", "15:10"), reference)).toBe("לפני 20 דקות");
    expect(formatRelative(dayAt("2026-10-28", "14:30"), reference)).toBe("לפני שעה");
    expect(formatRelative(dayAt("2026-10-28", "12:30"), reference)).toBe("לפני 3 שעות");
    expect(formatRelative(dayAt("2026-10-28", "09:12"), reference)).toBe("היום 09:12");
    expect(formatRelative(dayAt("2026-10-27", "17:00"), reference)).toBe("אתמול");
    expect(formatRelative(dayAt("2026-10-24", "12:00"), reference)).toBe("24.10");
  });
});
```

`dashboard/src/lib/hebrew.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayAt } from "./clock";
import { formatHebrewDate, hebrewDateParts, sameHebrewMonth, toHebrewNumeral } from "./hebrew";

describe("Hebrew numerals", () => {
  it.each([
    [1, "א׳"],
    [5, "ה׳"],
    [15, "ט״ו"],
    [16, "ט״ז"],
    [17, "י״ז"],
    [25, "כ״ה"],
    [30, "ל׳"],
    [115, "קט״ו"],
    [400, "ת׳"],
    [787, "תשפ״ז"],
    [999, "תתקצ״ט"],
  ])("writes %i as %s", (value, text) => {
    expect(toHebrewNumeral(value)).toBe(text);
  });

  it("rejects numbers it cannot write", () => {
    expect(() => toHebrewNumeral(0)).toThrow(RangeError);
    expect(() => toHebrewNumeral(1000)).toThrow(RangeError);
  });
});

describe("Hebrew dates", () => {
  it("reads the Hebrew calendar day", () => {
    expect(hebrewDateParts(dayAt("2026-10-28"))).toEqual({ day: 17, month: "חשוון", year: 5787 });
  });

  it("writes the date the way the dashboard shows it", () => {
    expect(formatHebrewDate(dayAt("2026-10-28"))).toBe("י״ז בחשוון תשפ״ז");
  });

  it("matches month names across spellings", () => {
    expect(sameHebrewMonth("חשון", "חשוון")).toBe(true);
    expect(sameHebrewMonth("אדר ב׳", "אדר ב'")).toBe(true);
    expect(sameHebrewMonth("אדר א׳", "אדר ב׳")).toBe(false);
  });
});
```

`dashboard/src/lib/holidays.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { holidayCountdown, holidayNames } from "../content/holidays.he";
import { dayAt, isoDay } from "./clock";
import { nextHoliday } from "./holidays";

describe("nextHoliday", () => {
  it("finds Hanukkah 37 days before its eve", () => {
    const next = nextHoliday(dayAt("2026-10-28"));
    expect(next.key).toBe("hanukkah");
    expect(isoDay(next.eve)).toBe("2026-12-04");
    expect(next.daysToEve).toBe(37);
  });

  it("counts the eve itself as day zero", () => {
    expect(nextHoliday(dayAt("2026-12-04"))).toMatchObject({ key: "hanukkah", daysToEve: 0 });
  });

  it("moves on once the eve has passed", () => {
    const next = nextHoliday(dayAt("2026-12-05"));
    expect(next.key).toBe("tuBishvat");
    expect(isoDay(next.day)).toBe("2027-01-23");
  });

  it("puts Purim in Adar II in a leap year", () => {
    expect(isoDay(nextHoliday(dayAt("2027-02-01")).day)).toBe("2027-03-23");
  });
});

describe("holiday copy", () => {
  it("counts down in natural Hebrew", () => {
    expect(holidayCountdown(holidayNames.hanukkah, 37)).toBe("חנוכה בעוד 37 ימים");
    expect(holidayCountdown(holidayNames.hanukkah, 1)).toBe("חנוכה מחר");
    expect(holidayCountdown(holidayNames.hanukkah, 0)).toBe("חנוכה הערב");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib`
Expected: FAIL. The four files report `Failed to resolve import "./clock"`, `"./format"`, `"./hebrew"` and `"./holidays"`.

- [ ] **Step 3: Write the helpers**

`dashboard/src/lib/cx.ts`:

```ts
/** Joins class names, skipping empty ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

`dashboard/src/lib/clock.ts`:

```ts
export const TIME_ZONE = "Asia/Jerusalem";

const DEFAULT_DAY = "2026-10-28";
const DEMO_TIME = "15:30";
const DAY_MS = 86_400_000;

const isoDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day of `date` in Israel, as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return isoDayFormat.format(date);
}

/**
 * A moment on a calendar day in Israel. The +02:00 offset is exact in winter;
 * in summer the clock time is an hour off, but the calendar day is always right.
 */
export function dayAt(day: string, time = "12:00"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Expected YYYY-MM-DD, got "${day}"`);
  return new Date(`${day}T${time}:00+02:00`);
}

function demoDay(): string {
  return import.meta.env.VITE_DEMO_TODAY || DEFAULT_DAY;
}

/** The demo "today", at noon. Mock data is built around this day. */
export function today(): Date {
  return dayAt(demoDay());
}

/** The demo "now": the demo day at 15:30 Israel time. */
export function now(): Date {
  return dayAt(demoDay(), DEMO_TIME);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcMidnight(date: Date): number {
  const [year, month, day] = isoDay(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Whole calendar days from `from` to `to`, counted in Israel time. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

/** The Sunday that starts the week containing `date` (Israeli weeks start on Sunday). */
export function weekStart(date: Date): Date {
  const weekday = new Date(utcMidnight(date)).getUTCDay();
  return dayAt(isoDay(addDays(date, -weekday)));
}
```

`dashboard/src/content/time.he.ts`:

```ts
export const time = {
  minutesAgo: (minutes: number) => (minutes === 1 ? "לפני דקה" : `לפני ${minutes} דקות`),
  hoursAgo: (hours: number) => (hours === 1 ? "לפני שעה" : `לפני ${hours} שעות`),
  today: (clock: string) => `היום ${clock}`,
  yesterday: "אתמול",
} as const;
```

`dashboard/src/lib/format.ts`:

```ts
import { time } from "../content/time.he";
import { TIME_ZONE, daysBetween } from "./clock";

const numberFormat = new Intl.NumberFormat("he-IL");
const dayMonthFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFormat = new Intl.DateTimeFormat("he-IL", { timeZone: TIME_ZONE, weekday: "long" });

export const formatNumber = (value: number): string => numberFormat.format(value);
export const formatDayMonth = (date: Date): string => dayMonthFormat.format(date);
export const formatDate = (date: Date): string => dateFormat.format(date);
export const formatTime = (date: Date): string => timeFormat.format(date);

/** The weekday name without the word "יום", e.g. "רביעי". */
export function formatWeekday(date: Date): string {
  return weekdayFormat.format(date).replace(/^יום\s+/, "");
}

/** "0542212219" becomes "054-•••-2219". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 7 ? digits : `${digits.slice(0, 3)}-•••-${digits.slice(-4)}`;
}

/** "38412921" becomes "38•••921". */
export function maskPassport(passport: string): string {
  return passport.length < 6 ? "•••" : `${passport.slice(0, 2)}•••${passport.slice(-3)}`;
}

/** Short relative time as the dashboard shows it: "לפני שעה", "היום 09:12", "אתמול", "24.10". */
export function formatRelative(date: Date, reference: Date): string {
  const minutes = Math.round((reference.getTime() - date.getTime()) / 60_000);
  const days = daysBetween(date, reference);
  if (days === 0 && minutes >= 0 && minutes < 60) return time.minutesAgo(Math.max(1, minutes));
  if (days === 0 && minutes >= 60 && minutes < 4 * 60) return time.hoursAgo(Math.round(minutes / 60));
  if (days === 0) return time.today(formatTime(date));
  if (days === 1) return time.yesterday;
  return formatDayMonth(date);
}
```

`dashboard/src/lib/hebrew.ts`:

```ts
import { TIME_ZONE } from "./clock";

const HUNDREDS: Array<[number, string]> = [[300, "ש"], [200, "ר"], [100, "ק"]];
const TENS: Array<[number, string]> = [[90, "צ"], [80, "פ"], [70, "ע"], [60, "ס"], [50, "נ"], [40, "מ"], [30, "ל"], [20, "כ"], [10, "י"]];
const ONES: Array<[number, string]> = [[9, "ט"], [8, "ח"], [7, "ז"], [6, "ו"], [5, "ה"], [4, "ד"], [3, "ג"], [2, "ב"], [1, "א"]];
const GERESH = "׳";
const GERSHAYIM = "״";

/** Hebrew numerals: 17 is "י״ז", 15 is "ט״ו", 5 is "ה׳", 787 is "תשפ״ז". */
export function toHebrewNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 999) {
    throw new RangeError(`Cannot write ${value} in Hebrew numerals`);
  }
  let rest = value;
  let letters = "";
  while (rest >= 400) {
    letters += "ת";
    rest -= 400;
  }
  for (const [amount, letter] of HUNDREDS) {
    if (rest >= amount) {
      letters += letter;
      rest -= amount;
      break;
    }
  }
  // 15 and 16 are written ט״ו and ט״ז so they never spell a divine name.
  if (rest === 15 || rest === 16) {
    letters += rest === 15 ? "טו" : "טז";
    rest = 0;
  }
  for (const [amount, letter] of TENS) {
    if (rest >= amount) {
      letters += letter;
      rest -= amount;
      break;
    }
  }
  for (const [amount, letter] of ONES) {
    if (rest >= amount) {
      letters += letter;
      break;
    }
  }
  return letters.length === 1 ? letters + GERESH : `${letters.slice(0, -1)}${GERSHAYIM}${letters.slice(-1)}`;
}

// Latin digits are forced so the day and year always parse as numbers.
const hebrewCalendar = new Intl.DateTimeFormat("he-IL-u-ca-hebrew-nu-latn", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

export interface HebrewDate {
  day: number;
  month: string;
  year: number;
}

export function hebrewDateParts(date: Date): HebrewDate {
  const parts = Object.fromEntries(hebrewCalendar.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: Number(parts.day), month: String(parts.month), year: Number(parts.year) };
}

/** 2026-10-28 becomes "י״ז בחשוון תשפ״ז". */
export function formatHebrewDate(date: Date): string {
  const { day, month, year } = hebrewDateParts(date);
  return `${toHebrewNumeral(day)} ב${month} ${toHebrewNumeral(year % 1000)}`;
}

/** Compares month names across spellings ("חשון" and "חשוון", "אדר ב׳" and "אדר ב'"). */
export function sameHebrewMonth(a: string, b: string): boolean {
  const normalize = (month: string) => month.replace(/[וי׳'״"\s]/g, "");
  return normalize(a) === normalize(b);
}
```

`dashboard/src/lib/holidays.ts`:

```ts
import { addDays, daysBetween } from "./clock";
import { hebrewDateParts, sameHebrewMonth } from "./hebrew";

export type HolidayKey =
  | "roshHashana"
  | "yomKippur"
  | "sukkot"
  | "hanukkah"
  | "tuBishvat"
  | "purim"
  | "pesach"
  | "shavuot"
  | "tuBav";

interface HolidayRule {
  key: HolidayKey;
  months: string[];
  day: number;
}

// Hebrew-calendar dates of the holidays Ronit sends greetings for. Purim is in Adar II in leap years.
const RULES: HolidayRule[] = [
  { key: "roshHashana", months: ["תשרי"], day: 1 },
  { key: "yomKippur", months: ["תשרי"], day: 10 },
  { key: "sukkot", months: ["תשרי"], day: 15 },
  { key: "hanukkah", months: ["כסלו"], day: 25 },
  { key: "tuBishvat", months: ["שבט"], day: 15 },
  { key: "purim", months: ["אדר", "אדר ב׳"], day: 14 },
  { key: "pesach", months: ["ניסן"], day: 15 },
  { key: "shavuot", months: ["סיוון"], day: 6 },
  { key: "tuBav", months: ["אב"], day: 15 },
];

export interface UpcomingHoliday {
  key: HolidayKey;
  /** The holiday itself. */
  day: Date;
  /** The evening it starts; greetings go out then. */
  eve: Date;
  daysToEve: number;
}

/** The next holiday whose eve is today or later. */
export function nextHoliday(from: Date): UpcomingHoliday {
  for (let offset = 0; offset <= 400; offset += 1) {
    const day = addDays(from, offset);
    const { day: dayOfMonth, month } = hebrewDateParts(day);
    const rule = RULES.find((r) => r.day === dayOfMonth && r.months.some((m) => sameHebrewMonth(m, month)));
    if (!rule) continue;
    const eve = addDays(day, -1);
    const daysToEve = daysBetween(from, eve);
    if (daysToEve >= 0) return { key: rule.key, day, eve, daysToEve };
  }
  throw new Error("No holiday within 400 days");
}
```

`dashboard/src/content/holidays.he.ts`:

```ts
import type { HolidayKey } from "../lib/holidays";

export const holidayNames: Record<HolidayKey, string> = {
  roshHashana: "ראש השנה",
  yomKippur: "יום כיפור",
  sukkot: "סוכות",
  hanukkah: "חנוכה",
  tuBishvat: "ט״ו בשבט",
  purim: "פורים",
  pesach: "פסח",
  shavuot: "שבועות",
  tuBav: "ט״ו באב",
};

export function holidayCountdown(name: string, days: number): string {
  if (days === 0) return `${name} הערב`;
  if (days === 1) return `${name} מחר`;
  return `${name} בעוד ${days} ימים`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib`
Expected: PASS, 4 files and 27 tests.

- [ ] **Step 5: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add date, number and Hebrew calendar helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Motion system

**Files:**
- Create: `dashboard/src/motion/springs.ts`, `dashboard/src/motion/transitions.ts`, `dashboard/src/motion/variants.ts`, `dashboard/src/motion/MotionRoot.tsx`, `dashboard/src/motion/AnimatedOutlet.tsx`, `dashboard/src/motion/StackOutlet.tsx`, `dashboard/src/test/router.tsx`
- Test: `dashboard/src/motion/transitions.test.ts`, `dashboard/src/motion/outlets.test.tsx`

**Interfaces:**
- Consumes: `cx` (Task 3).
- Produces:
  - **`springs.ts`:**
    - `springs.ui`, `springs.surface`, `springs.gentle` (Motion spring transitions)
    - `fadeOut` (120ms opacity tween)
    - `STAGGER_SECONDS = 0.04`
    - `PRESS_SCALE = 0.96`
  - **`transitions.ts`:**
    - `type PushDirection = "forward" | "back"`
    - `interface ScreenTransition { kind: "fade" | "push"; direction: PushDirection }`
    - `resolveScreenTransition(input: { from: string | null; to: string; navigationType: string; backHint: boolean; isPushed: (pathname: string) => boolean }): ScreenTransition`
  - **`variants.ts`:**
    - `pageVariants`, `cardVariants`, `screenVariants` and `staggerVariants`.
    - Variant names are `"initial"`, `"enter"` and `"exit"`.
    - `screenVariants` reads a `ScreenTransition` through `custom`.
  - **Components:**
    - `<MotionRoot>`.
    - `<AnimatedOutlet pageKey? className? />`: the desktop page change.
    - `<StackOutlet isPushed className? />`: phone push and pop. A navigation whose `location.state` is `{ direction: "back" }` animates as back.
  - **`src/test/router.tsx`:**
    - `renderRoutes(routes: RouteObject[], initialPath?: string)`
    - `renderInRouter(ui: ReactElement, initialPath?: string)`
    - Both return Testing Library's render result plus `router`.

- [ ] **Step 1: Write the failing tests**

`dashboard/src/motion/transitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { springs } from "./springs";
import { resolveScreenTransition } from "./transitions";

const isPushed = (pathname: string) => /^\/(leads|customers)\/[^/]+$/.test(pathname) || pathname === "/users" || pathname === "/import";

describe("resolveScreenTransition", () => {
  it("fades between tabs", () => {
    expect(resolveScreenTransition({ from: "/", to: "/leads", navigationType: "PUSH", backHint: false, isPushed })).toEqual({ kind: "fade", direction: "forward" });
  });

  it("pushes forward into a detail screen", () => {
    expect(resolveScreenTransition({ from: "/customers", to: "/customers/c1", navigationType: "PUSH", backHint: false, isPushed })).toEqual({ kind: "push", direction: "forward" });
  });

  it("pops back with browser back", () => {
    expect(resolveScreenTransition({ from: "/customers/c1", to: "/customers", navigationType: "POP", backHint: false, isPushed })).toEqual({ kind: "push", direction: "back" });
  });

  it("pops back when a back button replaced the entry", () => {
    expect(resolveScreenTransition({ from: "/import", to: "/users", navigationType: "REPLACE", backHint: true, isPushed })).toEqual({ kind: "push", direction: "back" });
  });

  it("does not push on the first screen", () => {
    expect(resolveScreenTransition({ from: null, to: "/customers/c1", navigationType: "POP", backHint: false, isPushed }).kind).toBe("fade");
  });
});

describe("springs", () => {
  it("are all physical springs", () => {
    for (const spring of Object.values(springs)) expect(spring.type).toBe("spring");
  });
});
```

`dashboard/src/motion/outlets.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { renderRoutes } from "../test/router";
import { AnimatedOutlet } from "./AnimatedOutlet";
import { MotionRoot } from "./MotionRoot";
import { StackOutlet } from "./StackOutlet";

function ReducedMotionSetting() {
  return <span>{String(useContext(MotionConfigContext).reducedMotion)}</span>;
}

describe("MotionRoot", () => {
  it("follows the system Reduce Motion setting", () => {
    render(
      <MotionRoot>
        <ReducedMotionSetting />
      </MotionRoot>,
    );
    expect(screen.getByText("user")).toBeInTheDocument();
  });
});

describe("AnimatedOutlet", () => {
  it("swaps pages on navigation", async () => {
    const { router } = renderRoutes([
      {
        path: "/",
        element: <AnimatedOutlet />,
        children: [
          { index: true, element: <h1>home</h1> },
          { path: "leads", element: <h1>leads</h1> },
        ],
      },
    ]);
    expect(await screen.findByRole("heading", { name: "home" })).toBeInTheDocument();
    await act(() => router.navigate("/leads"));
    expect(await screen.findByRole("heading", { name: "leads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "home" })).not.toBeInTheDocument();
  });

  it("keeps one page for paths that share a page key", async () => {
    const pageKey = (pathname: string) => (pathname.startsWith("/leads") ? "/leads" : pathname);
    const { router } = renderRoutes(
      [
        {
          path: "/",
          element: <AnimatedOutlet pageKey={pageKey} />,
          children: [
            { path: "leads", element: <h1>list</h1> },
            { path: "leads/:id", element: <h1>panel</h1> },
          ],
        },
      ],
      "/leads",
    );
    const page = (await screen.findByRole("heading", { name: "list" })).parentElement;
    await act(() => router.navigate("/leads/7"));
    expect((await screen.findByRole("heading", { name: "panel" })).parentElement).toBe(page);
  });
});

describe("StackOutlet", () => {
  it("stacks a pushed screen above the list and pops back", async () => {
    const { router } = renderRoutes(
      [
        {
          path: "/",
          element: <StackOutlet isPushed={(pathname) => pathname.startsWith("/customers/")} />,
          children: [
            { path: "customers", element: <h1>list</h1> },
            { path: "customers/:id", element: <h1>profile</h1> },
          ],
        },
      ],
      "/customers",
    );
    await act(() => router.navigate("/customers/c1"));
    const profile = await screen.findByRole("heading", { name: "profile" });
    expect(profile.parentElement).toHaveStyle({ zIndex: "2" });
    await act(() => router.navigate(-1));
    expect(await screen.findByRole("heading", { name: "list" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "profile" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/motion`
Expected: FAIL with `Failed to resolve import "./springs"` and `Failed to resolve import "../test/router"`.

- [ ] **Step 3: Write the test router helper**

`dashboard/src/test/router.tsx`:

```tsx
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";

/** Renders routes in a memory router. Navigate with the returned `router`. */
export function renderRoutes(routes: RouteObject[], initialPath = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

/** Renders one element at every path, for components that need a router (links). */
export function renderInRouter(ui: ReactElement, initialPath = "/") {
  return renderRoutes([{ path: "*", element: ui }], initialPath);
}
```

- [ ] **Step 4: Write the motion system**

`dashboard/src/motion/springs.ts`:

```ts
import type { Transition } from "motion/react";

/** The only springs in the app (spec section 8). */
export const springs = {
  /** Menu pill, tab highlight, segmented controls, presses. */
  ui: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  /** Pages, cards, panels, sheets. */
  surface: { type: "spring", visualDuration: 0.4, bounce: 0.1 },
  /** Charts, meters, count-ups. */
  gentle: { type: "spring", visualDuration: 0.6, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** Leaving pages fade out fast and do not move. */
export const fadeOut: Transition = { duration: 0.12, ease: [0.22, 1, 0.36, 1] };

export const STAGGER_SECONDS = 0.04;
export const PRESS_SCALE = 0.96;
```

`dashboard/src/motion/transitions.ts`:

```ts
export type PushDirection = "forward" | "back";

export interface ScreenTransition {
  kind: "fade" | "push";
  direction: PushDirection;
}

interface ResolveInput {
  from: string | null;
  to: string;
  /** React Router's navigation type: "POP", "PUSH" or "REPLACE". */
  navigationType: string;
  /** True when the navigation was a back button that replaced the entry. */
  backHint: boolean;
  isPushed: (pathname: string) => boolean;
}

/**
 * How the phone shell animates a navigation.
 * Going into a pushed screen pushes forward. Leaving one with browser back (or a back hint) pops back.
 * Everything else, like switching tabs, fades.
 */
export function resolveScreenTransition({ from, to, navigationType, backHint, isPushed }: ResolveInput): ScreenTransition {
  const direction: PushDirection = navigationType === "POP" || backHint ? "back" : "forward";
  if (from === null || from === to) return { kind: "fade", direction };
  if (direction === "forward" && isPushed(to)) return { kind: "push", direction };
  if (direction === "back" && isPushed(from)) return { kind: "push", direction };
  return { kind: "fade", direction };
}
```

`dashboard/src/motion/variants.ts`:

```ts
import type { Variants } from "motion/react";
import { STAGGER_SECONDS, fadeOut, springs } from "./springs";
import type { ScreenTransition } from "./transitions";

/** Desktop page change: the new page rises in, the old one fades out fast. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0, transition: { ...springs.surface, staggerChildren: STAGGER_SECONDS } },
  exit: { opacity: 0, transition: fadeOut },
};

/** Lets children with cardVariants settle in one after another. */
export const staggerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: STAGGER_SECONDS } },
};

/** Cards settle in under a parent that animates from "initial" to "enter". */
export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: springs.surface },
};

/** Phone screens: fade between tabs; push and pop detail screens (RTL: forward enters from the left). */
export const screenVariants: Variants = {
  initial: ({ kind, direction }: ScreenTransition) => {
    if (kind === "fade") return { opacity: 0, y: 12 };
    return direction === "forward" ? { x: "-100%", opacity: 1 } : { x: "30%", opacity: 0.6 };
  },
  enter: ({ kind }: ScreenTransition) =>
    kind === "fade" ? { opacity: 1, y: 0, transition: springs.surface } : { x: 0, opacity: 1, transition: springs.surface },
  exit: ({ kind, direction }: ScreenTransition) => {
    if (kind === "fade") return { opacity: 0, transition: fadeOut };
    return direction === "forward"
      ? { x: "30%", opacity: 0.6, transition: springs.surface }
      : { x: "-100%", opacity: 1, transition: springs.surface };
  },
};
```

`dashboard/src/motion/MotionRoot.tsx`:

```tsx
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Motion defaults for the whole app. With Reduce Motion on, movement turns into fades. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

`dashboard/src/motion/AnimatedOutlet.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router";
import { pageVariants } from "./variants";

interface AnimatedOutletProps {
  /** Paths with the same key share one page, so changes inside it (like opening a panel) do not animate. */
  pageKey?: (pathname: string) => string;
  className?: string;
}

/** Desktop page changes: the old page fades out fast, then the new one rises in. */
export function AnimatedOutlet({ pageKey = (pathname) => pathname, className }: AnimatedOutletProps) {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={pageKey(location.pathname)} variants={pageVariants} initial="initial" animate="enter" exit="exit" className={className}>
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
```

`dashboard/src/motion/StackOutlet.tsx`:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLocation, useNavigationType, useOutlet } from "react-router";
import { cx } from "../lib/cx";
import { resolveScreenTransition, type ScreenTransition } from "./transitions";
import { screenVariants } from "./variants";

interface StackOutletProps {
  isPushed: (pathname: string) => boolean;
  className?: string;
}

/**
 * Phone screens. Each screen is its own scroller, stacked so a push and a pop can overlap:
 * pushed screens sit above their list (z-index 2 over 1) both on the way in and on the way out.
 */
export function StackOutlet({ isPushed, className }: StackOutletProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const backHint = (location.state as { direction?: string } | null)?.direction === "back";

  const [shown, setShown] = useState<{ path: string; transition: ScreenTransition }>(() => ({
    path: location.pathname,
    transition: resolveScreenTransition({ from: null, to: location.pathname, navigationType, backHint, isPushed }),
  }));

  // Remember the previous path in state (React's pattern for reacting to a changed value during render).
  let transition = shown.transition;
  if (shown.path !== location.pathname) {
    transition = resolveScreenTransition({ from: shown.path, to: location.pathname, navigationType, backHint, isPushed });
    setShown({ path: location.pathname, transition });
  }

  return (
    <div className={cx("relative overflow-hidden", className)}>
      <AnimatePresence custom={transition}>
        <motion.div
          key={location.pathname}
          custom={transition}
          variants={screenVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          className="no-scrollbar absolute inset-0 overflow-y-auto"
          style={{ zIndex: isPushed(location.pathname) ? 2 : 1 }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/motion`
Expected: PASS, 2 files and 10 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the motion system: springs, page and stack transitions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Icons and display components

**Files:**
- Create: `dashboard/src/ui/icons.ts`, `dashboard/src/ui/Icon.tsx`, `dashboard/src/ui/Surface.tsx`, `dashboard/src/ui/Scene.tsx`, `dashboard/src/ui/OrbCard.tsx`, `dashboard/src/ui/Headline.tsx`, `dashboard/src/ui/StatusTag.tsx`, `dashboard/src/ui/Avatar.tsx`, `dashboard/src/ui/Ltr.tsx`, `dashboard/src/ui/Meter.tsx`
- Test: `dashboard/src/ui/display.test.tsx`

**Interfaces:**
- Consumes:
  - `cx` (Task 3).
  - `cardVariants` and `springs` (Task 4).
  - The theme utilities (Task 2).
- Produces:
  - **Icons:**
    - `type IconName`, with these names: `home`, `leads`, `customers`, `groups`, `greetings`, `chat`, `import`, `history`, `users`, `settings`, `search`, `bell`, `forward`, `back`, `check`, `plus`, `at`, `key`, `lock`, `edit`, `phone`, `shield`, `signOut`.
    - `<Icon name size? className? />`.
  - **Surfaces and scene:**
    - `type SurfaceVariant = "glass" | "card" | "ink"`.
    - `<Surface variant compact? as?="section"|"div" …motion section props />`.
    - `type ScenePreset = "app" | "phone" | "login"` and `<Scene preset />`.
  - **Orb card:** `<OrbCard label strip side? orb?={ size, end, top } stripBasis? compact? className? />`.
  - **Text and status:**
    - `<Headline title soft? size?="display"|"display-2"|"display-3" level?=1|2 onDark? className? />`.
    - `type StatusTone = "new" | "talking" | "sent" | "registered" | "irrelevant" | "warning" | "neutral"`.
    - `<StatusTag tone? onDark?>words</StatusTag>`.
  - **Small pieces:**
    - `<Avatar initial gold? size?="sm"|"md"|"lg" className? />`.
    - `<Ltr>…</Ltr>`.
    - `<Meter value label onDark? className? />` (value 0 to 1).

- [ ] **Step 1: Write the failing test**

`dashboard/src/ui/display.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { Headline } from "./Headline";
import { Icon } from "./Icon";
import { Ltr } from "./Ltr";
import { Meter } from "./Meter";
import { OrbCard } from "./OrbCard";
import { Scene } from "./Scene";
import { StatusTag } from "./StatusTag";
import { Surface } from "./Surface";

describe("display components", () => {
  it("draws icons as hidden decoration", () => {
    const { container } = render(<Icon name="bell" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("path")).toHaveLength(2);
  });

  it("renders a surface as a labelled region with its material", () => {
    render(
      <Surface variant="glass" aria-label="panel">
        x
      </Surface>,
    );
    expect(screen.getByRole("region", { name: "panel" })).toHaveClass("surface-glass", "rounded-card");
  });

  it("uses phone density when compact", () => {
    render(
      <Surface variant="ink" compact aria-label="dark">
        x
      </Surface>,
    );
    expect(screen.getByRole("region", { name: "dark" })).toHaveClass("surface-ink", "rounded-card-phone");
  });

  it("puts both headline tones in one heading", () => {
    render(<Headline title="Hello" soft="world" />);
    expect(screen.getByRole("heading", { level: 1, name: "Hello world" })).toBeInTheDocument();
  });

  it("shows status as words next to a colored dot", () => {
    const { container } = render(<StatusTag tone="talking">in talks</StatusTag>);
    expect(screen.getByText("in talks")).toBeInTheDocument();
    expect(container.querySelector('[data-tone="talking"]')).toHaveClass("bg-status-talking");
  });

  it("renders the orb card with strip and side content", () => {
    render(<OrbCard label="today" strip={<p>strip</p>} side={<p>side</p>} />);
    const card = screen.getByRole("region", { name: "today" });
    expect(card).toHaveTextContent("strip");
    expect(card).toHaveTextContent("side");
    expect(card.querySelector(".orb")).toHaveAttribute("aria-hidden", "true");
  });

  it("hides the decorative avatar and scene from assistive tech", () => {
    const { container } = render(
      <>
        <Avatar initial="R" gold />
        <Scene preset="phone" />
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(container.querySelector(".avatar-gold")).toHaveTextContent("R");
  });

  it("reports meter progress", () => {
    render(<Meter value={0.8} label="registered" />);
    expect(screen.getByRole("meter", { name: "registered" })).toHaveAttribute("aria-valuenow", "80");
  });

  it("keeps LTR runs in order", () => {
    const { container } = render(<Ltr>054-•••-2219</Ltr>);
    expect(container.querySelector("bdi")).toHaveAttribute("dir", "ltr");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/ui/display.test.tsx`
Expected: FAIL with `Failed to resolve import "./Avatar"`.

- [ ] **Step 3: Write the icons**

`dashboard/src/ui/icons.ts`:

```ts
export type IconShape = string | { cx: number; cy: number; r: number };

/** 24×24 stroke icons from the approved canvas. "forward" and "back" are already mirrored for RTL. */
export const ICONS = {
  home: ["M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"],
  leads: [{ cx: 9, cy: 8, r: 3.5 }, "M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6"],
  customers: [
    "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z",
    { cx: 9, cy: 11, r: 2 },
    "M6 16a3 3 0 0 1 6 0M14 10h4M14 14h3",
  ],
  groups: [
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  ],
  greetings: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"],
  chat: ["M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"],
  import: ["M12 3v12M7 10l5 5 5-5M5 21h14"],
  history: ["M20.5 12a8.5 8.5 0 1 1-2.5-6", "M20.5 4.5V9H16", "M12 8v4.5l3 1.5"],
  users: [{ cx: 9, cy: 8, r: 3.2 }, "M3.5 19a5.5 5.5 0 0 1 11 0", { cx: 17, cy: 9, r: 2.6 }, "M16 14.2a4.6 4.6 0 0 1 5 4.8"],
  settings: ["M4 7h9M17 7h3M4 17h3M11 17h9", { cx: 15, cy: 7, r: 2 }, { cx: 9, cy: 17, r: 2 }],
  search: [{ cx: 11, cy: 11, r: 6.5 }, "m16 16 4 4"],
  bell: ["M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z", "M10 20a2 2 0 0 0 4 0"],
  forward: ["M14 6l-6 6 6 6"],
  back: ["M5 12h14M13 6l6 6-6 6"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  plus: ["M12 5v14M5 12h14"],
  at: [{ cx: 12, cy: 12, r: 3.5 }, "M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"],
  key: [{ cx: 8, cy: 15, r: 4 }, "m11 12 8-8M16 7l2 2M14 9l2 2"],
  lock: ["M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18v-5a2.5 2.5 0 0 1 2.5-2.5z", "M8 10.5V8a4 4 0 0 1 8 0v2.5"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "m13.5 6.5 4 4"],
  phone: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  shield: ["M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z", "m9 12 2 2 4-4"],
  signOut: ["M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h11"],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;
```

`dashboard/src/ui/Icon.tsx`:

```tsx
import { ICONS, type IconName, type IconShape } from "./icons";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** Decorative stroke icon. The control around it carries the accessible name. */
export function Icon({ name, size = 20, className }: IconProps) {
  const shapes = ICONS[name] as readonly IconShape[];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes.map((shape) =>
        typeof shape === "string" ? (
          <path key={shape} d={shape} />
        ) : (
          <circle key={`${shape.cx},${shape.cy}`} cx={shape.cx} cy={shape.cy} r={shape.r} />
        ),
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Write the surfaces and the scene**

`dashboard/src/ui/Surface.tsx`:

```tsx
import { motion, type HTMLMotionProps } from "motion/react";
import { cx } from "../lib/cx";
import { cardVariants } from "../motion/variants";

export type SurfaceVariant = "glass" | "card" | "ink";

const VARIANT_CLASS: Record<SurfaceVariant, string> = {
  glass: "surface-glass",
  card: "surface-card",
  ink: "surface-ink",
};

interface SurfaceProps extends HTMLMotionProps<"section"> {
  variant: SurfaceVariant;
  /** Phone density: smaller radius and padding. */
  compact?: boolean;
  as?: "section" | "div";
}

/** One of the three surfaces. Inside an animating screen it settles in with the other cards. */
export function Surface({ variant, compact = false, as = "section", className, ...rest }: SurfaceProps) {
  const Tag = (as === "div" ? motion.div : motion.section) as typeof motion.section;
  return (
    <Tag
      variants={cardVariants}
      className={cx(VARIANT_CLASS[variant], compact ? "rounded-card-phone p-[18px]" : "rounded-card px-[26px] py-6", className)}
      {...rest}
    />
  );
}
```

`dashboard/src/ui/Scene.tsx`:

```tsx
import type { CSSProperties } from "react";
import { cx } from "../lib/cx";

type PieceKind = "glow" | "dome" | "pearl" | "pebble";

interface Piece {
  kind: PieceKind;
  width: number;
  height?: number;
  at: CSSProperties;
}

const KIND_CLASS: Record<PieceKind, string> = {
  glow: "scene-glow",
  dome: "scene-dome",
  pearl: "scene-pearl",
  pebble: "scene-pebble",
};

// Positions copy the approved canvas. Inline start is the right edge in RTL.
const PRESETS = {
  app: [
    { kind: "glow", width: 680, at: { insetInlineStart: -240, top: -320 } },
    { kind: "dome", width: 560, at: { insetInlineEnd: -170, top: -250 } },
    { kind: "pearl", width: 300, at: { insetInlineStart: -110, bottom: -130 } },
    { kind: "pebble", width: 170, height: 130, at: { insetInlineEnd: -50, bottom: -50 } },
  ],
  phone: [
    { kind: "glow", width: 460, at: { insetInlineStart: -210, top: -230 } },
    { kind: "dome", width: 330, at: { insetInlineEnd: -150, top: -110 } },
    { kind: "pearl", width: 230, at: { insetInlineEnd: -70, bottom: -50 } },
  ],
  login: [
    { kind: "glow", width: 980, at: { insetInlineEnd: 160, top: -220 } },
    { kind: "dome", width: 660, at: { insetInlineEnd: 390, top: -210 } },
    { kind: "pearl", width: 440, at: { insetInlineEnd: -130, bottom: -170 } },
    { kind: "glow", width: 420, height: 200, at: { insetInlineStart: 280, bottom: -90 } },
    { kind: "pearl", width: 210, at: { insetInlineStart: 380, bottom: -60 } },
    { kind: "pebble", width: 240, height: 160, at: { insetInlineEnd: 290, bottom: -50 } },
    { kind: "pebble", width: 170, height: 120, at: { insetInlineStart: 120, bottom: 30 } },
    { kind: "pebble", width: 90, height: 66, at: { insetInlineStart: 40, bottom: 180 } },
  ],
} satisfies Record<string, Piece[]>;

export type ScenePreset = keyof typeof PRESETS;

/** The sculpted background behind the glass: gold glow, glass dome, pearls and pebbles. */
export function Scene({ preset }: { preset: ScenePreset }) {
  const pieces: Piece[] = PRESETS[preset];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={cx("absolute block", KIND_CLASS[piece.kind])}
          style={{ width: piece.width, height: piece.height ?? piece.width, ...piece.at }}
        />
      ))}
    </div>
  );
}
```

`dashboard/src/ui/OrbCard.tsx`:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { cardVariants } from "../motion/variants";

interface OrbCardProps {
  label: string;
  /** Content of the frosted strip (the date, the countdown...). */
  strip: ReactNode;
  /** Content of the white side: a short line at the top, an action at the bottom. */
  side?: ReactNode;
  /** Orb size and position in px: distance from the inline end, and from the top. */
  orb?: { size: number; end: number; top: number };
  /** Width of the frosted strip as a share of the card. */
  stripBasis?: string;
  compact?: boolean;
  className?: string;
}

/** White card with the gold orb half behind a frosted strip, like the reference. */
export function OrbCard({
  label,
  strip,
  side,
  orb = { size: 220, end: 70, top: 72 },
  stripBasis = "55%",
  compact = false,
  className,
}: OrbCardProps) {
  return (
    <motion.section
      aria-label={label}
      variants={cardVariants}
      className={cx("surface-card relative flex overflow-hidden", compact ? "rounded-card-phone p-2.5" : "rounded-card p-3", className)}
    >
      <span aria-hidden="true" className="orb absolute" style={{ width: orb.size, height: orb.size, insetInlineEnd: orb.end, top: orb.top }} />
      <div
        className={cx("frost relative flex shrink-0 flex-col gap-1.5", compact ? "rounded-[19px] p-[18px]" : "rounded-inner p-[22px]")}
        style={{ flexBasis: stripBasis }}
      >
        {strip}
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col items-end justify-between gap-3 p-2.5 text-end">{side}</div>
    </motion.section>
  );
}
```

- [ ] **Step 5: Write the text, status and small pieces**

`dashboard/src/ui/Headline.tsx`:

```tsx
import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { cardVariants } from "../motion/variants";

type HeadlineSize = "display" | "display-2" | "display-3";

const SIZE_CLASS: Record<HeadlineSize, string> = {
  display: "text-display",
  "display-2": "text-display-2",
  "display-3": "text-display-3",
};

interface HeadlineProps {
  title: string;
  /** Second line, in the soft tone. */
  soft?: string;
  size?: HeadlineSize;
  level?: 1 | 2;
  onDark?: boolean;
  className?: string;
}

/** Big light two-tone headline: a dark first line and a soft second line. */
export function Headline({ title, soft, size = "display", level = 1, onDark = false, className }: HeadlineProps) {
  const Tag = level === 1 ? motion.h1 : motion.h2;
  return (
    <Tag variants={cardVariants} className={cx(SIZE_CLASS[size], "font-light", onDark ? "text-cream" : "text-ink", className)}>
      {title}{" "}
      {soft ? (
        <>
          <br />
          <span className={onDark ? "text-ink-soft" : "text-faint"}>{soft}</span>
        </>
      ) : null}
    </Tag>
  );
}
```

`dashboard/src/ui/StatusTag.tsx`:

```tsx
import type { ReactNode } from "react";
import { cx } from "../lib/cx";

export type StatusTone = "new" | "talking" | "sent" | "registered" | "irrelevant" | "warning" | "neutral";

const DOT: Record<StatusTone, string> = {
  new: "bg-status-new",
  talking: "bg-status-talking",
  sent: "bg-status-sent",
  registered: "bg-status-registered",
  irrelevant: "bg-status-irrelevant",
  warning: "bg-status-warning",
  neutral: "bg-faint",
};

interface StatusTagProps {
  tone?: StatusTone;
  onDark?: boolean;
  children: ReactNode;
}

/** Status as a dot plus words, never color alone. */
export function StatusTag({ tone = "neutral", onDark = false, children }: StatusTagProps) {
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-[7px] rounded-full px-3 text-[13px] font-medium whitespace-nowrap ring-1 ring-inset",
        onDark ? "bg-white/7 text-cream ring-white/20" : "bg-white/55 text-copy ring-ink/13",
      )}
    >
      <span aria-hidden="true" data-tone={tone} className={cx("size-[7px] shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}
```

`dashboard/src/ui/Avatar.tsx`:

```tsx
import { cx } from "../lib/cx";

type AvatarSize = "sm" | "md" | "lg";

const SIZE: Record<AvatarSize, string> = {
  sm: "size-[38px] text-[14px] font-semibold",
  md: "size-[46px] text-[18px] font-semibold",
  lg: "size-[76px] text-[30px] font-light",
};

interface AvatarProps {
  initial: string;
  gold?: boolean;
  size?: AvatarSize;
  className?: string;
}

/** An initial in a circle. Decorative: the name is always next to it or on the control around it. */
export function Avatar({ initial, gold = false, size = "sm", className }: AvatarProps) {
  return (
    <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full", SIZE[size], gold ? "avatar-gold" : "bg-sand text-ink", className)}>
      {initial}
    </span>
  );
}
```

`dashboard/src/ui/Ltr.tsx`:

```tsx
import type { ReactNode } from "react";

/** Keeps an LTR run (a phone or passport number) in order inside RTL text. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
```

`dashboard/src/ui/Meter.tsx`:

```tsx
import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

interface MeterProps {
  /** 0 to 1. */
  value: number;
  label: string;
  onDark?: boolean;
  className?: string;
}

/** Thin progress bar that fills from the start side (the right, in RTL). */
export function Meter({ value, label, onDark = false, className }: MeterProps) {
  const share = Math.min(1, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      className={cx("h-1.5 overflow-hidden rounded-full", onDark ? "bg-white/14" : "bg-ink/8", className)}
    >
      <motion.span
        className={cx("block h-full rounded-full", onDark ? "bg-gold" : "bg-ink")}
        style={{ width: `${share * 100}%`, originX: 1 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ ...springs.gentle, delay: 0.3 }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/display.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 7: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add icons, surfaces, orb card, headline and status components" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Controls

**Files:**
- Create: `dashboard/src/ui/MotionLink.ts`, `dashboard/src/ui/CountBadge.tsx`, `dashboard/src/ui/Button.tsx`, `dashboard/src/ui/GooButton.tsx`, `dashboard/src/ui/IconButton.tsx`, `dashboard/src/ui/Field.tsx`, `dashboard/src/ui/ChipGroup.tsx`, `dashboard/src/ui/Segmented.tsx`, `dashboard/src/ui/Switch.tsx`
- Test: `dashboard/src/ui/controls.test.tsx`

**Interfaces:**
- Consumes:
  - `Icon` and `IconName` (Task 5).
  - `springs` and `PRESS_SCALE` (Task 4).
  - `formatNumber` and `cx` (Task 3).
  - `renderInRouter` (Task 4).
- Produces:
  - **`MotionLink`:** `motion.create(Link)`.
  - **`<CountBadge count />`:** the small dark count on the corner of an icon control. It is hidden from screen readers, so the control's label must include the count.
  - **Buttons:**
    - `type ButtonVariant = "solid" | "outline" | "white"`.
    - `<Button variant? size?="md"|"sm" icon? onDark? to? onClick? type? disabled? className?>`, which renders a link when `to` is set.
    - `<GooButton to? onClick? type? tone?="dark"|"light" size? icon?="forward" disabled? className?>`.
    - `<IconButton icon label to? onClick? badge? tone?="glass"|"ink"|"paper" size? className? />`. `label` is the accessible name and must include any count the badge shows.
  - **Inputs:**
    - `<Field label icon name type? placeholder? autoComplete? required? value? defaultValue? onChange?(value) trailing? size? onPaper? className? />`.
    - `<Switch checked onChange label onDark? />`.
  - **Selection:**
    - `interface ChipOption<T>` and `<ChipGroup id label options value onChange onPaper? className? />`.
    - `interface SegmentOption<T>` and `<Segmented id label options value onChange? className? />`. With `to` on every option, it renders a `<nav>` of links using `aria-current`.

- [ ] **Step 1: Write the failing test**

`dashboard/src/ui/controls.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderInRouter } from "../test/router";
import { Button } from "./Button";
import { ChipGroup } from "./ChipGroup";
import { Field } from "./Field";
import { GooButton } from "./GooButton";
import { IconButton } from "./IconButton";
import { Segmented } from "./Segmented";
import { Switch } from "./Switch";

function SwitchHarness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} onChange={setOn} label="auto send" />;
}

describe("controls", () => {
  it("toggles a switch", async () => {
    render(<SwitchHarness />);
    const toggle = screen.getByRole("switch", { name: "auto send" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("selects one chip at a time", async () => {
    const onChange = vi.fn();
    render(
      <ChipGroup
        id="status"
        label="status"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "All", count: 24 },
          { value: "new", label: "New", count: 6 },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "All 24" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "New 6" }));
    expect(onChange).toHaveBeenCalledWith("new");
  });

  it("labels a field and reports typing", async () => {
    const onChange = vi.fn();
    render(<Field label="Email" icon="at" name="email" type="email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    expect(onChange).toHaveBeenLastCalledWith("a@b.co");
  });

  it("names icon-only buttons and links", async () => {
    renderInRouter(
      <>
        <IconButton icon="bell" label="Notifications, 2 new" badge={2} />
        <IconButton icon="import" label="Import" to="/import" />
      </>,
    );
    expect(await screen.findByRole("button", { name: "Notifications, 2 new" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
  });

  it("renders buttons as links when they have a destination", async () => {
    renderInRouter(
      <>
        <Button to="/leads">All leads</Button>
        <GooButton to="/login">Sign in</GooButton>
      </>,
    );
    expect(await screen.findByRole("link", { name: "All leads" })).toHaveAttribute("href", "/leads");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("marks the current segment in navigation", async () => {
    renderInRouter(
      <Segmented
        id="greetings"
        label="Greetings"
        value="holidays"
        options={[
          { value: "holidays", label: "Holidays", to: "/greetings/holidays" },
          { value: "birthdays", label: "Birthdays", to: "/greetings/birthdays" },
        ]}
      />,
    );
    expect(await screen.findByRole("navigation", { name: "Greetings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Holidays" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Birthdays" })).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/ui/controls.test.tsx`
Expected: FAIL with `Failed to resolve import "./Button"`.

- [ ] **Step 3: Write the link helper and the buttons**

`dashboard/src/ui/MotionLink.ts`:

```ts
import { motion } from "motion/react";
import { Link } from "react-router";

/** A React Router link that takes Motion props (press feedback, layout). */
export const MotionLink = motion.create(Link);
```

`dashboard/src/ui/CountBadge.tsx`:

```tsx
/** Small dark count on the corner of an icon control. The control's label must include the count. */
export function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -end-[3px] -top-[3px] grid h-5 min-w-5 place-items-center rounded-full border-2 border-cream bg-ink px-[5px] text-[11.5px] leading-none font-semibold text-cream"
    >
      {count}
    </span>
  );
}
```

`dashboard/src/ui/Button.tsx`:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

export type ButtonVariant = "solid" | "outline" | "white";

interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: IconName;
  /** Use on black cards. */
  onDark?: boolean;
  to?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}

const SIZE = { md: "h-[46px] px-[22px] text-[15px]", sm: "h-[38px] px-4 text-[14px]" } as const;

const ON_LIGHT: Record<ButtonVariant, string> = {
  solid: "bg-ink text-cream hover:bg-black",
  outline: "text-ink ring-1 ring-inset ring-ink/28 hover:bg-white/65",
  white: "bg-paper text-ink shadow-button",
};

const ON_DARK: Record<ButtonVariant, string> = {
  solid: "bg-cream text-ink hover:bg-white",
  outline: "text-cream ring-1 ring-inset ring-white/30 hover:bg-white/8",
  white: "bg-paper text-ink",
};

/** Pill button. Renders a link when it has a destination. */
export function Button({ children, variant = "solid", size = "md", icon, onDark = false, to, onClick, type = "button", disabled, className }: ButtonProps) {
  const classes = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium leading-none whitespace-nowrap transition-colors disabled:opacity-50",
    SIZE[size],
    (onDark ? ON_DARK : ON_LIGHT)[variant],
    className,
  );
  const content = (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </>
  );
  if (to) {
    return (
      <MotionLink to={to} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
        {content}
      </MotionLink>
    );
  }
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
      {content}
    </motion.button>
  );
}
```

`dashboard/src/ui/GooButton.tsx`:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

interface GooButtonProps {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "dark" | "light";
  size?: "md" | "sm";
  icon?: IconName;
  disabled?: boolean;
  className?: string;
}

// On hover the circle leans forward. Forward is to the left in RTL.
const circleMotion = { rest: { x: 0 }, hover: { x: -4 } };

/** The primary action: a pill joined to a circle with an arrow, like the reference. */
export function GooButton({ children, to, onClick, type = "button", tone = "dark", size = "md", icon = "forward", disabled, className }: GooButtonProps) {
  const fill = tone === "dark" ? "bg-ink text-cream group-hover:bg-black" : "bg-cream text-ink group-hover:bg-white";
  const content = (
    <>
      <span className={cx("inline-flex items-center rounded-full transition-colors", size === "md" ? "h-[46px] px-[22px]" : "h-[38px] px-4", fill)}>{children}</span>
      <motion.span
        variants={circleMotion}
        transition={springs.ui}
        className={cx("goo-neck grid shrink-0 place-items-center rounded-full transition-colors", size === "md" ? "size-[52px]" : "size-11", fill)}
      >
        <Icon name={icon} size={16} />
      </motion.span>
    </>
  );
  const shared = {
    className: cx("group inline-flex items-center gap-2 font-medium leading-none whitespace-nowrap disabled:opacity-50", size === "md" ? "text-[15px]" : "text-[14px]", className),
    initial: "rest",
    whileHover: "hover",
    whileTap: { scale: PRESS_SCALE },
    transition: springs.ui,
  } as const;
  return to ? (
    <MotionLink to={to} {...shared}>
      {content}
    </MotionLink>
  ) : (
    <motion.button type={type} onClick={onClick} disabled={disabled} {...shared}>
      {content}
    </motion.button>
  );
}
```

`dashboard/src/ui/IconButton.tsx`:

```tsx
import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { PRESS_SCALE, springs } from "../motion/springs";
import { CountBadge } from "./CountBadge";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { MotionLink } from "./MotionLink";

interface IconButtonProps {
  icon: IconName;
  /** Accessible name. Include any count the badge shows. */
  label: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
  tone?: "glass" | "ink" | "paper";
  size?: "md" | "sm";
  className?: string;
}

const TONE = {
  glass: "surface-glass text-ink hover:bg-white",
  ink: "bg-ink text-cream hover:bg-black",
  paper: "bg-sand-light text-ink hover:bg-white",
} as const;

/** Round icon-only control. */
export function IconButton({ icon, label, to, onClick, badge, tone = "glass", size = "md", className }: IconButtonProps) {
  const classes = cx("relative grid shrink-0 place-items-center rounded-full transition-colors", size === "md" ? "size-12" : "size-10", TONE[tone], className);
  const content = (
    <>
      <Icon name={icon} />
      {badge ? <CountBadge count={badge} /> : null}
    </>
  );
  return to ? (
    <MotionLink to={to} aria-label={label} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
      {content}
    </MotionLink>
  ) : (
    <motion.button type="button" aria-label={label} onClick={onClick} className={classes} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui}>
      {content}
    </motion.button>
  );
}
```

- [ ] **Step 4: Write the field, chips, segmented control and switch**

`dashboard/src/ui/Field.tsx`:

```tsx
import { useId, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

interface FieldProps {
  label: string;
  icon: IconName;
  name: string;
  type?: "text" | "email" | "password" | "search";
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Inline action at the end, like the "שכחתי" pill. */
  trailing?: ReactNode;
  size?: "md" | "sm";
  /** Use on white cards instead of glass. */
  onPaper?: boolean;
  className?: string;
}

/** Pill input with a round icon at the start. The label is for screen readers; the placeholder shows it. */
export function Field({ label, icon, name, type = "text", placeholder, autoComplete, required, value, defaultValue, onChange, trailing, size = "md", onPaper = false, className }: FieldProps) {
  const id = useId();
  return (
    <div
      className={cx(
        "flex items-center gap-2.5 rounded-full px-1.5 focus-within:ring-2 focus-within:ring-ink",
        size === "md" ? "h-[54px]" : "h-12",
        onPaper ? "bg-sand-light" : "bg-white/45 ring-1 ring-inset ring-white/80",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full text-ink", size === "md" ? "size-[42px]" : "size-9", onPaper ? "bg-paper" : "bg-white/75")}>
        <Icon name={icon} size={16} />
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder ?? label}
        autoComplete={autoComplete}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none placeholder:text-mute"
      />
      {trailing}
    </div>
  );
}
```

`dashboard/src/ui/ChipGroup.tsx`:

```tsx
import { LayoutGroup, motion } from "motion/react";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { PRESS_SCALE, springs } from "../motion/springs";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface ChipGroupProps<T extends string> {
  /** Unique per group on a screen, so the highlight glides only inside this group. */
  id: string;
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onPaper?: boolean;
  className?: string;
}

/** Single-choice filter chips. The dark highlight glides to the chosen chip. */
export function ChipGroup<T extends string>({ id, label, options, value, onChange, onPaper = false, className }: ChipGroupProps<T>) {
  return (
    <LayoutGroup id={id}>
      <div role="group" aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <motion.button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              whileTap={{ scale: PRESS_SCALE }}
              transition={springs.ui}
              className={cx(
                "relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium whitespace-nowrap",
                selected ? "text-cream" : cx("text-copy", onPaper ? "bg-sand-light" : "bg-white/55 ring-1 ring-inset ring-white/85 hover:bg-white"),
              )}
            >
              {selected ? <motion.span layoutId="chip-highlight" transition={springs.ui} className="absolute inset-0 rounded-full bg-ink" /> : null}
              <span className="relative">{option.label}</span>
              {option.count === undefined ? null : (
                <>
                  {" "}
                  <span className={cx("relative font-normal", selected ? "text-ink-mute" : "text-mute")}>{formatNumber(option.count)}</span>
                </>
              )}
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
```

`dashboard/src/ui/Segmented.tsx`:

```tsx
import { LayoutGroup, motion } from "motion/react";
import { Link } from "react-router";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** With a destination on every option, the control is navigation. */
  to?: string;
}

interface SegmentedProps<T extends string> {
  id: string;
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  className?: string;
}

/** iOS-style segmented control: a white pill glides over a soft track. */
export function Segmented<T extends string>({ id, label, options, value, onChange, className }: SegmentedProps<T>) {
  const isNavigation = options.every((option) => option.to);
  const trackClass = cx("inline-flex gap-0.5 rounded-full bg-ink/7 p-1", className);
  const items = options.map((option) => {
    const selected = option.value === value;
    const itemClass = cx(
      "relative inline-flex h-[38px] flex-1 items-center justify-center rounded-full px-4 text-[14px] font-medium whitespace-nowrap",
      selected ? "text-ink" : "text-copy",
    );
    const inner = (
      <>
        {selected ? <motion.span layoutId="segment-highlight" transition={springs.ui} className="absolute inset-0 rounded-full bg-paper shadow-button" /> : null}
        <span className="relative">{option.label}</span>
      </>
    );
    return option.to ? (
      <Link key={option.value} to={option.to} aria-current={selected ? "page" : undefined} className={itemClass}>
        {inner}
      </Link>
    ) : (
      <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange?.(option.value)} className={itemClass}>
        {inner}
      </button>
    );
  });
  return (
    <LayoutGroup id={id}>
      {isNavigation ? (
        <nav aria-label={label} className={trackClass}>
          {items}
        </nav>
      ) : (
        <div role="group" aria-label={label} className={trackClass}>
          {items}
        </div>
      )}
    </LayoutGroup>
  );
}
```

`dashboard/src/ui/Switch.tsx`:

```tsx
import { motion } from "motion/react";
import { cx } from "../lib/cx";
import { springs } from "../motion/springs";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onDark?: boolean;
}

/** On/off switch. In RTL the knob rests on the right and slides left when on. */
export function Switch({ checked, onChange, label, onDark = false }: SwitchProps) {
  const track = checked ? (onDark ? "bg-gold" : "bg-ink") : onDark ? "bg-white/20" : "bg-ink/16";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-8 w-[52px] shrink-0 rounded-full transition-colors", track)}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? -20 : 0 }}
        transition={springs.ui}
        className="absolute start-[3px] top-[3px] size-[26px] rounded-full bg-paper shadow-knob"
      />
    </button>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/controls.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add buttons, the joined goo button, fields, chips, segmented control and switch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Loading, empty and error states

**Files:**
- Create: `dashboard/src/content/states.he.ts`, `dashboard/src/ui/states.tsx`
- Test: `dashboard/src/ui/states.test.tsx`

**Interfaces:**
- Consumes:
  - `Button` (Task 6).
  - `cx` (Task 3).
- Produces:
  - `states` copy: `{ loading, error, retry }`.
  - `<Skeleton onDark? className? />`.
  - `<LoadingBlock lines?=3 onDark? className? />`, which renders `role="status"` and `aria-busy`.
  - `<EmptyState message action? onDark? />`.
  - `<ErrorState message? onRetry onDark? />`, which renders `role="alert"` and a retry button.

- [ ] **Step 1: Write the failing test**

`dashboard/src/ui/states.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingBlock } from "./states";

describe("states", () => {
  it("announces loading", () => {
    render(<LoadingBlock lines={2} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("טוען…");
  });

  it("offers the next step when there is nothing to show", () => {
    render(<EmptyState message="No leads" action={<button type="button">Clear filters</button>} />);
    expect(screen.getByText("No leads")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("retries from an error inside the card", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("משהו השתבש בטעינה.");
    await userEvent.click(screen.getByRole("button", { name: "לנסות שוב" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/ui/states.test.tsx`
Expected: FAIL with `Failed to resolve import "./states"`.

- [ ] **Step 3: Write the copy and the components**

`dashboard/src/content/states.he.ts`:

```ts
export const states = {
  loading: "טוען…",
  error: "משהו השתבש בטעינה.",
  retry: "לנסות שוב",
} as const;
```

`dashboard/src/ui/states.tsx`:

```tsx
import type { ReactNode } from "react";
import { states } from "../content/states.he";
import { cx } from "../lib/cx";
import { Button } from "./Button";

/** Soft placeholder block, shaped like the content that is loading. No pulse under Reduce Motion. */
export function Skeleton({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return <span aria-hidden="true" className={cx("block animate-pulse rounded-inner motion-reduce:animate-none", onDark ? "bg-white/10" : "bg-ink/6", className)} />;
}

/** Loading region: tells screen readers it is loading, and shows skeleton lines. */
export function LoadingBlock({ lines = 3, onDark = false, className }: { lines?: number; onDark?: boolean; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cx("flex flex-col gap-3", className)}>
      <span className="sr-only">{states.loading}</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} onDark={onDark} className={index === 0 ? "h-8 w-1/2" : "h-5 w-full"} />
      ))}
    </div>
  );
}

/** Nothing to show: one line and the next step. */
export function EmptyState({ message, action, onDark = false }: { message: string; action?: ReactNode; onDark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className={cx("text-small", onDark ? "text-ink-mute" : "text-mute")}>{message}</p>
      {action}
    </div>
  );
}

/** Something failed: say so inside the card and offer a retry. Never a blocking alert. */
export function ErrorState({ message = states.error, onRetry, onDark = false }: { message?: string; onRetry: () => void; onDark?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
      <p className={cx("text-small", onDark ? "text-ink-mute" : "text-mute")}>{message}</p>
      <Button variant="outline" size="sm" onDark={onDark} onClick={onRetry}>
        {states.retry}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/states.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add loading, empty and error states" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Data model and seeded demo data

**Files:**
- Create: `dashboard/src/data/types.ts`, `dashboard/src/data/rules.ts`, `dashboard/src/data/mock/rng.ts`, `dashboard/src/data/mock/names.ts`, `dashboard/src/data/mock/fixtures.ts`, `dashboard/src/data/mock/generate.ts`
- Test: `dashboard/src/data/mock/rng.test.ts`, `dashboard/src/data/mock/generate.test.ts`

**Interfaces:**
- Consumes: `addDays`, `dayAt`, `daysBetween`, `isoDay`, `today` and `weekStart` (Task 3).
- Produces:
  - **Domain types (`types.ts`):**
    - `Role`, `LeadStatus` (`"new" | "talking" | "details-sent" | "registered" | "not-relevant"`), `LeadSource`.
    - `StaffUser { id, name, initial, role, passportAccess }`.
    - `Session { userId, signedInAt }`.
    - `LeadEvent`, `Lead` (with `archived` and `history`, newest first).
    - `Passport`, `Note`, `Customer`.
    - `IntakeResult`, `PassportIntake`.
    - `Group`, and `GroupSummary` (adds `registered` and `passportsReceived`).
    - `ActivityKind`, `Activity`, `WeeklyCount`, `OverviewStats`.
    - `Database { users, leads, customers, intakes, groups, activity }`.
  - **Rules (`rules.ts`):**
    - `EXPIRING_WITHIN_DAYS = 183`.
    - `isOpenLead(lead: Lead): boolean`.
  - **Generator (`generate.ts`):**
    - `TARGETS`, the totals from the design.
    - `createDatabase(options?: { seed?: number; today?: Date }): Database`. It is deterministic, with the default seed 5787 and the default day `today()`.
  - **RNG (`rng.ts`):** `createRng(seed: number): Rng`, with `next`, `int`, `pick` and `chance`.
  - **Fixture ids used by later tasks:**
    - Leads: `l-yael-peretz`, `l-noa-biton`.
    - Customers: `c-sara-cohen`, `c-lea-berger`.
    - Groups: `g-poland-nov`, `g-challah-jlm`, `g-uman-tubav`, `g-uman-rh`.
    - Users: `u-ronit`, `u-shira`, `u-moran`.

- [ ] **Step 1: Write the failing tests**

`dashboard/src/data/mock/rng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("stays inside integer bounds", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 5);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it("refuses to pick from an empty list", () => {
    expect(() => createRng(1).pick([])).toThrow("empty");
  });
});
```

`dashboard/src/data/mock/generate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayAt, daysBetween, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import { TARGETS, createDatabase } from "./generate";

const day = dayAt("2026-10-28");
const db = createDatabase({ seed: 5787, today: day });

describe("createDatabase", () => {
  it("is identical for the same seed", () => {
    expect(createDatabase({ seed: 5787, today: day })).toEqual(db);
  });

  it("keeps the hand-written records from the design first", () => {
    expect(db.leads[0].name).toBe("יעל פרץ");
    expect(db.customers[0].firstName).toBe("שרה");
  });

  it("hits the lead totals from the design", () => {
    expect(db.leads).toHaveLength(TARGETS.totalLeads);
    const open = db.leads.filter(isOpenLead);
    expect(open).toHaveLength(24);
    expect(open.filter((l) => l.status === "new")).toHaveLength(6);
    expect(open.filter((l) => l.status === "talking")).toHaveLength(11);
    expect(open.filter((l) => l.status === "details-sent")).toHaveLength(4);
    expect(open.filter((l) => l.status === "registered")).toHaveLength(3);
  });

  it("creates 14 leads this week and none after the demo moment", () => {
    const start = weekStart(day);
    expect(db.leads.filter((l) => daysBetween(start, new Date(l.createdAt)) >= 0)).toHaveLength(14);
    const demoNow = dayAt("2026-10-28", "15:30").getTime();
    expect(db.leads.every((l) => new Date(l.createdAt).getTime() <= demoNow)).toBe(true);
  });

  it("hits the customer and passport totals", () => {
    expect(db.customers).toHaveLength(TARGETS.customers);
    expect(db.customers.filter((c) => c.passport === null)).toHaveLength(23);
    const expiring = db.customers.filter((c) => c.passport !== null && daysBetween(day, new Date(c.passport.expiryDate)) <= EXPIRING_WITHIN_DAYS);
    expect(expiring).toHaveLength(5);
  });

  it("fills every group to its registrations", () => {
    const members = (groupId: string) => db.customers.filter((c) => c.groupIds.includes(groupId));
    expect(members("g-poland-nov")).toHaveLength(32);
    expect(members("g-challah-jlm")).toHaveLength(46);
    expect(members("g-uman-tubav")).toHaveLength(12);
    expect(members("g-uman-rh")).toHaveLength(8);
    expect(members("g-poland-nov").filter((c) => c.passport !== null)).toHaveLength(29);
  });

  it("uses unique ids", () => {
    const ids = [...db.leads.map((l) => l.id), ...db.customers.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/data`
Expected: FAIL with `Failed to resolve import "./rng"` and `Failed to resolve import "../../lib/clock"` or `"../rules"`.

- [ ] **Step 3: Write the types and rules**

`dashboard/src/data/types.ts`:

```ts
export type Role = "admin" | "office" | "sales";
export type LeadStatus = "new" | "talking" | "details-sent" | "registered" | "not-relevant";
export type LeadSource = "landing-page" | "instagram" | "facebook" | "whatsapp" | "referral";

export interface StaffUser {
  id: string;
  name: string;
  initial: string;
  role: Role;
  passportAccess: boolean;
}

export interface Session {
  userId: string;
  signedInAt: string;
}

export interface LeadEvent {
  id: string;
  at: string;
  text: string;
  byUserId: string | null;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  groupId: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  /** Leads from past trips are archived and never show in the pipeline. */
  archived: boolean;
  /** Newest first. */
  history: LeadEvent[];
}

export interface Passport {
  number: string;
  birthDate: string;
  issueDate: string;
  expiryDate: string;
  nationality: string;
  receivedVia: "whatsapp" | "monday" | "manual";
  receivedAt: string;
  photoAvailable: boolean;
}

export interface Note {
  id: string;
  at: string;
  text: string;
  byUserId: string;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsappConnected: boolean;
  groupIds: string[];
  source: LeadSource;
  assigneeId: string | null;
  since: string;
  updatedAt: string;
  passport: Passport | null;
  notes: Note[];
}

export type IntakeResult = "matched" | "new-card" | "needs-review";

export interface PassportIntake {
  id: string;
  name: string;
  phone: string;
  receivedAt: string;
  result: IntakeResult;
  reason: string;
  customerId: string | null;
}

export interface Group {
  id: string;
  name: string;
  type: "flight" | "event";
  womenOnly: boolean;
  capacity: number;
  startsOn: string;
  endsOn: string | null;
  /** Shown instead of exact dates while they are not fixed. */
  dateLabel: string | null;
}

export interface GroupSummary extends Group {
  registered: number;
  passportsReceived: number;
}

export type ActivityKind = "passport" | "lead" | "greeting" | "birthday" | "import";

export interface Activity {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
}

export interface WeeklyCount {
  weekStart: string;
  count: number;
}

export interface OverviewStats {
  openLeads: number;
  customers: number;
  activeGroups: number;
  newLeadsThisWeek: number;
  newLeadsLastWeek: number;
  thisWeekByStatus: { new: number; talking: number; registered: number };
  /** Oldest first, ending with this week. */
  weeklyLeads: WeeklyCount[];
}

export interface Database {
  users: StaffUser[];
  leads: Lead[];
  customers: Customer[];
  intakes: PassportIntake[];
  groups: Group[];
  activity: Activity[];
}
```

`dashboard/src/data/rules.ts`:

```ts
import type { Lead } from "./types";

/** Passports that expire within this many days (about six months) are flagged. */
export const EXPIRING_WITHIN_DAYS = 183;

/** The pipeline: leads that are not archived and not marked irrelevant. */
export function isOpenLead(lead: Lead): boolean {
  return !lead.archived && lead.status !== "not-relevant";
}
```

- [ ] **Step 4: Write the random generator and the name pools**

`dashboard/src/data/mock/rng.ts`:

```ts
export interface Rng {
  /** A number in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

/** Deterministic random numbers (mulberry32), so the demo data is the same on every load. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("Cannot pick from an empty list");
      return items[Math.floor(next() * items.length)];
    },
    chance: (probability) => next() < probability,
  };
}
```

`dashboard/src/data/mock/names.ts`:

```ts
// Name pools for generated customers and leads. Most of Ronit's customers are women.
export const FIRST_NAMES = [
  "אביגיל", "אורית", "אילנה", "אסנת", "אסתר", "בתיה", "גאולה", "גילה", "דבורה", "דליה",
  "הדסה", "הילה", "ורד", "זהבה", "חגית", "חוה", "חנה", "טובה", "יהודית", "יעל",
  "יפה", "כרמית", "לאה", "לימור", "מיכל", "מירב", "מלכה", "מרים", "נאוה", "נחמה",
  "נעמה", "סיגל", "עדי", "עדינה", "פנינה", "ציפורה", "רבקה", "רות", "רחל", "רינה",
  "שולמית", "שושנה", "שירה", "שרה", "שרית", "תהילה", "תמר",
] as const;

export const LAST_NAMES = [
  "אוחיון", "אזולאי", "אלון", "אברהם", "אשכנזי", "ביטון", "בן חיים", "ברגר", "ברק", "גבאי",
  "גולדברג", "דהן", "דוד", "הורוביץ", "וקנין", "זילברמן", "חדד", "חזן", "טל", "יוסף",
  "כהן", "כץ", "לוי", "לנדאו", "מזרחי", "מלכה", "נגר", "סעדה", "עמר", "פרידמן",
  "פרץ", "צור", "קליין", "רבינוביץ", "רוזן", "שושן", "שטרן", "שמואלי", "שפירא", "תורג׳מן",
] as const;
```

- [ ] **Step 5: Write the hand-written records from the design**

`dashboard/src/data/mock/fixtures.ts`:

```ts
import type { Activity, Customer, Group, Lead, LeadEvent, Passport, PassportIntake, StaffUser } from "../types";

// Every record here appears on the approved canvas. Times are UTC; Israel is UTC+2 on 2026-10-28.

export const USERS: StaffUser[] = [
  { id: "u-ronit", name: "רונית ברש", initial: "ר", role: "admin", passportAccess: true },
  { id: "u-shira", name: "שירה", initial: "ש", role: "office", passportAccess: true },
  { id: "u-moran", name: "מורן", initial: "מ", role: "sales", passportAccess: false },
];

export const GROUPS: Group[] = [
  { id: "g-poland-nov", name: "פולין · נובמבר", type: "flight", womenOnly: false, capacity: 40, startsOn: "2026-11-18", endsOn: "2026-11-22", dateLabel: null },
  { id: "g-challah-jlm", name: "ערב הפרשת חלה · ירושלים", type: "event", womenOnly: false, capacity: 60, startsOn: "2026-12-03", endsOn: null, dateLabel: null },
  { id: "g-uman-tubav", name: "אומן · ט״ו באב תשפ״ז", type: "flight", womenOnly: true, capacity: 45, startsOn: "2027-08-16", endsOn: null, dateLabel: "אוגוסט 2027" },
  { id: "g-uman-rh", name: "אומן · ראש השנה תשפ״ח", type: "flight", womenOnly: false, capacity: 50, startsOn: "2027-09-30", endsOn: null, dateLabel: "ספטמבר 2027" },
];

/** Registered participants per group, as on the design (98 in total). */
export const GROUP_REGISTRATIONS: Record<string, number> = {
  "g-poland-nov": 32,
  "g-challah-jlm": 46,
  "g-uman-tubav": 12,
  "g-uman-rh": 8,
};

const IMPORTED = "יובא מ-Monday.com";

function event(id: string, at: string, text: string, byUserId: string | null): LeadEvent {
  return { id, at, text, byUserId };
}

function lead(fields: Omit<Lead, "archived" | "history">, history?: LeadEvent[]): Lead {
  return {
    ...fields,
    archived: false,
    history: history ?? [event(`${fields.id}-e1`, fields.updatedAt, fields.lastNote, fields.assigneeId)],
  };
}

export const LEADS: Lead[] = [
  lead(
    { id: "l-yael-peretz", name: "יעל פרץ", phone: "0542212219", source: "instagram", status: "talking", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-28T12:30:00.000Z", lastNote: "בקשה לפרטים על המלון" },
    [
      event("e-yael-4", "2026-10-28T12:30:00.000Z", "בקשה לפרטים על המלון", "u-moran"),
      event("e-yael-3", "2026-10-14T09:00:00.000Z", "מסלול הטיול נשלח בוואטסאפ", "u-moran"),
      event("e-yael-2", "2026-10-12T08:30:00.000Z", "שיחה ראשונה", "u-ronit"),
      event("e-yael-1", "2026-10-12T08:00:00.000Z", "יובא מ-Monday.com עם 3 עדכונים", null),
    ],
  ),
  lead({ id: "l-noa-biton", name: "נועה ביטון", phone: "0527734410", source: "landing-page", status: "new", groupId: "g-poland-nov", assigneeId: null, createdAt: "2026-10-28T10:30:00.000Z", updatedAt: "2026-10-28T10:30:00.000Z", lastNote: "פרטים מהטופס באתר" }),
  lead(
    { id: "l-hana-goldberg", name: "חנה גולדברג", phone: "0503318832", source: "referral", status: "details-sent", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-09-20T09:00:00.000Z", updatedAt: "2026-10-27T15:00:00.000Z", lastNote: "מסלול הטיול נשלח בוואטסאפ" },
    [event("e-hana-2", "2026-10-27T15:00:00.000Z", "מסלול הטיול נשלח בוואטסאפ", "u-moran"), event("e-hana-1", "2026-09-20T09:00:00.000Z", IMPORTED, null)],
  ),
  lead(
    { id: "l-dvora-stern", name: "דבורה שטרן", phone: "0536401907", source: "facebook", status: "details-sent", groupId: "g-poland-nov", assigneeId: "u-shira", createdAt: "2026-09-10T09:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z", lastNote: "נשלח טופס הרשמה" },
    [event("e-dvora-2", "2026-10-24T08:00:00.000Z", "נשלח טופס הרשמה", "u-shira"), event("e-dvora-1", "2026-09-10T09:00:00.000Z", IMPORTED, null)],
  ),
  lead(
    { id: "l-orit-dahan", name: "אורית דהן", phone: "0587756623", source: "whatsapp", status: "talking", groupId: "g-poland-nov", assigneeId: "u-moran", createdAt: "2026-09-05T10:00:00.000Z", updatedAt: "2026-10-22T07:00:00.000Z", lastNote: "לחזור אחרי החגים" },
    [event("e-orit-2", "2026-10-22T07:00:00.000Z", "לחזור אחרי החגים", "u-moran"), event("e-orit-1", "2026-09-05T10:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-michal-levi", name: "מיכל לוי", phone: "0524487731", source: "landing-page", status: "new", groupId: "g-uman-tubav", assigneeId: null, createdAt: "2026-10-28T10:05:00.000Z", updatedAt: "2026-10-28T10:05:00.000Z", lastNote: "ליד חדש מהאתר" }),
  lead({ id: "l-tamar-azulay", name: "תמר אזולאי", phone: "0546103390", source: "instagram", status: "new", groupId: "g-uman-tubav", assigneeId: null, createdAt: "2026-10-28T08:41:00.000Z", updatedAt: "2026-10-28T08:41:00.000Z", lastNote: "פנייה בהודעה פרטית" }),
  lead({ id: "l-liat-hadad", name: "ליאת חדד", phone: "0508825512", source: "referral", status: "talking", groupId: "g-uman-tubav", assigneeId: "u-shira", createdAt: "2026-10-26T09:00:00.000Z", updatedAt: "2026-10-27T13:00:00.000Z", lastNote: "התעניינות בחדר זוגי" }),
  lead(
    { id: "l-sigal-amar", name: "סיגל עמר", phone: "0523319047", source: "landing-page", status: "not-relevant", groupId: "g-uman-tubav", assigneeId: "u-moran", createdAt: "2026-09-28T09:00:00.000Z", updatedAt: "2026-10-20T08:00:00.000Z", lastNote: "התאריך לא מתאים" },
    [event("e-sigal-2", "2026-10-20T08:00:00.000Z", "התאריך לא מתאים", "u-moran"), event("e-sigal-1", "2026-09-28T09:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-rachel-avraham", name: "רחל אברהם", phone: "0539902874", source: "whatsapp", status: "registered", groupId: "g-challah-jlm", assigneeId: "u-shira", createdAt: "2026-10-25T08:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z", lastNote: "הרשמה לקבוצה של 4" }),
  lead(
    { id: "l-esther-mizrahi", name: "אסתר מזרחי", phone: "0504471166", source: "landing-page", status: "details-sent", groupId: "g-challah-jlm", assigneeId: "u-shira", createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-23T08:00:00.000Z", lastNote: "נשלחו פרטי האירוע" },
    [event("e-esther-2", "2026-10-23T08:00:00.000Z", "נשלחו פרטי האירוע", "u-shira"), event("e-esther-1", "2026-10-01T09:00:00.000Z", IMPORTED, null)],
  ),
  lead({ id: "l-shiran-katz", name: "שירן כץ", phone: "0545587302", source: "facebook", status: "new", groupId: "g-challah-jlm", assigneeId: null, createdAt: "2026-10-28T07:12:00.000Z", updatedAt: "2026-10-28T07:12:00.000Z", lastNote: "פנייה מהקמפיין" }),
];

const IMPORT_RUN_AT = "2026-10-28T06:40:00.000Z";

function passport(number: string, birthDate: string, issueDate: string, expiryDate: string, receivedVia: Passport["receivedVia"], receivedAt: string): Passport {
  return { number, birthDate, issueDate, expiryDate, nationality: "ישראלית", receivedVia, receivedAt, photoAvailable: true };
}

export const CUSTOMERS: Customer[] = [
  {
    id: "c-sara-cohen", firstName: "שרה", lastName: "כהן", phone: "0526120418", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-moran",
    since: "2023-04-02T09:00:00.000Z", updatedAt: "2026-10-28T12:32:00.000Z",
    passport: passport("38412921", "1979-03-14", "2021-05-02", "2031-05-01", "whatsapp", "2026-10-28T12:32:00.000Z"),
    notes: [
      { id: "n-sara-2", at: "2026-10-20T08:00:00.000Z", text: "בקשה לחדר קרוב למעלית", byUserId: "u-moran" },
      { id: "n-sara-1", at: "2026-10-02T08:00:00.000Z", text: "כשרות מהדרין בכל הארוחות", byUserId: "u-ronit" },
    ],
  },
  {
    id: "c-lea-berger", firstName: "לאה", lastName: "ברגר", phone: "0549981120", whatsappConnected: true, groupIds: [], source: "whatsapp", assigneeId: null,
    since: "2026-10-28T09:20:00.000Z", updatedAt: "2026-10-28T09:20:00.000Z",
    passport: passport("40955318", "1985-06-21", "2022-03-10", "2032-03-09", "whatsapp", "2026-10-28T09:20:00.000Z"), notes: [],
  },
  {
    id: "c-rina-malka", firstName: "רינה", lastName: "מלכה", phone: "0547716045", whatsappConnected: true, groupIds: ["g-uman-rh"], source: "referral", assigneeId: "u-shira",
    since: "2021-09-14T09:00:00.000Z", updatedAt: "2026-10-26T10:00:00.000Z",
    passport: passport("40118233", "1981-10-28", "2022-12-13", "2032-12-12", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-michal-levi", firstName: "מיכל", lastName: "לוי", phone: "0524487731", whatsappConnected: true, groupIds: ["g-uman-tubav"], source: "landing-page", assigneeId: null,
    since: "2026-10-28T10:05:00.000Z", updatedAt: "2026-10-28T10:05:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-rachel-avraham", firstName: "רחל", lastName: "אברהם", phone: "0539902874", whatsappConnected: true, groupIds: ["g-challah-jlm"], source: "whatsapp", assigneeId: "u-shira",
    since: "2022-02-01T09:00:00.000Z", updatedAt: "2026-10-25T09:00:00.000Z",
    passport: passport("41220305", "1975-10-22", "2017-01-16", "2027-01-15", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-dvora-stern", firstName: "דבורה", lastName: "שטרן", phone: "0536401907", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "facebook", assigneeId: "u-shira",
    since: "2024-05-12T09:00:00.000Z", updatedAt: "2026-10-24T08:00:00.000Z",
    passport: passport("36550118", "1968-11-05", "2019-07-01", "2029-06-30", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-esther-mizrahi", firstName: "אסתר", lastName: "מזרחי", phone: "0504471166", whatsappConnected: true, groupIds: ["g-challah-jlm"], source: "landing-page", assigneeId: "u-shira",
    since: "2025-03-03T09:00:00.000Z", updatedAt: "2026-10-23T08:00:00.000Z",
    passport: passport("39871542", "1983-10-29", "2020-02-20", "2030-02-19", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-hana-goldberg", firstName: "חנה", lastName: "גולדברג", phone: "0503318832", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-moran",
    since: "2023-11-20T09:00:00.000Z", updatedAt: "2026-10-27T15:00:00.000Z",
    passport: passport("37064760", "1971-01-17", "2017-03-09", "2027-03-08", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-gila-friedman", firstName: "גילה", lastName: "פרידמן", phone: "0526633318", whatsappConnected: true, groupIds: ["g-uman-tubav"], source: "referral", assigneeId: "u-ronit",
    since: "2020-06-30T09:00:00.000Z", updatedAt: "2026-10-21T08:00:00.000Z",
    passport: passport("33910871", "1962-10-28", "2018-04-05", "2028-04-04", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-naama-rozen", firstName: "נעמה", lastName: "רוזן", phone: "0587762290", whatsappConnected: false, groupIds: ["g-poland-nov"], source: "instagram", assigneeId: "u-moran",
    since: "2025-08-01T09:00:00.000Z", updatedAt: "2026-10-19T08:00:00.000Z",
    passport: passport("42305019", "1990-12-09", "2021-08-22", "2031-08-21", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-ilana-shmueli", firstName: "אילנה", lastName: "שמואלי", phone: "0548834381", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-shira",
    since: "2022-10-10T09:00:00.000Z", updatedAt: "2026-10-15T08:00:00.000Z",
    passport: passport("35518304", "1966-04-12", "2020-10-18", "2030-10-17", "monday", IMPORT_RUN_AT), notes: [],
  },
  {
    id: "c-yael-peretz", firstName: "יעל", lastName: "פרץ", phone: "0542212219", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "instagram", assigneeId: "u-moran",
    since: "2026-10-12T08:00:00.000Z", updatedAt: "2026-10-28T12:30:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-miriam-alon", firstName: "מרים", lastName: "אלון", phone: "0527716170", whatsappConnected: true, groupIds: ["g-poland-nov"], source: "facebook", assigneeId: "u-moran",
    since: "2026-09-02T09:00:00.000Z", updatedAt: "2026-10-18T08:00:00.000Z", passport: null, notes: [],
  },
  {
    id: "c-tova-rabinovich", firstName: "טובה", lastName: "רבינוביץ", phone: "0503349904", whatsappConnected: false, groupIds: ["g-poland-nov"], source: "referral", assigneeId: "u-shira",
    since: "2026-08-20T09:00:00.000Z", updatedAt: "2026-10-17T08:00:00.000Z", passport: null, notes: [],
  },
];

export const INTAKES: PassportIntake[] = [
  { id: "i-sara", name: "שרה כהן", phone: "0526120418", receivedAt: "2026-10-28T12:32:00.000Z", result: "matched", reason: "נמצאה התאמה לפי שם מלא", customerId: "c-sara-cohen" },
  { id: "i-lea", name: "לאה ברגר", phone: "0549981120", receivedAt: "2026-10-28T09:20:00.000Z", result: "new-card", reason: "לא נמצא לקוח בשם הזה", customerId: "c-lea-berger" },
  { id: "i-pnina", name: "פנינה לוי", phone: "0545520077", receivedAt: "2026-10-28T08:05:00.000Z", result: "needs-review", reason: "נמצאו 2 לקוחות באותו שם", customerId: null },
  { id: "i-tzipora", name: "ציפורה אוחיון", phone: "0507712233", receivedAt: "2026-10-27T17:48:00.000Z", result: "needs-review", reason: "הצילום לא ברור, חסר תאריך לידה", customerId: null },
];

export const ACTIVITY: Activity[] = [
  { id: "a-passport", kind: "passport", at: "2026-10-28T12:32:00.000Z", title: "דרכון התקבל בוואטסאפ · שרה כהן", detail: "נמצאה התאמה לפי שם, הדרכון נוסף לכרטיס הקיים" },
  { id: "a-lead", kind: "lead", at: "2026-10-28T10:05:00.000Z", title: "ליד חדש מדף הנחיתה · מיכל לוי", detail: "שויך לקבוצה אומן · ט״ו באב" },
  { id: "a-greeting", kind: "greeting", at: "2026-10-28T07:15:00.000Z", title: "ברכת חנוכה נשמרה כטיוטה", detail: "ממתינה לאישור לפני שליחה ל-412 לקוחות" },
  { id: "a-birthday", kind: "birthday", at: "2026-10-28T07:00:00.000Z", title: "2 ברכות יום הולדת נשלחו", detail: "רינה מלכה וגילה פרידמן" },
  { id: "a-import", kind: "import", at: "2026-10-28T06:40:00.000Z", title: "הייבוא מ-Monday.com הושלם", detail: "1,284 לידים הועברו, 37 כפילויות אוחדו" },
];
```

- [ ] **Step 6: Write the generator**

`dashboard/src/data/mock/generate.ts`:

```ts
import { addDays, dayAt, daysBetween, isoDay, today as demoToday, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import type { Customer, Database, Lead, LeadSource, LeadStatus, Passport } from "../types";
import { ACTIVITY, CUSTOMERS, GROUP_REGISTRATIONS, GROUPS, INTAKES, LEADS, USERS } from "./fixtures";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { createRng, type Rng } from "./rng";

/** Totals from the approved design. The generator adds volume around the hand-written records to hit them. */
export const TARGETS = {
  totalLeads: 1298,
  /** New leads per week for the 8 weeks ending this week, oldest first. */
  weeklyLeads: [8, 11, 7, 12, 9, 10, 9, 14],
  /** Open pipeline: 24 leads. */
  openByStatus: { new: 6, talking: 11, "details-sent": 4, registered: 3 },
  /** This week's 14 new leads by current status. */
  thisWeekByStatus: { new: 6, talking: 5, registered: 3 },
  customers: 412,
  missingPassports: 23,
  expiringPassports: 5,
} as const;

const SOURCES: LeadSource[] = ["landing-page", "instagram", "facebook", "whatsapp", "referral"];
const ASSIGNEES = ["u-ronit", "u-shira", "u-moran", null] as const;
const OLD_NOTES = ["נרשמה לטיול", "לא רלוונטי כרגע", "ביקשה לחזור בשנה הבאה", "הגיעה מהמלצה", "השתתפה באירוע"];
const HISTORY_START = "2024-01-01";

const pad = (value: number) => String(value).padStart(2, "0");

function randomPhone(rng: Rng): string {
  return `05${rng.pick(["0", "2", "3", "4", "8"])}${String(rng.int(0, 9_999_999)).padStart(7, "0")}`;
}

/** A moment on `day` between 08:00 and `latestHour`:59, Israel time. */
function momentOn(rng: Rng, day: Date, latestHour = 20): string {
  return dayAt(isoDay(day), `${pad(rng.int(8, latestHour))}:${pad(rng.int(0, 59))}`).toISOString();
}

function generateLeads(rng: Rng, day: Date): Lead[] {
  const weeks = TARGETS.weeklyLeads.length;
  const thisWeek = weekStart(day);
  const windowStart = addDays(thisWeek, -7 * (weeks - 1));
  const weekOf = (iso: string) => Math.floor(daysBetween(windowStart, new Date(iso)) / 7);
  const leads: Lead[] = [...LEADS];
  let serial = 0;

  const add = (createdAt: string, status: LeadStatus, archived: boolean) => {
    const note = rng.pick(OLD_NOTES);
    leads.push({
      id: `l-gen-${serial}`,
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: randomPhone(rng),
      source: rng.pick(SOURCES),
      status,
      groupId: archived ? null : rng.pick(GROUPS).id,
      assigneeId: rng.pick(ASSIGNEES),
      createdAt,
      updatedAt: createdAt,
      lastNote: note,
      archived,
      history: [{ id: `l-gen-${serial}-e1`, at: createdAt, text: note, byUserId: null }],
    });
    serial += 1;
  };

  // This week: top up to 6 new, 5 talking and 3 registered, never later than today 14:59.
  const daysSoFar = daysBetween(thisWeek, day);
  for (const status of ["new", "talking", "registered"] as const) {
    const have = leads.filter((l) => weekOf(l.createdAt) === weeks - 1 && l.status === status).length;
    for (let i = have; i < TARGETS.thisWeekByStatus[status]; i += 1) {
      const offset = rng.int(0, daysSoFar);
      add(momentOn(rng, addDays(thisWeek, offset), offset === daysSoFar ? 14 : 20), status, false);
    }
  }

  // Earlier weeks: top up the open pipeline (talking, details sent) inside the last few weeks.
  for (const status of ["talking", "details-sent"] as const) {
    const have = leads.filter((l) => isOpenLead(l) && l.status === status).length;
    for (let i = have; i < TARGETS.openByStatus[status]; i += 1) {
      add(momentOn(rng, addDays(windowStart, rng.int(weeks - 4, weeks - 2) * 7 + rng.int(0, 6))), status, false);
    }
  }

  // Archived leads from past trips fill each week of the window to its target...
  for (let week = 0; week < weeks; week += 1) {
    const have = leads.filter((l) => weekOf(l.createdAt) === week).length;
    for (let i = have; i < TARGETS.weeklyLeads[week]; i += 1) {
      add(momentOn(rng, addDays(windowStart, week * 7 + rng.int(0, 6))), rng.chance(0.6) ? "registered" : "not-relevant", true);
    }
  }

  // ...and the rest of the history before the window.
  const historyDays = daysBetween(dayAt(HISTORY_START), windowStart) - 1;
  while (leads.length < TARGETS.totalLeads) {
    add(momentOn(rng, addDays(dayAt(HISTORY_START), rng.int(0, historyDays))), rng.chance(0.6) ? "registered" : "not-relevant", true);
  }
  return leads;
}

function makePassport(rng: Rng, expiry: Date, receivedAt: string): Passport {
  return {
    number: `${rng.int(30, 43)}${String(rng.int(0, 999_999)).padStart(6, "0")}`,
    birthDate: `${rng.int(1950, 2002)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`,
    issueDate: isoDay(addDays(expiry, -3651)),
    expiryDate: isoDay(expiry),
    nationality: "ישראלית",
    receivedVia: "monday",
    receivedAt,
    photoAvailable: true,
  };
}

function generateCustomers(rng: Rng, day: Date): Customer[] {
  const customers: Customer[] = [...CUSTOMERS];
  let serial = 0;

  const add = (groupIds: string[], passport: "valid" | "expiring" | "missing") => {
    const since = dayAt(`${rng.int(2019, 2025)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`).toISOString();
    const expiry = passport === "expiring" ? addDays(day, rng.int(30, 170)) : addDays(day, rng.int(220, 3650));
    customers.push({
      id: `c-gen-${serial}`,
      firstName: rng.pick(FIRST_NAMES),
      lastName: rng.pick(LAST_NAMES),
      phone: randomPhone(rng),
      whatsappConnected: rng.chance(0.8),
      groupIds,
      source: rng.pick(SOURCES),
      assigneeId: rng.pick(ASSIGNEES),
      since,
      updatedAt: since,
      passport: passport === "missing" ? null : makePassport(rng, expiry, since),
      notes: [],
    });
    serial += 1;
  };

  for (const group of GROUPS) {
    const have = customers.filter((c) => c.groupIds.includes(group.id)).length;
    for (let i = have; i < GROUP_REGISTRATIONS[group.id]; i += 1) add([group.id], "valid");
  }
  const missing = () => customers.filter((c) => c.passport === null).length;
  const expiring = () =>
    customers.filter((c) => c.passport !== null && daysBetween(day, new Date(c.passport.expiryDate)) <= EXPIRING_WITHIN_DAYS).length;
  while (missing() < TARGETS.missingPassports) add([], "missing");
  while (expiring() < TARGETS.expiringPassports) add([], "expiring");
  while (customers.length < TARGETS.customers) add([], "valid");
  return customers;
}

export interface GenerateOptions {
  seed?: number;
  today?: Date;
}

/** The demo database: the design's records plus seeded volume. Same seed, same data. */
export function createDatabase({ seed = 5787, today = demoToday() }: GenerateOptions = {}): Database {
  const rng = createRng(seed);
  return {
    users: USERS,
    leads: generateLeads(rng, today),
    customers: generateCustomers(rng, today),
    intakes: INTAKES,
    groups: GROUPS,
    activity: ACTIVITY,
  };
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/data`
Expected: PASS, 2 files and 10 tests.

- [ ] **Step 8: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the domain model and seeded demo data matching the design" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Services and the mock backend

**Files:**
- Create: `dashboard/src/content/leads.he.ts`, `dashboard/src/data/services.ts`, `dashboard/src/data/mock/createMockServices.ts`
- Test: `dashboard/src/data/mock/services.test.ts`

**Interfaces:**
- Consumes:
  - Domain types, `isOpenLead` and `EXPIRING_WITHIN_DAYS` (Task 8).
  - `createDatabase` (Task 8).
  - The clock helpers (Task 3).
- Produces:
  - **`services.ts`:**
    - Filter and paging types:
      - `LeadStatusFilter`
      - `LeadFilters { status?, groupId?, source?, assigneeId?, search? }`
      - `LeadCounts`
      - `CustomerFilter` (`"all" | "whatsapp-today" | "expiring" | "missing-passport"`)
      - `CustomerQuery { filter?, search?, page?, pageSize? }`
      - `Page<T> { items, total, page, pageSize }`
    - Service interfaces: `SessionService`, `LeadsService`, `CustomersService`, `GroupsService`, `OverviewService`.
    - `Services { session, leads, customers, groups, overview }` and `ServiceName`.
    - Error classes: `NotFoundError`, `ServiceUnavailableError`.
    - `SignedIn = { session: Session; user: StaffUser }`.
  - **`createMockServices.ts`:**
    - `MockOptions { db?, latency?, failing?, storage?, now? }`.
    - `createMockServices(options?: MockOptions): Services`.
    - `latencyFromEnv(value?: string): [number, number]`.
    - `failingFromSearch(search: string): Set<ServiceName>`.
  - **`leads.he.ts`:** `leadsCopy` with `status: Record<LeadStatus, string>` and `statusChanged(label)`.
- Behavior:
  - **Leads:**
    - `leads.list()` returns the open pipeline (24 leads), newest update first. Filtering on `status: "not-relevant"` lists non-archived irrelevant leads instead.
    - Search matches the name, or the phone digits.
  - **Customers:** `customers.list()` pages at 25 by default.
  - **Session:** `session.signIn()` accepts any non-empty email and password, and signs in as Ronit (`u-ronit`).
  - **Shared rules:**
    - Every response is a fresh copy.
    - Services in `failing` reject with `ServiceUnavailableError`.

- [ ] **Step 1: Write the failing test**

`dashboard/src/data/mock/services.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayAt } from "../../lib/clock";
import { NotFoundError, ServiceUnavailableError } from "../services";
import { createMockServices, failingFromSearch, latencyFromEnv, type MockOptions } from "./createMockServices";
import { createDatabase } from "./generate";

const db = createDatabase({ seed: 5787, today: dayAt("2026-10-28") });
const make = (options: MockOptions = {}) => createMockServices({ db, latency: [0, 0], now: () => dayAt("2026-10-28", "15:30"), ...options });

describe("mock services", () => {
  it("signs in with any credentials and remembers the session", async () => {
    const services = make();
    expect(await services.session.current()).toBeNull();
    await expect(services.session.signIn("", "x")).rejects.toThrow("missing-credentials");
    const { user } = await services.session.signIn("ronit@example.com", "secret");
    expect(user.name).toBe("רונית ברש");
    expect((await services.session.current())?.user.id).toBe("u-ronit");
    await services.session.signOut();
    expect(await services.session.current()).toBeNull();
  });

  it("lists the open pipeline with counts, newest first", async () => {
    const services = make();
    expect(await services.leads.counts()).toMatchObject({ all: 24, new: 6, talking: 11, "details-sent": 4, registered: 3, "not-relevant": 1 });
    const talking = await services.leads.list({ status: "talking" });
    expect(talking).toHaveLength(11);
    expect(talking[0].updatedAt >= talking[1].updatedAt).toBe(true);
  });

  it("searches leads by name or phone", async () => {
    const services = make();
    expect((await services.leads.list({ search: "יעל פרץ" })).map((l) => l.id)).toContain("l-yael-peretz");
    expect((await services.leads.list({ search: "054-221" })).map((l) => l.id)).toContain("l-yael-peretz");
  });

  it("changes a lead's status and records it in the history", async () => {
    const services = make();
    const lead = await services.leads.updateStatus("l-noa-biton", "talking");
    expect(lead.status).toBe("talking");
    expect(lead.history[0].text).toBe("הסטטוס עודכן: בשיחה");
    expect((await services.leads.counts()).new).toBe(5);
  });

  it("never hands out its internal objects", async () => {
    const services = make();
    const lead = await services.leads.get("l-yael-peretz");
    lead.name = "changed";
    expect((await services.leads.get("l-yael-peretz")).name).toBe("יעל פרץ");
  });

  it("filters and pages customers", async () => {
    const services = make();
    const page = await services.customers.list({ page: 2, pageSize: 25 });
    expect(page).toMatchObject({ total: 412, page: 2, pageSize: 25 });
    expect(page.items).toHaveLength(25);
    expect((await services.customers.list({ filter: "missing-passport" })).total).toBe(23);
    expect((await services.customers.list({ filter: "expiring" })).total).toBe(5);
    expect((await services.customers.list({ filter: "whatsapp-today" })).items.map((c) => c.id)).toEqual(["c-sara-cohen", "c-lea-berger"]);
    expect((await services.customers.intakes())[0].id).toBe("i-sara");
  });

  it("summarizes groups and the overview", async () => {
    const services = make();
    const groups = await services.groups.list();
    expect(groups.find((g) => g.id === "g-poland-nov")).toMatchObject({ registered: 32, passportsReceived: 29, capacity: 40 });
    const stats = await services.overview.stats();
    expect(stats).toMatchObject({
      openLeads: 24,
      customers: 412,
      activeGroups: 4,
      newLeadsThisWeek: 14,
      newLeadsLastWeek: 9,
      thisWeekByStatus: { new: 6, talking: 5, registered: 3 },
    });
    expect(stats.weeklyLeads.map((w) => w.count)).toEqual([8, 11, 7, 12, 9, 10, 9, 14]);
  });

  it("reports missing records and simulated outages", async () => {
    await expect(make().leads.get("nope")).rejects.toBeInstanceOf(NotFoundError);
    const broken = make({ failing: new Set(["leads"] as const) });
    await expect(broken.leads.counts()).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(await broken.groups.list()).toHaveLength(4);
  });

  it("reads the delay and the failing services from config", () => {
    expect(latencyFromEnv("10,20")).toEqual([10, 20]);
    expect(latencyFromEnv("oops")).toEqual([250, 600]);
    expect([...failingFromSearch("?mock-error=leads,bogus")]).toEqual(["leads"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/data/mock/services.test.ts`
Expected: FAIL with `Failed to resolve import "../services"`.

- [ ] **Step 3: Write the service contracts**

`dashboard/src/content/leads.he.ts`:

```ts
import type { LeadStatus } from "../data/types";

export const leadsCopy = {
  status: {
    new: "חדש",
    talking: "בשיחה",
    "details-sent": "נשלחו פרטים",
    registered: "הרשמה הושלמה",
    "not-relevant": "לא רלוונטי",
  } satisfies Record<LeadStatus, string>,
  statusChanged: (label: string) => `הסטטוס עודכן: ${label}`,
} as const;
```

`dashboard/src/data/services.ts`:

```ts
import type { Activity, Customer, GroupSummary, Lead, LeadSource, LeadStatus, OverviewStats, PassportIntake, Session, StaffUser } from "./types";

export type LeadStatusFilter = LeadStatus | "all";

export interface LeadFilters {
  status?: LeadStatusFilter;
  groupId?: string;
  source?: LeadSource;
  assigneeId?: string;
  /** Matches the name, or digits in the phone number. */
  search?: string;
}

export type LeadCounts = Record<LeadStatusFilter, number>;

export type CustomerFilter = "all" | "whatsapp-today" | "expiring" | "missing-passport";

export interface CustomerQuery {
  filter?: CustomerFilter;
  /** Matches the name, or digits in the phone or passport number. */
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SignedIn {
  session: Session;
  user: StaffUser;
}

export interface SessionService {
  current(): Promise<SignedIn | null>;
  signIn(email: string, password: string): Promise<SignedIn>;
  signOut(): Promise<void>;
}

export interface LeadsService {
  /** The open pipeline, newest update first. */
  list(filters?: LeadFilters): Promise<Lead[]>;
  counts(): Promise<LeadCounts>;
  get(id: string): Promise<Lead>;
  updateStatus(id: string, status: LeadStatus): Promise<Lead>;
  addNote(id: string, text: string): Promise<Lead>;
}

export interface CustomersService {
  list(query?: CustomerQuery): Promise<Page<Customer>>;
  get(id: string): Promise<Customer>;
  /** Passports that arrived on WhatsApp, newest first. */
  intakes(): Promise<PassportIntake[]>;
}

export interface GroupsService {
  list(): Promise<GroupSummary[]>;
  get(id: string): Promise<GroupSummary>;
}

export interface OverviewService {
  stats(): Promise<OverviewStats>;
  /** Newest first. */
  activity(): Promise<Activity[]>;
}

/** Everything the screens may ask of the backend. The mock implements it today; Ronit's API will later. */
export interface Services {
  session: SessionService;
  leads: LeadsService;
  customers: CustomersService;
  groups: GroupsService;
  overview: OverviewService;
}

export type ServiceName = keyof Services;

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export class ServiceUnavailableError extends Error {
  constructor(service: ServiceName) {
    super(`The ${service} service is unavailable`);
    this.name = "ServiceUnavailableError";
  }
}
```

- [ ] **Step 4: Write the mock backend**

`dashboard/src/data/mock/createMockServices.ts`:

```ts
import { leadsCopy } from "../../content/leads.he";
import { addDays, daysBetween, isoDay, now as demoNow, weekStart } from "../../lib/clock";
import { EXPIRING_WITHIN_DAYS, isOpenLead } from "../rules";
import {
  NotFoundError,
  ServiceUnavailableError,
  type CustomerQuery,
  type LeadCounts,
  type LeadFilters,
  type ServiceName,
  type Services,
} from "../services";
import type { Customer, Database, Group, GroupSummary, Lead, LeadStatus, OverviewStats, Session, StaffUser } from "../types";
import { createDatabase } from "./generate";

export interface MockOptions {
  /** Starting data. Defaults to the seeded demo database. The mock always works on its own copy. */
  db?: Database;
  /** Response delay range in ms. Defaults to VITE_MOCK_LATENCY. */
  latency?: readonly [number, number];
  /** Services that fail every call, to show error states. */
  failing?: ReadonlySet<ServiceName>;
  /** Where the session is kept. Defaults to sessionStorage. */
  storage?: Storage;
  /** The current moment. Defaults to the demo "now". */
  now?: () => Date;
}

const SESSION_KEY = "or-hatzadik.session";
const SERVICE_NAMES: ServiceName[] = ["session", "leads", "customers", "groups", "overview"];
const WEEKS_SHOWN = 8;

/** Reads "min,max" from VITE_MOCK_LATENCY. Defaults to 250 to 600 ms. */
export function latencyFromEnv(value = import.meta.env.VITE_MOCK_LATENCY): [number, number] {
  const [min, max] = (value ?? "250,600").split(",").map(Number);
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [250, 600];
}

/** Reads ?mock-error=leads,customers so a screen's error state can be seen during development. */
export function failingFromSearch(search: string): Set<ServiceName> {
  const asked = new URLSearchParams(search).get("mock-error")?.split(",") ?? [];
  return new Set(SERVICE_NAMES.filter((name) => asked.includes(name)));
}

/** The in-memory backend the shell runs on until Ronit's API is connected. */
export function createMockServices(options: MockOptions = {}): Services {
  const state: Database = structuredClone(options.db ?? createDatabase());
  const [minDelay, maxDelay] = options.latency ?? latencyFromEnv();
  const failing = options.failing ?? new Set<ServiceName>();
  const storage = options.storage ?? window.sessionStorage;
  const clock = options.now ?? demoNow;

  /** Waits like a network call, fails when asked to, and never hands out internal objects. */
  async function respond<T>(service: ServiceName, produce: () => T): Promise<T> {
    const wait = minDelay + Math.random() * Math.max(0, maxDelay - minDelay);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (failing.has(service)) throw new ServiceUnavailableError(service);
    return structuredClone(produce());
  }

  function readSession(): Session | null {
    const raw = storage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  }

  function findUser(id: string): StaffUser {
    const user = state.users.find((u) => u.id === id);
    if (!user) throw new NotFoundError("User", id);
    return user;
  }

  function findLead(id: string): Lead {
    const lead = state.leads.find((l) => l.id === id);
    if (!lead) throw new NotFoundError("Lead", id);
    return lead;
  }

  function findCustomer(id: string): Customer {
    const customer = state.customers.find((c) => c.id === id);
    if (!customer) throw new NotFoundError("Customer", id);
    return customer;
  }

  function recordOnLead(lead: Lead, text: string) {
    const at = clock().toISOString();
    lead.updatedAt = at;
    lead.history = [{ id: `${lead.id}-e${lead.history.length + 1}`, at, text, byUserId: readSession()?.userId ?? null }, ...lead.history];
  }

  function leadMatches(lead: Lead, filters: LeadFilters): boolean {
    if (filters.status && filters.status !== "all" && lead.status !== filters.status) return false;
    if (filters.groupId && lead.groupId !== filters.groupId) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (filters.assigneeId && lead.assigneeId !== filters.assigneeId) return false;
    const term = filters.search?.trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      const byName = lead.name.includes(term);
      const byPhone = digits.length > 0 && lead.phone.includes(digits);
      if (!byName && !byPhone) return false;
    }
    return true;
  }

  function customerMatches(customer: Customer, query: CustomerQuery, reference: Date): boolean {
    const filter = query.filter ?? "all";
    const passport = customer.passport;
    if (filter === "whatsapp-today" && !(passport?.receivedVia === "whatsapp" && isoDay(new Date(passport.receivedAt)) === isoDay(reference))) return false;
    if (filter === "expiring" && !(passport !== null && daysBetween(reference, new Date(passport.expiryDate)) <= EXPIRING_WITHIN_DAYS)) return false;
    if (filter === "missing-passport" && passport !== null) return false;
    const term = query.search?.trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      const byName = `${customer.firstName} ${customer.lastName}`.includes(term);
      const byNumber = digits.length > 0 && (customer.phone.includes(digits) || (passport?.number.includes(digits) ?? false));
      if (!byName && !byNumber) return false;
    }
    return true;
  }

  function summarize(group: Group): GroupSummary {
    const members = state.customers.filter((c) => c.groupIds.includes(group.id));
    return { ...group, registered: members.length, passportsReceived: members.filter((c) => c.passport !== null).length };
  }

  return {
    session: {
      async current() {
        if (failing.has("session")) throw new ServiceUnavailableError("session");
        const session = readSession();
        if (!session) return null;
        const user = state.users.find((u) => u.id === session.userId);
        return user ? { session, user: structuredClone(user) } : null;
      },
      signIn: (email, password) =>
        respond("session", () => {
          if (!email.trim() || !password) throw new Error("missing-credentials");
          const session: Session = { userId: "u-ronit", signedInAt: clock().toISOString() };
          storage.setItem(SESSION_KEY, JSON.stringify(session));
          return { session, user: findUser(session.userId) };
        }),
      async signOut() {
        storage.removeItem(SESSION_KEY);
      },
    },

    leads: {
      list: (filters = {}) =>
        respond("leads", () =>
          state.leads
            .filter((lead) => (filters.status === "not-relevant" ? !lead.archived && lead.status === "not-relevant" : isOpenLead(lead)))
            .filter((lead) => leadMatches(lead, filters))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        ),
      counts: () =>
        respond("leads", () => {
          const open = state.leads.filter(isOpenLead);
          const count = (status: LeadStatus) => open.filter((lead) => lead.status === status).length;
          const counts: LeadCounts = {
            all: open.length,
            new: count("new"),
            talking: count("talking"),
            "details-sent": count("details-sent"),
            registered: count("registered"),
            "not-relevant": state.leads.filter((lead) => !lead.archived && lead.status === "not-relevant").length,
          };
          return counts;
        }),
      get: (id) => respond("leads", () => findLead(id)),
      updateStatus: (id, status) =>
        respond("leads", () => {
          const lead = findLead(id);
          lead.status = status;
          recordOnLead(lead, leadsCopy.statusChanged(leadsCopy.status[status]));
          return lead;
        }),
      addNote: (id, text) =>
        respond("leads", () => {
          const lead = findLead(id);
          lead.lastNote = text;
          recordOnLead(lead, text);
          return lead;
        }),
    },

    customers: {
      list: (query = {}) =>
        respond("customers", () => {
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 25;
          const reference = clock();
          const matches = state.customers
            .filter((customer) => customerMatches(customer, query, reference))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          return { items: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pageSize };
        }),
      get: (id) => respond("customers", () => findCustomer(id)),
      intakes: () => respond("customers", () => [...state.intakes].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))),
    },

    groups: {
      list: () => respond("groups", () => state.groups.map(summarize)),
      get: (id) =>
        respond("groups", () => {
          const group = state.groups.find((g) => g.id === id);
          if (!group) throw new NotFoundError("Group", id);
          return summarize(group);
        }),
    },

    overview: {
      stats: () =>
        respond("overview", () => {
          const reference = clock();
          const thisWeek = weekStart(reference);
          const weeklyLeads = Array.from({ length: WEEKS_SHOWN }, (_, index) => {
            const start = addDays(thisWeek, -7 * (WEEKS_SHOWN - 1 - index));
            const count = state.leads.filter((lead) => {
              const offset = daysBetween(start, new Date(lead.createdAt));
              return offset >= 0 && offset < 7;
            }).length;
            return { weekStart: isoDay(start), count };
          });
          const thisWeekLeads = state.leads.filter((lead) => daysBetween(thisWeek, new Date(lead.createdAt)) >= 0);
          const byStatus = (status: LeadStatus) => thisWeekLeads.filter((lead) => lead.status === status).length;
          const todayIso = isoDay(reference);
          const stats: OverviewStats = {
            openLeads: state.leads.filter(isOpenLead).length,
            customers: state.customers.length,
            activeGroups: state.groups.filter((group) => (group.endsOn ?? group.startsOn) >= todayIso).length,
            newLeadsThisWeek: thisWeekLeads.length,
            newLeadsLastWeek: weeklyLeads[WEEKS_SHOWN - 2].count,
            thisWeekByStatus: { new: byStatus("new"), talking: byStatus("talking"), registered: byStatus("registered") },
            weeklyLeads,
          };
          return stats;
        }),
      activity: () => respond("overview", () => [...state.activity].sort((a, b) => b.at.localeCompare(a.at))),
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/data/mock/services.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the service contracts and the in-memory mock backend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Data providers and query hooks

**Files:**
- Create: `dashboard/src/data/services-context.ts`, `dashboard/src/data/ServicesProvider.tsx`, `dashboard/src/data/queryClient.ts`, `dashboard/src/data/queries.ts`, `dashboard/src/test/app.tsx`
- Test: `dashboard/src/data/queries.test.tsx`

**Interfaces:**
- Consumes:
  - `Services`, `createMockServices` and `MockOptions` (Task 9).
  - `MotionRoot` (Task 4).
  - `createDatabase` (Task 8).
- Produces:
  - **Services access:**
    - `useServices(): Services`.
    - `<ServicesProvider services>`.
    - `createQueryClient(): QueryClient`.
  - **Query hooks (`queries.ts`):**
    - `queryKeys`.
    - Session: `useSession()`, `useSignIn()` (mutation `{ email, password }`), `useSignOut()`.
    - Leads: `useLeads(filters?)`, `useLeadCounts()`, `useLead(id)`.
    - `useUpdateLeadStatus()`: a mutation taking `{ id, status }` that updates optimistically and rolls back on error.
    - Customers: `useCustomers(query?)`, `useCustomer(id)`, `usePassportIntakes()`.
    - Other: `useGroups()`, `useOverview()`, `useActivity()`.
  - **Test helpers (`src/test/app.tsx`):**
    - `createTestServices(options?)`: demo data, no delay, demo "now".
    - `signedInServices(options?)`: the same, with Ronit already signed in.
    - `createTestClient()`.
    - `<TestProviders services client>`.
    - `renderApp(routes, { path?, state?, services? })`, which returns the render result plus `router`, `services` and `client`.

- [ ] **Step 1: Write the failing test**

`dashboard/src/data/queries.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TestProviders, createTestClient, createTestServices } from "../test/app";
import { queryKeys, useLead, useLeadCounts, useOverview, useSession, useSignIn, useUpdateLeadStatus } from "./queries";
import type { Lead } from "./types";

function setup() {
  const services = createTestServices();
  const client = createTestClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders services={services} client={client}>
      {children}
    </TestProviders>
  );
  return { services, client, wrapper };
}

describe("query hooks", () => {
  it("signs in and updates the session", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ session: useSession(), signIn: useSignIn() }), { wrapper });
    await waitFor(() => expect(result.current.session.isSuccess).toBe(true));
    expect(result.current.session.data).toBeNull();
    await act(() => result.current.signIn.mutateAsync({ email: "ronit@example.com", password: "demo" }));
    await waitFor(() => expect(result.current.session.data?.user.name).toBe("רונית ברש"));
  });

  it("loads the overview numbers", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useOverview(), { wrapper });
    await waitFor(() => expect(result.current.data?.openLeads).toBe(24));
  });

  it("changes a lead's status optimistically and refreshes the counts", async () => {
    const { wrapper, client } = setup();
    const { result } = renderHook(() => ({ lead: useLead("l-noa-biton"), counts: useLeadCounts(), update: useUpdateLeadStatus() }), { wrapper });
    await waitFor(() => expect(result.current.lead.data?.status).toBe("new"));
    act(() => result.current.update.mutate({ id: "l-noa-biton", status: "talking" }));
    await waitFor(() => expect(client.getQueryData<Lead>(queryKeys.lead("l-noa-biton"))?.status).toBe("talking"));
    await waitFor(() => expect(result.current.counts.data?.new).toBe(5));
  });

  it("rolls the status back when the update fails", async () => {
    const { services, wrapper, client } = setup();
    services.leads.updateStatus = async () => {
      throw new Error("boom");
    };
    const { result } = renderHook(() => ({ lead: useLead("l-noa-biton"), update: useUpdateLeadStatus() }), { wrapper });
    await waitFor(() => expect(result.current.lead.data?.status).toBe("new"));
    await act(async () => {
      await result.current.update.mutateAsync({ id: "l-noa-biton", status: "talking" }).catch(() => undefined);
    });
    expect(client.getQueryData<Lead>(queryKeys.lead("l-noa-biton"))?.status).toBe("new");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/data/queries.test.tsx`
Expected: FAIL with `Failed to resolve import "../test/app"`.

- [ ] **Step 3: Write the provider, the query client and the hooks**

`dashboard/src/data/services-context.ts`:

```ts
import { createContext, useContext } from "react";
import type { Services } from "./services";

export const ServicesContext = createContext<Services | null>(null);

/** The backend the screens talk to. Read data through the hooks in queries.ts, not directly. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <ServicesProvider>");
  return services;
}
```

`dashboard/src/data/ServicesProvider.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Services } from "./services";
import { ServicesContext } from "./services-context";

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}
```

`dashboard/src/data/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
  });
}
```

`dashboard/src/data/queries.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerQuery, LeadFilters } from "./services";
import { useServices } from "./services-context";
import type { Lead, LeadStatus } from "./types";

export const queryKeys = {
  session: ["session"] as const,
  leads: (filters: LeadFilters) => ["leads", "list", filters] as const,
  leadCounts: ["leads", "counts"] as const,
  lead: (id: string) => ["leads", "detail", id] as const,
  customers: (query: CustomerQuery) => ["customers", "list", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  intakes: ["customers", "intakes"] as const,
  groups: ["groups"] as const,
  overview: ["overview", "stats"] as const,
  activity: ["overview", "activity"] as const,
};

export function useSession() {
  const { session } = useServices();
  return useQuery({ queryKey: queryKeys.session, queryFn: () => session.current() });
}

export function useSignIn() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => session.signIn(email, password),
    onSuccess: (signedIn) => client.setQueryData(queryKeys.session, signedIn),
  });
}

export function useSignOut() {
  const { session } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => session.signOut(),
    onSuccess: () => {
      client.clear();
      client.setQueryData(queryKeys.session, null);
    },
  });
}

export function useLeads(filters: LeadFilters = {}) {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.leads(filters), queryFn: () => leads.list(filters) });
}

export function useLeadCounts() {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.leadCounts, queryFn: () => leads.counts() });
}

export function useLead(id: string) {
  const { leads } = useServices();
  return useQuery({ queryKey: queryKeys.lead(id), queryFn: () => leads.get(id) });
}

/** Changes a lead's status on screen right away, rolls back if the call fails, then refreshes lists and counts. */
export function useUpdateLeadStatus() {
  const { leads } = useServices();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) => leads.updateStatus(id, status),
    onMutate: async ({ id, status }) => {
      await client.cancelQueries({ queryKey: queryKeys.lead(id) });
      const previous = client.getQueryData<Lead>(queryKeys.lead(id));
      if (previous) client.setQueryData<Lead>(queryKeys.lead(id), { ...previous, status });
      return { previous };
    },
    onError: (_error, { id }, context) => {
      if (context?.previous) client.setQueryData(queryKeys.lead(id), context.previous);
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
      await client.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useCustomers(query: CustomerQuery = {}) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customers(query), queryFn: () => customers.list(query), placeholderData: keepPreviousData });
}

export function useCustomer(id: string) {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.customer(id), queryFn: () => customers.get(id) });
}

export function usePassportIntakes() {
  const { customers } = useServices();
  return useQuery({ queryKey: queryKeys.intakes, queryFn: () => customers.intakes() });
}

export function useGroups() {
  const { groups } = useServices();
  return useQuery({ queryKey: queryKeys.groups, queryFn: () => groups.list() });
}

export function useOverview() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => overview.stats() });
}

export function useActivity() {
  const { overview } = useServices();
  return useQuery({ queryKey: queryKeys.activity, queryFn: () => overview.activity() });
}
```

- [ ] **Step 4: Write the test helpers**

`dashboard/src/test/app.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { createMockServices, type MockOptions } from "../data/mock/createMockServices";
import { createDatabase } from "../data/mock/generate";
import type { Services } from "../data/services";
import { ServicesProvider } from "../data/ServicesProvider";
import { dayAt } from "../lib/clock";
import { MotionRoot } from "../motion/MotionRoot";

const demoDb = createDatabase({ seed: 5787, today: dayAt("2026-10-28") });

/** Mock services on the demo data that answer instantly. Each call works on its own copy. */
export function createTestServices(options: MockOptions = {}): Services {
  return createMockServices({ db: demoDb, latency: [0, 0], now: () => dayAt("2026-10-28", "15:30"), ...options });
}

/** Mock services with Ronit already signed in, so guarded screens render. */
export async function signedInServices(options: MockOptions = {}): Promise<Services> {
  const services = createTestServices(options);
  await services.session.signIn("ronit@example.com", "demo");
  return services;
}

export function createTestClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
}

export function TestProviders({ services, client, children }: { services: Services; client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>
        <MotionRoot>{children}</MotionRoot>
      </ServicesProvider>
    </QueryClientProvider>
  );
}

interface RenderAppOptions {
  path?: string;
  /** Location state for the first entry, like { from: "/customers" }. */
  state?: unknown;
  services?: Services;
}

/** Renders routes with the app's providers in a memory router. */
export function renderApp(routes: RouteObject[], { path = "/", state, services = createTestServices() }: RenderAppOptions = {}) {
  const client = createTestClient();
  const router = createMemoryRouter(routes, { initialEntries: [state === undefined ? path : { pathname: path, state }] });
  const view = render(
    <TestProviders services={services} client={client}>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { ...view, router, services, client };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/data/queries.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the services provider, query hooks and app test helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Desktop shell

**Files:**
- Create: `dashboard/src/content/nav.he.ts`, `dashboard/src/app/sections.ts`, `dashboard/src/app/useShell.ts`, `dashboard/src/app/useNavBadges.ts`, `dashboard/src/app/desktop/Rail.tsx`, `dashboard/src/app/desktop/PillNav.tsx`, `dashboard/src/app/desktop/TopBar.tsx`, `dashboard/src/app/desktop/DesktopShell.tsx`
- Test: `dashboard/src/app/sections.test.ts`, `dashboard/src/app/useShell.test.ts`, `dashboard/src/app/desktop/DesktopShell.test.tsx`

**Interfaces:**
- Consumes:
  - UI components: `Avatar` and `Icon` (Task 5); `MotionLink`, `CountBadge`, `IconButton` and `Field` (Task 6).
  - Motion: `springs`, `PRESS_SCALE` and `AnimatedOutlet` (Task 4).
  - `Scene` (Task 5).
  - Data hooks: `useSession`, `useSignOut`, `useOverview`, `usePassportIntakes` and `useActivity` (Task 10).
  - Test helpers: `renderApp` and `signedInServices` (Task 10).
- Produces:
  - **`sections.ts`:**
    - `DESKTOP_NAV` and `type DesktopNavKey`.
    - `PHONE_TABS` and `type PhoneTabKey`.
    - `isPushedRoute(pathname)`, `parentOf(pathname)`, `phoneTabFor(pathname)`, `desktopPageKey(pathname)`.
  - **`useShell.ts`:** `useShell(): "desktop" | "phone"` (desktop from 1024px) and `DESKTOP_QUERY`.
  - **`useNavBadges.ts`:** `useNavBadges(): { newLeads; passportsToday; notifications }`.
  - **`nav.he.ts`:** the `nav` copy.
  - **Shell:** `<DesktopShell />`, which renders the matched child route through `AnimatedOutlet`.

- [ ] **Step 1: Write the failing tests**

`dashboard/src/app/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { desktopPageKey, isPushedRoute, parentOf, phoneTabFor } from "./sections";

describe("sections", () => {
  it("knows which phone screens slide over the one below", () => {
    expect(isPushedRoute("/customers/c1")).toBe(true);
    expect(isPushedRoute("/leads/l1")).toBe(true);
    expect(isPushedRoute("/users")).toBe(true);
    expect(isPushedRoute("/import")).toBe(true);
    expect(isPushedRoute("/customers")).toBe(false);
    expect(isPushedRoute("/groups/g1")).toBe(false);
  });

  it("finds where a pushed screen goes back to", () => {
    expect(parentOf("/customers/c1")).toBe("/customers");
    expect(parentOf("/leads/l1")).toBe("/leads");
    expect(parentOf("/import")).toBe("/users");
    expect(parentOf("/users")).toBe("/");
  });

  it("maps paths to phone tabs", () => {
    expect(phoneTabFor("/")).toBe("home");
    expect(phoneTabFor("/customers/c1")).toBe("customers");
    expect(phoneTabFor("/greetings/birthdays")).toBe("greetings");
    expect(phoneTabFor("/import")).toBe("home");
  });

  it("keeps the lead panel and the selected group on their desktop page", () => {
    expect(desktopPageKey("/leads/l1")).toBe("/leads");
    expect(desktopPageKey("/groups/g1")).toBe("/groups");
    expect(desktopPageKey("/customers/c1")).toBe("/customers/c1");
  });
});
```

`dashboard/src/app/useShell.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setViewportWidth } from "../test/viewport";
import { useShell } from "./useShell";

describe("useShell", () => {
  it("uses the desktop shell from 1024px", () => {
    setViewportWidth(1024);
    expect(renderHook(() => useShell()).result.current).toBe("desktop");
  });

  it("uses the phone shell below 1024px", () => {
    setViewportWidth(390);
    expect(renderHook(() => useShell()).result.current).toBe("phone");
  });
});
```

`dashboard/src/app/desktop/DesktopShell.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { DesktopShell } from "./DesktopShell";

const routes = [
  {
    path: "/",
    element: <DesktopShell />,
    children: [
      { index: true, element: <h1>overview page</h1> },
      { path: "leads", element: <h1>leads page</h1> },
      { path: "import", element: <h1>import page</h1> },
      { path: "login", element: <h1>login page</h1> },
    ],
  },
];

describe("DesktopShell", () => {
  it("marks the current section in the main menu", async () => {
    renderApp(routes, { path: "/leads", services: await signedInServices() });
    const menu = await screen.findByRole("navigation", { name: "ניווט ראשי" });
    expect(within(menu).getByRole("link", { name: /^לידים/ })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "סקירה" })).not.toHaveAttribute("aria-current");
  });

  it("shows this week's new leads in the menu and today's passports on the rail", async () => {
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("link", { name: "לידים 14" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "דרכונים מוואטסאפ, 3 חדשים" })).toHaveAttribute("href", "/customers?filter=whatsapp");
    expect(await screen.findByRole("button", { name: "התראות, 2 חדשות" })).toBeInTheDocument();
  });

  it("opens a tool from the rail and highlights it", async () => {
    const { router } = renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "ייבוא מ-Monday" }));
    expect(await screen.findByRole("heading", { name: "import page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/import");
    expect(screen.getByRole("link", { name: "ייבוא מ-Monday" })).toHaveAttribute("aria-current", "page");
  });

  it("signs out from the avatar", async () => {
    const { router } = renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("button", { name: "רונית ברש, יציאה מהמערכת" }));
    expect(await screen.findByRole("heading", { name: "login page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app`
Expected: FAIL with `Failed to resolve import "./sections"`, `"./useShell"` and `"./DesktopShell"`.

- [ ] **Step 3: Write the sections, the shell hook and the badges**

`dashboard/src/app/sections.ts`:

```ts
import type { IconName } from "../ui/icons";

export type DesktopNavKey = "overview" | "leads" | "customers" | "groups" | "holidays" | "birthdays";

export const DESKTOP_NAV: Array<{ key: DesktopNavKey; to: string; end?: boolean }> = [
  { key: "overview", to: "/", end: true },
  { key: "leads", to: "/leads" },
  { key: "customers", to: "/customers" },
  { key: "groups", to: "/groups" },
  { key: "holidays", to: "/greetings/holidays" },
  { key: "birthdays", to: "/greetings/birthdays" },
];

export type PhoneTabKey = "home" | "leads" | "customers" | "groups" | "greetings";

export const PHONE_TABS: Array<{ key: PhoneTabKey; to: string; icon: IconName }> = [
  { key: "home", to: "/", icon: "home" },
  { key: "leads", to: "/leads", icon: "leads" },
  { key: "customers", to: "/customers", icon: "customers" },
  { key: "groups", to: "/groups", icon: "groups" },
  { key: "greetings", to: "/greetings/holidays", icon: "greetings" },
];

/** Phone screens that slide over the one below: details, the account screen and the import. */
export function isPushedRoute(pathname: string): boolean {
  return /^\/(leads|customers)\/[^/]+$/.test(pathname) || pathname === "/users" || pathname === "/import";
}

/** Where a pushed screen goes back to when there is no history to pop. */
export function parentOf(pathname: string): string {
  if (pathname.startsWith("/leads/")) return "/leads";
  if (pathname.startsWith("/customers/")) return "/customers";
  if (pathname === "/import") return "/users";
  return "/";
}

/** The phone tab that owns a path. The account screen and the import live under home. */
export function phoneTabFor(pathname: string): PhoneTabKey {
  const first = pathname.split("/")[1] ?? "";
  if (first === "leads" || first === "customers" || first === "groups") return first;
  if (first === "greetings") return "greetings";
  return "home";
}

/** Desktop pages: the lead panel and the selected group stay on their list page, without a page change. */
export function desktopPageKey(pathname: string): string {
  if (pathname.startsWith("/leads")) return "/leads";
  if (pathname.startsWith("/groups")) return "/groups";
  return pathname;
}
```

`dashboard/src/app/useShell.ts`:

```ts
import { useSyncExternalStore } from "react";

export type ShellKind = "desktop" | "phone";

/** The same breakpoint as Tailwind's lg (64rem). */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Which shell to show: the desktop rail and menu from 1024px, the phone tab bar below. */
export function useShell(): ShellKind {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(DESKTOP_QUERY).matches ? "desktop" : "phone"),
    () => "desktop",
  );
}
```

`dashboard/src/app/useNavBadges.ts`:

```ts
import { useActivity, useOverview, usePassportIntakes } from "../data/queries";
import { isoDay, now } from "../lib/clock";

export interface NavBadges {
  /** New leads this week, on the leads menu item. */
  newLeads: number;
  /** Passports that arrived on WhatsApp today, on the rail. */
  passportsToday: number;
  /** Items on the bell: passports waiting for review, and greetings waiting for approval. */
  notifications: number;
}

/** Counts for the menu, the rail and the bell. Zero while loading. */
export function useNavBadges(): NavBadges {
  const overview = useOverview();
  const intakes = usePassportIntakes();
  const activity = useActivity();
  const today = isoDay(now());
  const allIntakes = intakes.data ?? [];
  const passportsWaiting = allIntakes.some((intake) => intake.result === "needs-review") ? 1 : 0;
  const greetingsWaiting = (activity.data ?? []).filter((item) => item.kind === "greeting").length;
  return {
    newLeads: overview.data?.newLeadsThisWeek ?? 0,
    passportsToday: allIntakes.filter((intake) => isoDay(new Date(intake.receivedAt)) === today).length,
    notifications: passportsWaiting + greetingsWaiting,
  };
}
```

`dashboard/src/content/nav.he.ts`:

```ts
import type { DesktopNavKey, PhoneTabKey } from "../app/sections";

export const nav = {
  main: "ניווט ראשי",
  tools: "כלים וניהול",
  items: {
    overview: "סקירה",
    leads: "לידים",
    customers: "לקוחות ודרכונים",
    groups: "קבוצות וטיסות",
    holidays: "ברכות לחגים",
    birthdays: "ימי הולדת",
  } satisfies Record<DesktopNavKey, string>,
  tabs: {
    home: "בית",
    leads: "לידים",
    customers: "לקוחות",
    groups: "קבוצות",
    greetings: "ברכות",
  } satisfies Record<PhoneTabKey, string>,
  whatsappPassports: (count: number) => `דרכונים מוואטסאפ, ${count} חדשים`,
  import: "ייבוא מ-Monday",
  history: "היסטוריית הודעות",
  users: "משתמשים והרשאות",
  settings: "הגדרות",
  search: "חיפוש מהיר",
  notifications: (count: number) => `התראות, ${count} חדשות`,
  signOut: (name: string) => `${name}, יציאה מהמערכת`,
  account: (name: string) => `${name}, חשבון וניהול`,
  back: "חזרה",
} as const;
```

- [ ] **Step 4: Write the desktop shell**

`dashboard/src/app/desktop/PillNav.tsx`:

```tsx
import { LayoutGroup, motion } from "motion/react";
import { NavLink } from "react-router";
import { nav } from "../../content/nav.he";
import { cx } from "../../lib/cx";
import { springs } from "../../motion/springs";
import { DESKTOP_NAV } from "../sections";

/** Glass pill menu. The dark pill glides to the current section. */
export function PillNav({ newLeads }: { newLeads: number }) {
  return (
    <LayoutGroup id="desktop-nav">
      <nav aria-label={nav.main} className="surface-glass flex flex-wrap items-center gap-0.5 rounded-full p-1.5">
        {DESKTOP_NAV.map((item) => (
          <NavLink key={item.key} to={item.to} end={item.end} className="relative inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-[14.5px] font-medium whitespace-nowrap">
            {({ isActive }) => (
              <>
                {isActive ? <motion.span layoutId="pill" transition={springs.ui} className="absolute inset-0 rounded-full bg-ink" /> : null}
                <span className={cx("relative", isActive ? "text-cream" : "text-copy")}>{nav.items[item.key]}</span>
                {item.key === "leads" && newLeads > 0 ? (
                  <>
                    {" "}
                    <span className={cx("relative grid h-[22px] min-w-6 place-items-center rounded-full px-[7px] text-[12px] font-semibold", isActive ? "bg-white/18 text-cream" : "bg-ink/8 text-ink")}>
                      {newLeads}
                    </span>
                  </>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </LayoutGroup>
  );
}
```

`dashboard/src/app/desktop/TopBar.tsx`:

```tsx
import { nav } from "../../content/nav.he";
import { Field } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { PillNav } from "./PillNav";

/** Fixed top bar: the menu, search and notifications. */
export function TopBar({ newLeads, notifications }: { newLeads: number; notifications: number }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-4">
      <PillNav newLeads={newLeads} />
      <div className="flex items-center gap-3">
        <Field label={nav.search} icon="search" name="q" type="search" size="sm" className="w-[270px]" />
        <IconButton icon="bell" label={nav.notifications(notifications)} badge={notifications} />
      </div>
    </header>
  );
}
```

`dashboard/src/app/desktop/Rail.tsx`:

```tsx
import { motion } from "motion/react";
import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { common } from "../../content/common.he";
import { nav } from "../../content/nav.he";
import { useSession, useSignOut } from "../../data/queries";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { CountBadge } from "../../ui/CountBadge";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { MotionLink } from "../../ui/MotionLink";

interface RailLinkProps {
  to: string;
  icon: IconName;
  label: string;
  badge?: number;
  /** Highlight while its page is open. Only for tools; sections are highlighted in the menu. */
  showActive?: boolean;
}

function RailLink({ to, icon, label, badge, showActive = false }: RailLinkProps) {
  const { pathname } = useLocation();
  const active = showActive && pathname === to;
  return (
    <MotionLink
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className={cx("relative grid size-[52px] place-items-center rounded-full transition-colors", active ? "bg-ink text-cream" : "text-copy hover:bg-white/75 hover:text-ink")}
    >
      <Icon name={icon} />
      {badge ? <CountBadge count={badge} /> : null}
    </MotionLink>
  );
}

/** Glass rail on the right: the logo, tools, and Ronit's avatar to sign out. */
export function Rail({ passportsToday }: { passportsToday: number }) {
  const session = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const user = session.data?.user;
  return (
    <aside aria-label={nav.tools} className="surface-glass mb-5 flex w-[84px] shrink-0 flex-col items-center gap-2 self-stretch rounded-[42px] py-4">
      <img src={logoUrl} alt={common.brandFull} className="mt-0.5 mb-3 w-[62px]" />
      <RailLink to="/customers?filter=whatsapp" icon="chat" label={nav.whatsappPassports(passportsToday)} badge={passportsToday} />
      <RailLink to="/import" icon="import" label={nav.import} showActive />
      <RailLink to="/greetings/holidays#history" icon="history" label={nav.history} />
      <RailLink to="/users" icon="users" label={nav.users} showActive />
      <span className="flex-1" />
      <RailLink to="/users" icon="settings" label={nav.settings} />
      <motion.button
        type="button"
        aria-label={nav.signOut(user?.name ?? common.owner)}
        whileTap={{ scale: PRESS_SCALE }}
        transition={springs.ui}
        onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate("/login", { replace: true }) })}
        className="rounded-full"
      >
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </motion.button>
    </aside>
  );
}
```

`dashboard/src/app/desktop/DesktopShell.tsx`:

```tsx
import { AnimatedOutlet } from "../../motion/AnimatedOutlet";
import { Scene } from "../../ui/Scene";
import { desktopPageKey } from "../sections";
import { useNavBadges } from "../useNavBadges";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";

/** Desktop frame: the glass rail on the right and the menu on top stay put; only the content scrolls. */
export function DesktopShell() {
  const badges = useNavBadges();
  return (
    <div className="relative h-dvh overflow-hidden">
      <Scene preset="app" />
      <div className="relative mx-auto flex h-full max-w-[1440px] gap-6 px-6 pt-5">
        <Rail passportsToday={badges.passportsToday} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar newLeads={badges.newLeads} notifications={badges.notifications} />
          <main className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-9">
            <AnimatedOutlet pageKey={desktopPageKey} />
          </main>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app`
Expected: PASS, 3 files and 10 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the desktop shell: glass rail, pill menu with gliding highlight, page transitions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Phone shell

**Files:**
- Create: `dashboard/src/app/phone/TabBar.tsx`, `dashboard/src/app/phone/PhoneTopBar.tsx`, `dashboard/src/app/phone/PhoneShell.tsx`
- Test: `dashboard/src/app/phone/PhoneShell.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 11: `PHONE_TABS`, `phoneTabFor`, `isPushedRoute`, `parentOf`, `useNavBadges` and `nav`.
  - `StackOutlet` (Task 4).
  - UI pieces: `Scene`, `Avatar` and `Icon` (Task 5); `IconButton` and `MotionLink` (Task 6).
  - `useSession` (Task 10).
  - Test helpers: `renderApp` and `signedInServices` (Task 10); `setViewportWidth` (Task 1).
- Produces:
  - `<PhoneShell />` renders child routes through `StackOutlet`, with a floating `<TabBar />` on top.
  - `<PhoneTopBar title? />` behaves differently by screen:
    - On top-level screens it shows the avatar (a link to `/users`), the logo and the bell.
    - On pushed screens it shows a back button ("חזרה"). The button pops the history; when the screen was opened directly, it replaces the entry with the parent and `state: { direction: "back" }`.

- [ ] **Step 1: Write the failing test**

`dashboard/src/app/phone/PhoneShell.test.tsx`:

```tsx
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { setViewportWidth } from "../../test/viewport";
import { PhoneShell } from "./PhoneShell";
import { PhoneTopBar } from "./PhoneTopBar";

const routes = [
  {
    path: "/",
    element: <PhoneShell />,
    children: [
      { index: true, element: (<><PhoneTopBar /><h1>home screen</h1></>) },
      { path: "customers", element: (<><PhoneTopBar /><h1>customers screen</h1></>) },
      { path: "customers/:id", element: (<><PhoneTopBar title="customer card" /><h1>profile screen</h1></>) },
      { path: "users", element: <h1>account screen</h1> },
    ],
  },
];

describe("PhoneShell", () => {
  beforeEach(() => setViewportWidth(390));

  it("switches tabs and marks the current one", async () => {
    renderApp(routes, { services: await signedInServices() });
    const tabs = await screen.findByRole("navigation", { name: "ניווט ראשי" });
    expect(within(tabs).getByRole("link", { name: "בית" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(tabs).getByRole("link", { name: "לקוחות" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: "לקוחות" })).toHaveAttribute("aria-current", "page");
  });

  it("pushes a detail screen and goes back to the list", async () => {
    const { router } = renderApp(routes, { path: "/customers", services: await signedInServices() });
    await screen.findByRole("heading", { name: "customers screen" });
    await act(() => router.navigate("/customers/c-sara-cohen"));
    expect(await screen.findByRole("heading", { name: "profile screen" })).toBeInTheDocument();
    expect(screen.getByText("customer card")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/customers");
  });

  it("goes back to the parent when a pushed screen was opened directly", async () => {
    const { router } = renderApp(routes, { path: "/customers/c-sara-cohen", services: await signedInServices() });
    await userEvent.click(await screen.findByRole("button", { name: "חזרה" }));
    expect(await screen.findByRole("heading", { name: "customers screen" })).toBeInTheDocument();
    expect(router.state.location.state).toEqual({ direction: "back" });
  });

  it("opens the account screen from the avatar", async () => {
    renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "רונית ברש, חשבון וניהול" }));
    expect(await screen.findByRole("heading", { name: "account screen" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/phone`
Expected: FAIL with `Failed to resolve import "./PhoneShell"`.

- [ ] **Step 3: Write the tab bar, the top bar and the shell**

`dashboard/src/app/phone/TabBar.tsx`:

```tsx
import { LayoutGroup, motion } from "motion/react";
import { useLocation } from "react-router";
import { nav } from "../../content/nav.he";
import { cx } from "../../lib/cx";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Icon } from "../../ui/Icon";
import { MotionLink } from "../../ui/MotionLink";
import { PHONE_TABS, phoneTabFor } from "../sections";

/** Floating glass tab bar. The dark highlight glides to the current tab. */
export function TabBar() {
  const { pathname } = useLocation();
  const current = phoneTabFor(pathname);
  return (
    <LayoutGroup id="tab-bar">
      <nav aria-label={nav.main} className="surface-glass absolute inset-x-3.5 bottom-4 z-20 flex gap-0.5 rounded-[32px] p-1.5" style={{ boxShadow: "var(--shadow-float)" }}>
        {PHONE_TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <MotionLink
              key={tab.key}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              whileTap={{ scale: PRESS_SCALE }}
              transition={springs.ui}
              className="relative flex h-14 flex-1 flex-col items-center justify-center rounded-[26px] text-[11.5px] font-medium"
            >
              {active ? <motion.span layoutId="tab-highlight" transition={springs.ui} className="absolute inset-0 rounded-[26px] bg-ink" /> : null}
              <span className={cx("relative flex flex-col items-center gap-0.5", active ? "text-cream" : "text-copy")}>
                <Icon name={tab.icon} />
                {nav.tabs[tab.key]}
              </span>
            </MotionLink>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
```

`dashboard/src/app/phone/PhoneTopBar.tsx`:

```tsx
import { useLocation, useNavigate } from "react-router";
import logoUrl from "../../assets/logo.png";
import { common } from "../../content/common.he";
import { nav } from "../../content/nav.he";
import { useSession } from "../../data/queries";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Avatar } from "../../ui/Avatar";
import { IconButton } from "../../ui/IconButton";
import { MotionLink } from "../../ui/MotionLink";
import { isPushedRoute, parentOf } from "../sections";
import { useNavBadges } from "../useNavBadges";

/** Top of a phone screen: avatar, logo and bell on top-level screens; a back arrow and a title on pushed ones. */
export function PhoneTopBar({ title }: { title?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const badges = useNavBadges();
  const user = session.data?.user;

  if (isPushedRoute(location.pathname)) {
    const goBack = () => {
      // With history inside the app, pop it so the screen slides back. Opened directly, go to the parent.
      if (location.key !== "default") navigate(-1);
      else navigate(parentOf(location.pathname), { replace: true, state: { direction: "back" } });
    };
    return (
      <header className="flex min-h-[52px] items-center justify-between gap-2.5">
        <IconButton icon="back" label={nav.back} onClick={goBack} />
        {title ? <p className="text-[16px] font-medium text-ink">{title}</p> : null}
        <span aria-hidden="true" className="size-12" />
      </header>
    );
  }

  return (
    <header className="flex min-h-[52px] items-center justify-between gap-2.5">
      <MotionLink to="/users" aria-label={nav.account(user?.name ?? common.owner)} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui} className="rounded-full">
        <Avatar initial={user?.initial ?? common.owner.charAt(0)} gold size="md" />
      </MotionLink>
      <img src={logoUrl} alt={common.brandFull} className="w-14" />
      <IconButton icon="bell" label={nav.notifications(badges.notifications)} badge={badges.notifications} />
    </header>
  );
}
```

`dashboard/src/app/phone/PhoneShell.tsx`:

```tsx
import { StackOutlet } from "../../motion/StackOutlet";
import { Scene } from "../../ui/Scene";
import { isPushedRoute } from "../sections";
import { TabBar } from "./TabBar";

/** Phone frame: screens stack and slide, and the glass tab bar floats above them. */
export function PhoneShell() {
  return (
    <div className="relative h-dvh overflow-hidden">
      <Scene preset="phone" />
      <StackOutlet isPushed={isPushedRoute} className="h-full" />
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/app/phone`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the phone shell: floating tab bar and push and pop screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Sign-in screen

**Files:**
- Create: `dashboard/src/content/signIn.he.ts`, `dashboard/src/screens/shared/TodayCard.tsx`, `dashboard/src/screens/sign-in/SignInScreen.tsx`
- Test: `dashboard/src/screens/sign-in/SignInScreen.test.tsx`

**Interfaces:**
- Consumes:
  - UI: `OrbCard`, `Surface`, `Headline` and `Scene` (Task 5); `Field` and `GooButton` (Task 6).
  - Motion: `staggerVariants` (Task 4).
  - Data and shell: `useSignIn` (Task 10) and `useShell` (Task 11).
  - Dates: `today`, `formatWeekday`, `formatDayMonth`, `formatHebrewDate`, `nextHoliday`, `holidayNames` and `holidayCountdown` (Task 3).
  - Test helpers: `renderApp` and `createTestServices` (Task 10).
- Produces:
  - `<TodayCard day label size?="tall"|"regular"|"compact" footer? side? className? />`: an orb card showing the weekday, dd.mm, the Hebrew date and the holiday countdown.
  - `<SignInScreen />`:
    - Any email and password signs in, then goes to `location.state.from`, or `/`.
    - "שכחתי" and "צריכים עזרה?" show their notice in a `role="status"` line. The spec's sheets come with the global-controls work later.

- [ ] **Step 1: Write the failing test**

`dashboard/src/screens/sign-in/SignInScreen.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp } from "../../test/app";
import { SignInScreen } from "./SignInScreen";

const routes = [
  { path: "/login", element: <SignInScreen /> },
  { path: "/", element: <h1>overview</h1> },
  { path: "/customers", element: <h1>customers</h1> },
];

describe("SignInScreen", () => {
  it("signs in and returns to the page that sent the visitor here", async () => {
    const services = createTestServices();
    renderApp(routes, { path: "/login", state: { from: "/customers" }, services });
    await userEvent.type(await screen.findByLabelText("כתובת אימייל"), "ronit@example.com");
    await userEvent.type(screen.getByLabelText("סיסמה"), "demo");
    await userEvent.click(screen.getByRole("button", { name: "כניסה" }));
    expect(await screen.findByRole("heading", { name: "customers" })).toBeInTheDocument();
    expect(await services.session.current()).not.toBeNull();
  });

  it("shows the forgot-password and help notices", async () => {
    renderApp(routes, { path: "/login" });
    await userEvent.click(await screen.findByRole("button", { name: "שכחתי" }));
    expect(screen.getByRole("status")).toHaveTextContent("שלחנו קישור לאיפוס הסיסמה לכתובת האימייל.");
    await userEvent.click(screen.getByRole("button", { name: "צריכים עזרה?" }));
    expect(screen.getByRole("status")).toHaveTextContent("אפשר לפנות למשרד בוואטסאפ או בטלפון.");
  });

  it("counts down to the next holiday on the date card", async () => {
    renderApp(routes, { path: "/login" });
    const card = await screen.findByRole("region", { name: "היום" });
    expect(card).toHaveTextContent("רביעי");
    expect(card).toHaveTextContent("28.10");
    expect(card).toHaveTextContent("י״ז בחשוון תשפ״ז");
    expect(within(card).getByText("חנוכה בעוד 37 ימים")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/screens/sign-in`
Expected: FAIL with `Failed to resolve import "./SignInScreen"`.

- [ ] **Step 3: Write the copy and the date card**

`dashboard/src/content/signIn.he.ts`:

```ts
export const signIn = {
  brand: "אור הצדיק",
  help: "צריכים עזרה?",
  title: "כניסה",
  email: "כתובת אימייל",
  password: "סיסמה",
  forgot: "שכחתי",
  remember: "לזכור אותי במכשיר הזה",
  privacy: "הגישה מותרת למשתמשים מורשים בלבד. כל צפייה בדרכון נשמרת ביומן הגישה.",
  submit: "כניסה",
  twoStep: "כניסה מאובטחת עם אימות דו-שלבי",
  allInOne: {
    title: "הכל במקום אחד",
    soft: "לידים, דרכונים וברכות",
    line: "מהשיחה הראשונה ועד הברכה ליום ההולדת",
  },
  system: { first: "מערכת הניהול", second: "של אור הצדיק" },
  site: { label: "orhazadik.online", url: "https://orhazadik.online" },
  today: "היום",
  greetingsOnTheWay: "הברכות לחג כבר בדרך",
  forgotNotice: "שלחנו קישור לאיפוס הסיסמה לכתובת האימייל.",
  helpNotice: "אפשר לפנות למשרד בוואטסאפ או בטלפון.",
  failed: "לא הצלחנו להיכנס. כדאי לנסות שוב.",
} as const;
```

`dashboard/src/screens/shared/TodayCard.tsx`:

```tsx
import type { ReactNode } from "react";
import { holidayCountdown, holidayNames } from "../../content/holidays.he";
import { cx } from "../../lib/cx";
import { formatDayMonth, formatWeekday } from "../../lib/format";
import { formatHebrewDate } from "../../lib/hebrew";
import { nextHoliday } from "../../lib/holidays";
import { OrbCard } from "../../ui/OrbCard";

type TodayCardSize = "tall" | "regular" | "compact";

const LAYOUT: Record<TodayCardSize, { orb: { size: number; end: number; top: number }; stripBasis: string; dayClass: string }> = {
  tall: { orb: { size: 290, end: 28, top: 180 }, stripBasis: "55%", dayClass: "text-[76px] leading-none" },
  regular: { orb: { size: 220, end: 66, top: 74 }, stripBasis: "55%", dayClass: "text-display" },
  compact: { orb: { size: 170, end: 92, top: 40 }, stripBasis: "50%", dayClass: "text-[44px] leading-none" },
};

interface TodayCardProps {
  day: Date;
  label: string;
  size?: TodayCardSize;
  /** Lines under the holiday countdown, inside the frosted strip. */
  footer?: ReactNode;
  /** Content of the white side. */
  side?: ReactNode;
  className?: string;
}

/** The orb card with the weekday, the date, the Hebrew date and the next holiday. */
export function TodayCard({ day, label, size = "regular", footer, side, className }: TodayCardProps) {
  const layout = LAYOUT[size];
  const holiday = nextHoliday(day);
  return (
    <OrbCard
      label={label}
      compact={size === "compact"}
      orb={layout.orb}
      stripBasis={layout.stripBasis}
      className={className}
      side={side}
      strip={
        <>
          <p className={cx("font-light text-ink", layout.dayClass)}>
            {formatWeekday(day)}{" "}
            <br />
            <span className="text-faint">{formatDayMonth(day)}</span>
          </p>
          <p className="mt-2 text-small text-mute-2">{formatHebrewDate(day)}</p>
          <span className="flex-1" />
          <p className="font-medium text-ink">{holidayCountdown(holidayNames[holiday.key], holiday.daysToEve)}</p>
          {footer}
        </>
      }
    />
  );
}
```

- [ ] **Step 4: Write the sign-in screen**

`dashboard/src/screens/sign-in/SignInScreen.tsx`:

```tsx
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useShell } from "../../app/useShell";
import logoUrl from "../../assets/logo.png";
import { common } from "../../content/common.he";
import { signIn as copy } from "../../content/signIn.he";
import { useSignIn } from "../../data/queries";
import { today } from "../../lib/clock";
import { staggerVariants } from "../../motion/variants";
import { Field } from "../../ui/Field";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { Scene } from "../../ui/Scene";
import { Surface } from "../../ui/Surface";
import { TodayCard } from "../shared/TodayCard";

type Notice = "forgot" | "help" | null;

/** Sign in, composed like the reference: the frosted card, the black card and the tall orb card. */
export function SignInScreen() {
  const phone = useShell() === "phone";
  const navigate = useNavigate();
  const location = useLocation();
  const signInMutation = useSignIn();
  const [notice, setNotice] = useState<Notice>(null);
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    signInMutation.mutate(
      { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") },
      { onSuccess: () => navigate(returnTo, { replace: true }) },
    );
  };

  const message = signInMutation.isError ? copy.failed : notice === "forgot" ? copy.forgotNotice : notice === "help" ? copy.helpNotice : "";

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Scene preset={phone ? "phone" : "login"} />
      <motion.main
        initial="initial"
        animate="enter"
        variants={staggerVariants}
        className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-[18px] py-10 lg:flex-row lg:gap-5 lg:px-5 lg:py-8"
      >
        <img src={logoUrl} alt={common.brandFull} className="w-24 lg:hidden" />
        <div className="flex w-full max-w-[440px] flex-col gap-4 lg:h-[600px] lg:gap-5">
          <Surface variant="glass" compact={phone} aria-label={copy.title} className="lg:px-[30px] lg:pt-[26px] lg:pb-[22px]">
            <div className="flex items-center justify-between">
              <p className="text-mute-2">{copy.brand}</p>
              <button type="button" onClick={() => setNotice("help")} className="text-small font-medium text-ink underline decoration-ink/30 underline-offset-4">
                {copy.help}
              </button>
            </div>
            <Headline title={copy.title} size="display-3" className="mt-7 mb-5" />
            <form onSubmit={submit} className="flex flex-col gap-3">
              <Field label={copy.email} icon="at" name="email" type="email" autoComplete="username" required />
              <Field
                label={copy.password}
                icon="key"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                trailing={
                  <button type="button" onClick={() => setNotice("forgot")} className="inline-flex h-[42px] items-center rounded-full bg-paper px-4 text-small font-medium text-ink">
                    {copy.forgot}
                  </button>
                }
              />
              <label className="flex items-center gap-2.5 px-2 text-small text-mute-2">
                <input type="checkbox" name="remember" defaultChecked className="size-[18px] accent-ink" />
                {copy.remember}
              </label>
              <div className="mt-4 flex items-end justify-between gap-5">
                <p className="max-w-[230px] text-caption text-mute-2">{copy.privacy}</p>
                <GooButton type="submit" disabled={signInMutation.isPending}>
                  {copy.submit}
                </GooButton>
              </div>
            </form>
            <p role="status" className="mt-4 min-h-5 text-center text-caption text-ink">
              {message}
            </p>
            <p className="mt-1 text-center text-caption text-mute-2">{copy.twoStep}</p>
          </Surface>
          <Surface variant="ink" compact={phone} aria-label={copy.allInOne.title} className="flex flex-1 flex-col justify-between gap-4">
            <Headline title={copy.allInOne.title} soft={copy.allInOne.soft} size="display-3" level={2} onDark />
            <p className="hidden text-end text-small text-ink-mute lg:block">{copy.allInOne.line}</p>
          </Surface>
        </div>
        <div className="hidden h-[600px] w-[380px] lg:block">
          <TodayCard
            day={today()}
            label={copy.today}
            size="tall"
            className="h-full"
            footer={
              <>
                <p className="text-small text-copy">{copy.greetingsOnTheWay}</p>
                <span className="flex-1" />
                <img src={logoUrl} alt="" className="w-[84px] self-center" />
              </>
            }
            side={
              <>
                <p className="text-small text-mute">
                  {copy.system.first}
                  <br />
                  {copy.system.second}
                </p>
                <a href={copy.site.url} className="text-caption font-medium text-ink underline decoration-ink/30 underline-offset-4">
                  {copy.site.label}
                </a>
              </>
            }
          />
        </div>
      </motion.main>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/screens/sign-in`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the sign-in screen and the shared date card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Put the app together: routes, sign-in guard and placeholders

**Files:**
- Create: `dashboard/src/content/screens.he.ts`, `dashboard/src/ui/ScreenFrame.tsx`, `dashboard/src/screens/Placeholder.tsx`, `dashboard/src/app/AppProviders.tsx`, `dashboard/src/app/RequireSession.tsx`, `dashboard/src/app/Shell.tsx`, `dashboard/src/app/routes.tsx`
- Modify: `dashboard/src/app/App.tsx` (replace)
- Delete: `dashboard/src/app/App.test.tsx`
- Test: `dashboard/src/app/routes.test.tsx`

**Interfaces:**
- Consumes:
  - Shells: `DesktopShell` (Task 11), `PhoneShell` and `PhoneTopBar` (Task 12).
  - `SignInScreen` (Task 13).
  - Data: `useSession`, `createQueryClient`, `ServicesProvider`, `createMockServices` and `failingFromSearch` (Tasks 9 and 10).
  - UI: `LoadingBlock` and `EmptyState` (Task 7); `Headline` and `Surface` (Task 5).
  - Motion: `MotionRoot` and `staggerVariants` (Task 4).
- Produces:
  - `routes: RouteObject[]`:
    - `/login` is outside the guard.
    - Everything else sits under `RequireSession`, then `Shell`, and renders `Placeholder` (the index route becomes the overview in Task 15).
    - `/greetings` redirects to `/greetings/holidays`.
    - Unknown paths redirect to `/`.
  - `<ScreenFrame className?>` is a screen's content column with staggered cards and phone padding for the tab bar.
  - `type ScreenKey`, `screens` and `comingSoon`.
  - `<App />` runs the browser router inside `AppProviders`.

- [ ] **Step 1: Write the failing test and remove the scaffold test**

```bash
cd /d/work/RONIT-AUTOMATION
git rm dashboard/src/app/App.test.tsx
```

`dashboard/src/app/routes.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestServices, renderApp, signedInServices } from "../test/app";
import { setViewportWidth } from "../test/viewport";
import { routes } from "./routes";

describe("routes", () => {
  it("sends visitors without a session to sign in, remembering where they were going", async () => {
    const { router } = renderApp(routes, { path: "/customers", services: createTestServices() });
    expect(await screen.findByRole("heading", { level: 1, name: /כניסה/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.state).toEqual({ from: "/customers" });
  });

  it("opens the overview in the desktop shell after sign in", async () => {
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: "שלום, רונית בואי נראה מה קורה היום" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "כלים וניהול" })).toBeInTheDocument();
  });

  it("deep-links to a customer card", async () => {
    renderApp(routes, { path: "/customers/c-sara-cohen", services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: "כרטיס לקוח" })).toBeInTheDocument();
  });

  it("redirects /greetings to the holiday greetings", async () => {
    const { router } = renderApp(routes, { path: "/greetings", services: await signedInServices() });
    expect(await screen.findByRole("heading", { name: /ברכות לחגים/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/greetings/holidays");
  });

  it("uses the tab bar on phones", async () => {
    setViewportWidth(390);
    renderApp(routes, { services: await signedInServices() });
    expect(await screen.findByRole("link", { name: "בית" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("complementary", { name: "כלים וניהול" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/app/routes.test.tsx`
Expected: FAIL with `Failed to resolve import "./routes"`.

- [ ] **Step 3: Write the screen frame, the copy and the placeholder**

`dashboard/src/content/screens.he.ts`:

```ts
export type ScreenKey =
  | "overview"
  | "leads"
  | "lead"
  | "customers"
  | "customer"
  | "groups"
  | "holidays"
  | "birthdays"
  | "users"
  | "account"
  | "import";

export const screens: Record<ScreenKey, { title: string; soft?: string }> = {
  overview: { title: "שלום, רונית", soft: "בואי נראה מה קורה היום" },
  leads: { title: "לידים", soft: "מהשיחה הראשונה ועד ההרשמה" },
  lead: { title: "פרטי ליד" },
  customers: { title: "לקוחות ודרכונים", soft: "כל הלקוחות והדרכונים" },
  customer: { title: "כרטיס לקוח" },
  groups: { title: "קבוצות וטיסות", soft: "טיסות ואירועים פעילים" },
  holidays: { title: "ברכות לחגים", soft: "כתיבה, בדיקה ושליחה" },
  birthdays: { title: "ימי הולדת", soft: "ברכה אוטומטית בוואטסאפ" },
  users: { title: "משתמשים והרשאות", soft: "מי נכנס ומה רואים" },
  account: { title: "חשבון וניהול" },
  import: { title: "ייבוא מ-Monday.com", soft: "העברה חד-פעמית" },
};

export const comingSoon = "המסך הזה ייבנה בשלב הבא.";
```

`dashboard/src/ui/ScreenFrame.tsx`:

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cx } from "../lib/cx";
import { staggerVariants } from "../motion/variants";

/** A screen's content column: cards settle in one after another. Below lg it leaves room for the tab bar. */
export function ScreenFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial="initial"
      animate="enter"
      variants={staggerVariants}
      className={cx("flex flex-col gap-3.5 px-4 pt-3.5 pb-[124px] lg:gap-[22px] lg:px-0 lg:pt-0 lg:pb-0", className)}
    >
      {children}
    </motion.div>
  );
}
```

`dashboard/src/screens/Placeholder.tsx`:

```tsx
import { useLocation } from "react-router";
import { PhoneTopBar } from "../app/phone/PhoneTopBar";
import { isPushedRoute } from "../app/sections";
import { useShell } from "../app/useShell";
import { comingSoon, screens, type ScreenKey } from "../content/screens.he";
import { Headline } from "../ui/Headline";
import { ScreenFrame } from "../ui/ScreenFrame";
import { EmptyState } from "../ui/states";
import { Surface } from "../ui/Surface";

/** Stands in for a screen that is built in a later phase. On phones /users is the account screen. */
export function Placeholder({ screen }: { screen: ScreenKey }) {
  const phone = useShell() === "phone";
  const { pathname } = useLocation();
  const copy = screens[phone && screen === "users" ? "account" : screen];
  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar title={isPushedRoute(pathname) ? copy.title : undefined} /> : null}
      <Headline title={copy.title} soft={copy.soft} size={phone ? "display-2" : "display"} />
      <Surface variant="glass" compact={phone} aria-label={copy.title}>
        <EmptyState message={comingSoon} />
      </Surface>
    </ScreenFrame>
  );
}
```

- [ ] **Step 4: Write the providers, the guard, the shell switch and the routes**

`dashboard/src/app/AppProviders.tsx`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createMockServices, failingFromSearch } from "../data/mock/createMockServices";
import { createQueryClient } from "../data/queryClient";
import { ServicesProvider } from "../data/ServicesProvider";
import { MotionRoot } from "../motion/MotionRoot";

/** Data, the query cache and motion defaults for the whole app. The shell runs on the mock services. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  const [services] = useState(() =>
    createMockServices({ failing: import.meta.env.DEV ? failingFromSearch(window.location.search) : undefined }),
  );
  return (
    <QueryClientProvider client={client}>
      <ServicesProvider services={services}>
        <MotionRoot>{children}</MotionRoot>
      </ServicesProvider>
    </QueryClientProvider>
  );
}
```

`dashboard/src/app/RequireSession.tsx`:

```tsx
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useSession } from "../data/queries";
import { LoadingBlock } from "../ui/states";

/** Sends visitors without a session to sign in, and back to where they were going afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <LoadingBlock className="mx-auto max-w-md p-10" />;
  if (!session.data) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}
```

`dashboard/src/app/Shell.tsx`:

```tsx
import { DesktopShell } from "./desktop/DesktopShell";
import { PhoneShell } from "./phone/PhoneShell";
import { useShell } from "./useShell";

/** The desktop shell from 1024px, the phone shell below. */
export function Shell() {
  return useShell() === "desktop" ? <DesktopShell /> : <PhoneShell />;
}
```

`dashboard/src/app/routes.tsx`:

```tsx
import { Navigate, type RouteObject } from "react-router";
import { Placeholder } from "../screens/Placeholder";
import { SignInScreen } from "../screens/sign-in/SignInScreen";
import { RequireSession } from "./RequireSession";
import { Shell } from "./Shell";

export const routes: RouteObject[] = [
  { path: "/login", element: <SignInScreen /> },
  {
    path: "/",
    element: (
      <RequireSession>
        <Shell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Placeholder screen="overview" /> },
      { path: "leads", element: <Placeholder screen="leads" /> },
      { path: "leads/:leadId", element: <Placeholder screen="lead" /> },
      { path: "customers", element: <Placeholder screen="customers" /> },
      { path: "customers/:customerId", element: <Placeholder screen="customer" /> },
      { path: "groups", element: <Placeholder screen="groups" /> },
      { path: "groups/:groupId", element: <Placeholder screen="groups" /> },
      { path: "greetings", element: <Navigate to="/greetings/holidays" replace /> },
      { path: "greetings/holidays", element: <Placeholder screen="holidays" /> },
      { path: "greetings/birthdays", element: <Placeholder screen="birthdays" /> },
      { path: "users", element: <Placeholder screen="users" /> },
      { path: "import", element: <Placeholder screen="import" /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];
```

Replace `dashboard/src/app/App.tsx` with:

```tsx
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppProviders } from "./AppProviders";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/routes.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the checks, the build and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

Run: `npm run build`
Expected: `✓ built in …`.

```bash
cd /d/work/RONIT-AUTOMATION
git add -A dashboard
git commit -m "Assemble the app: routes, sign-in guard, shell switch and placeholder screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Overview screen (first version)

**Files:**
- Create: `dashboard/src/content/overview.he.ts`, `dashboard/src/screens/overview/OverviewScreen.tsx`
- Modify: `dashboard/src/app/routes.tsx` (the index route)
- Test: `dashboard/src/screens/overview/OverviewScreen.test.tsx`

**Interfaces:**
- Consumes:
  - Data and shell: `useOverview` (Task 10), `useShell` (Task 11) and `PhoneTopBar` (Task 12).
  - Screens: `TodayCard` (Task 13) and `ScreenFrame` (Task 14).
  - UI: `Surface` and `Headline` (Task 5), `GooButton` (Task 6), and `LoadingBlock`, `ErrorState` and `EmptyState` (Task 7).
  - Formatting: `formatNumber` (Task 3).
- Produces: `<OverviewScreen />`, which shows:
  - the greeting and three key numbers (open leads, customers, active groups)
  - a black "this week" card with the count, the status breakdown and "לכל הלידים"
  - the today orb card
  - a glass card saying the rest of the overview comes later
  - a loading state, and an error state with a retry

- [ ] **Step 1: Write the failing test**

`dashboard/src/screens/overview/OverviewScreen.test.tsx`:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp, signedInServices } from "../../test/app";
import { OverviewScreen } from "./OverviewScreen";

const routes = [
  { path: "/", element: <OverviewScreen /> },
  { path: "/leads", element: <h1>leads</h1> },
];

describe("OverviewScreen", () => {
  it("shows this week's leads and the key numbers", async () => {
    renderApp(routes, { services: await signedInServices() });
    const week = await screen.findByRole("region", { name: "לידים השבוע" });
    expect(await within(week).findByText("14")).toBeInTheDocument();
    expect(week).toHaveTextContent("6 חדשים · 5 בשיחה · 3 נרשמו");
    const numbers = screen.getByLabelText("המספרים של היום");
    expect(numbers).toHaveTextContent("לידים פתוחים24");
    expect(numbers).toHaveTextContent("לקוחות412");
    expect(numbers).toHaveTextContent("קבוצות פעילות4");
  });

  it("offers a retry when the numbers fail to load", async () => {
    renderApp(routes, { services: await signedInServices({ failing: new Set(["overview"] as const) }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("משהו השתבש בטעינה.");
    expect(screen.getByRole("button", { name: "לנסות שוב" })).toBeInTheDocument();
  });

  it("opens all leads from the week card", async () => {
    renderApp(routes, { services: await signedInServices() });
    await userEvent.click(await screen.findByRole("link", { name: "לכל הלידים" }));
    expect(await screen.findByRole("heading", { name: "leads" })).toBeInTheDocument();
  });

  it("shows today with the Hebrew date and the next holiday", async () => {
    renderApp(routes, { services: await signedInServices() });
    const todayCard = await screen.findByRole("region", { name: "היום" });
    expect(todayCard).toHaveTextContent("י״ז בחשוון תשפ״ז");
    expect(todayCard).toHaveTextContent("חנוכה בעוד 37 ימים");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/screens/overview`
Expected: FAIL with `Failed to resolve import "./OverviewScreen"`.

- [ ] **Step 3: Write the copy and the screen**

`dashboard/src/content/overview.he.ts`:

```ts
export const overview = {
  title: "שלום, רונית",
  soft: "בואי נראה מה קורה היום",
  softPhone: "מה קורה היום?",
  numbersLabel: "המספרים של היום",
  numbers: { openLeads: "לידים פתוחים", customers: "לקוחות", activeGroups: "קבוצות פעילות" },
  pending: "…",
  weekTitle: "לידים השבוע",
  breakdown: (counts: { new: number; talking: number; registered: number }) =>
    `${counts.new} חדשים · ${counts.talking} בשיחה · ${counts.registered} נרשמו`,
  allLeads: "לכל הלידים",
  today: "היום",
  sideNote: "היום בעסק",
  restTitle: "עוד בסקירה",
  rest: "שאר הסקירה תיבנה בשלב הבא: לידים אחרונים, קבוצות, דרכונים ופעילות.",
} as const;
```

`dashboard/src/screens/overview/OverviewScreen.tsx`:

```tsx
import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useShell } from "../../app/useShell";
import { overview as copy } from "../../content/overview.he";
import { useOverview } from "../../data/queries";
import { today } from "../../lib/clock";
import { formatNumber } from "../../lib/format";
import { GooButton } from "../../ui/GooButton";
import { Headline } from "../../ui/Headline";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { TodayCard } from "../shared/TodayCard";

const NUMBER_KEYS = ["openLeads", "customers", "activeGroups"] as const;

/** The overview, first version: greeting, key numbers, this week's leads and today. The rest comes later. */
export function OverviewScreen() {
  const phone = useShell() === "phone";
  const stats = useOverview();
  const data = stats.data;
  return (
    <ScreenFrame>
      {phone ? <PhoneTopBar /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <Headline title={copy.title} soft={phone ? copy.softPhone : copy.soft} size={phone ? "display-2" : "display"} />
        <dl aria-label={copy.numbersLabel} className="flex gap-8 pb-1.5">
          {NUMBER_KEYS.map((key) => (
            <div key={key}>
              <dt className="text-caption text-mute">{copy.numbers[key]}</dt>
              <dd className="mt-1 text-[38px] leading-none font-light text-ink">{data ? formatNumber(data[key]) : copy.pending}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-12 lg:gap-5">
        <Surface variant="ink" compact={phone} aria-label={copy.weekTitle} className="flex flex-col gap-4 lg:col-span-5">
          <h2 className="text-title font-medium text-cream">{copy.weekTitle}</h2>
          {stats.isPending ? <LoadingBlock lines={2} onDark /> : null}
          {stats.isError ? <ErrorState onDark onRetry={() => void stats.refetch()} /> : null}
          {data ? (
            <>
              <div className="flex items-end gap-4">
                <p className="text-[92px] leading-[0.95] font-light text-cream">{formatNumber(data.newLeadsThisWeek)}</p>
                <p className="pb-2.5 text-small text-ink-mute">{copy.breakdown(data.thisWeekByStatus)}</p>
              </div>
              <GooButton to="/leads" tone="light" size="sm" className="mt-auto self-end">
                {copy.allLeads}
              </GooButton>
            </>
          ) : null}
        </Surface>
        <TodayCard
          day={today()}
          label={copy.today}
          size={phone ? "compact" : "regular"}
          className="min-h-[300px] lg:col-span-4"
          side={<p className="text-small text-mute">{copy.sideNote}</p>}
        />
        <Surface variant="glass" compact={phone} aria-label={copy.restTitle} className="lg:col-span-3">
          <EmptyState message={copy.rest} />
        </Surface>
      </div>
    </ScreenFrame>
  );
}
```

- [ ] **Step 4: Point the index route at the overview**

In `dashboard/src/app/routes.tsx`, add the import below the `Placeholder` import:

```tsx
import { OverviewScreen } from "../screens/overview/OverviewScreen";
```

and replace the index route:

```tsx
      { index: true, element: <Placeholder screen="overview" /> },
```

with:

```tsx
      { index: true, element: <OverviewScreen /> },
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/screens/overview src/app/routes.test.tsx`
Expected: PASS, 2 files and 9 tests.

- [ ] **Step 6: Run the checks and commit**

Run: `npm run check`
Expected: no type or lint errors, and all tests pass.

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add the first overview screen with live numbers from the mock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End-to-end smoke tests, README and final check

**Files:**
- Create: `dashboard/playwright.config.ts`, `dashboard/tests/e2e/smoke.spec.ts`, `dashboard/README.md`

**Interfaces:**
- Consumes: the whole app (Tasks 1 to 15), built and served by `npm run preview` on port 5180.
- Produces:
  - `npm run e2e` runs on the installed Chrome at desktop (1440×900) and phone (390×844) sizes.
  - Screenshots for visual review are written under `dashboard/test-results/`, which git ignores.

- [ ] **Step 1: Write the Playwright config and the smoke tests**

`dashboard/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

// The smoke tests run against a production build served by `vite preview`: no on-demand compiling,
// so the first page load is as fast as every other one.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5180", channel: "chrome", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "npm run build && npm run preview", url: "http://localhost:5180", reuseExistingServer: true, timeout: 180_000 },
});
```

`dashboard/tests/e2e/smoke.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("כתובת אימייל").fill("ronit@example.com");
  await page.getByLabel("סיסמה").fill("demo");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /שלום, רונית/ })).toBeVisible();
}

test("signs in and shows this week's leads", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toContainText("14");
});

test("desktop: the menu pill follows the chosen section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop shell only");
  await signIn(page);
  const menu = page.getByRole("navigation", { name: "ניווט ראשי" });
  await menu.getByRole("link", { name: /^לידים/ }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(menu.getByRole("link", { name: /^לידים/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: /לידים/ })).toBeVisible();
});

test("phone: tabs switch screens and a pushed screen goes back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone shell only");
  await signIn(page);
  await page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "לקוחות" }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await page.goto("/customers/c-sara-cohen");
  await expect(page.getByRole("heading", { level: 1, name: "כרטיס לקוח" })).toBeVisible();
  await page.getByRole("button", { name: "חזרה" }).click();
  await expect(page).toHaveURL(/\/customers$/);
});

test("works with Reduce Motion on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toBeVisible();
});

test("captures sign-in and overview for visual review", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("כתובת אימייל").waitFor();
  await page.waitForTimeout(1000); // let the springs settle before the screenshot
  await page.screenshot({ path: testInfo.outputPath("sign-in.png") });
  await signIn(page);
  await expect(page.getByRole("region", { name: "לידים השבוע" })).toContainText("14");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath("overview.png") });
});
```

- [ ] **Step 2: Run the smoke tests**

Run: `npm run e2e`
Expected: Playwright builds the app, starts the preview server, and reports `8 passed` and `2 skipped`. The desktop-only and phone-only tests each skip on the other project.

Look at the screenshots it saved. They are under `test-results/`, in folders named after the "captures sign-in and overview…" test:
- `sign-in.png` and `overview.png` for desktop
- the same two files for phone

Compare them with the canvas boards Login, Main, Mobile-Login and Mobile-Home. Expected:
- **Desktop sign-in:** the frosted card, the black card and the tall orb card.
- **Phone sign-in:** the stacked cards.
- **Desktop overview:** the rail and the pill menu.
- **Phone overview:** the glass tab bar.

- [ ] **Step 3: Write the README**

`dashboard/README.md`:

````markdown
# Or HaTzadik dashboard (shell)

The management dashboard for Ronit Barash's business, אור הצדיק. This is the shell: every screen runs on mock data until Ronit's API is connected.

- Design: https://claude.ai/artifact/66CNW6TQi5C9HmxnXDjN9c (source in `../design/canvas/`)
- Spec: `../docs/superpowers/specs/2026-10-28-ronit-dashboard-shell-design.md`

## Run it

Needs Node 22.22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5180. Any email and password signs in.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 5180 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run check` | Type-check, lint and unit tests |
| `npm run e2e` | Playwright smoke tests on the installed Chrome, at desktop and phone sizes |

## Settings

Copy `.env.example` to `.env` to change:

- `VITE_DEMO_TODAY`: the demo "today" (default `2026-10-28`). The mock data is built around it.
- `VITE_MOCK_LATENCY`: the mock response delay in ms, as `min,max` (default `250,600`).

In development, add `?mock-error=leads,customers` to the address to see those services fail.

## How it is built

- `src/content/`: all Hebrew UI copy. Components contain no Hebrew strings.
- `src/styles/theme.css`: design tokens and the surface, orb and scene utilities, from the canvas theme.
- `src/ui/`: components. `src/motion/`: springs and transitions.
- `src/data/`: `services.ts` is the contract with the backend, `mock/` implements it, and screens read data through the hooks in `queries.ts`.
- `src/app/`: routing, the sign-in guard, and the desktop and phone shells. `src/screens/`: the screens.

Conventions:

- RTL: use only logical utilities.
- Motion: springs only from `src/motion/springs.ts`.
- Colors: only theme tokens.
- Numbers: phone and passport numbers go inside `<Ltr>`.

## Connecting the real API

Implement the interfaces in `src/data/services.ts` against the API, and pass that object to `ServicesProvider` in `src/app/AppProviders.tsx`. This can be done one service at a time.
````

- [ ] **Step 4: Run every check**

Run: `npm run check && npm run build && npm run e2e`
Expected:
- Type-check and lint are clean.
- Vitest passes every test file.
- The build ends with `✓ built in …`.
- Playwright reports `8 passed`.

- [ ] **Step 5: Commit**

```bash
cd /d/work/RONIT-AUTOMATION
git add dashboard
git commit -m "Add end-to-end smoke tests and the dashboard README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
