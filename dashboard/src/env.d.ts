interface ImportMetaEnv {
  /** The API's origin, like https://api.ronitbarash.site. Empty: the page's own origin, which Vercel and Vite pass on to the API. */
  readonly VITE_API_URL?: string;
  /** The Google OAuth client ID (public). Set: the sign-in shows Google's own button. Unset: our button, which goes to Google by redirect. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
