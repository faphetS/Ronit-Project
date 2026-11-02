interface ImportMetaEnv {
  /** Fixed demo day, YYYY-MM-DD. */
  readonly VITE_DEMO_TODAY?: string;
  /** Mock response delay range in ms: "min,max". */
  readonly VITE_MOCK_LATENCY?: string;
  /** The API's origin, like https://api.ronitbarash.site. Empty in development: Vite proxies /api. */
  readonly VITE_API_URL?: string;
  /** Services that use the API: "session", a comma list, or "all". Unset: everything on the demo data. */
  readonly VITE_HTTP_SERVICES?: string;
  /** The Google OAuth client ID (public). Set: the sign-in shows Google's own button. Unset: the demo button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
