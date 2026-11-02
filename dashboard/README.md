# Or HaTzadik dashboard

The management dashboard for Ronit Barash's business, אור הצדיק. Every screen reads Ronit's API (`/api/dashboard` on the server in `../Server`); leads, customers and trips are a copy of Monday.com until the switch-over.

- Design: the canvas source in `../design/canvas/`
- Specs: `../docs/superpowers/specs/2026-10-28-ronit-dashboard-shell-design.md` (the shell), `2026-11-02-staff-sign-in-design.md` (sign-in), `2026-11-02-dashboard-data-design.md` (the data)

## Run it

Needs Node 22.22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5180. The dev server passes `/api` on to the server at `http://localhost:3000` (or `VITE_API_PROXY`), so run `../Server` with a database to see data. Signing in needs Google and the emailed code, as in production.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 5180 |
| `npm run build` | Type-check and build to `dist/` |
| `npm run check` | Type-check, lint and unit tests |
| `npm run e2e` | Playwright smoke tests on the installed Chrome, at desktop and phone sizes |

## Settings

Copy `.env.example` to `.env` to change:

- `VITE_API_URL`: the API's origin. Leave it empty: the page's own origin is passed on to the API (by Vercel in production, `dashboard/vercel.json`, and by Vite in development).
- `VITE_GOOGLE_CLIENT_ID`: the Google OAuth client. Set, the sign-in shows Google's own button.

## How it is built

- `src/content/`: all UI copy, Hebrew in `*.he.ts` and English in `*.en.ts` (same shape, checked by TypeScript). Components read it with `useCopy()` and hold no copy of their own.
- `src/styles/theme.css`: design tokens and the surface, orb and scene utilities, from the canvas theme.
- `src/ui/`: components. `src/motion/`: springs and transitions.
- `src/data/`: `services.ts` is the contract with the API, `http/` implements it, and screens read data through the hooks in `queries.ts`.
- `src/app/`: routing, the sign-in guard, and the desktop and phone shells. `src/screens/`: the screens.
- `src/test/`: test helpers, with small test services in place of the API.

Conventions:

- Direction: use only logical utilities. Hebrew runs right to left and English left to right; motion that moves sideways reads `useDirection()`.
- Motion: springs only from `src/motion/springs.ts`.
- Colors: only theme tokens.
- Numbers: phone and passport numbers go inside `<Ltr>`.
