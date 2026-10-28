# Or HaTzadik dashboard (shell)

The management dashboard for Ronit Barash's business, אור הצדיק. This is the shell: every screen runs on mock data until Ronit's API is connected.

- Design: the canvas source in `../design/canvas/`
- Spec: `../docs/superpowers/specs/2026-10-28-ronit-dashboard-shell-design.md`

## Run it

Needs Node 22.22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5180. Any email and password signs in. The switch on the sign-in screen and in the top bar flips the app between Hebrew and English.

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

- `src/content/`: all UI copy, Hebrew in `*.he.ts` and English in `*.en.ts` (same shape, checked by TypeScript). Components read it with `useCopy()` and hold no copy of their own.
- `src/styles/theme.css`: design tokens and the surface, orb and scene utilities, from the canvas theme.
- `src/ui/`: components. `src/motion/`: springs and transitions.
- `src/data/`: `services.ts` is the contract with the backend, `mock/` implements it, and screens read data through the hooks in `queries.ts`.
- `src/app/`: routing, the sign-in guard, and the desktop and phone shells. `src/screens/`: the screens.

Conventions:

- Direction: use only logical utilities. Hebrew runs right to left and English left to right; motion that moves sideways reads `useDirection()`.
- Motion: springs only from `src/motion/springs.ts`.
- Colors: only theme tokens.
- Sizes: write px as usual. The build turns CSS px into rem, and `theme.css` sets the desktop scale (87.5%) as the root font size. Sizes set in code go through `rem()` from `src/lib/rem.ts`.
- Numbers: phone and passport numbers go inside `<Ltr>`.

## Connecting the real API

Implement the interfaces in `src/data/services.ts` against the API, and pass that object to `ServicesProvider` in `src/app/AppProviders.tsx`. This can be done one service at a time.
