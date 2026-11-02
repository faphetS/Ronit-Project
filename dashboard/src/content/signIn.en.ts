import type { signIn as he } from "./signIn.he";
import type { Widen } from "./types";

export const signIn: Widen<typeof he> = {
  brand: "Or HaTzadik",
  help: "Need help?",
  title: "Sign in",
  intro: "Sign in with the Google account the office registered.",
  google: "Continue with Google",
  remember: "Remember me",
  allInOne: {
    title: "Everything in one place",
    soft: "Leads, passports and greetings",
    line: "From the first call to the birthday greeting",
  },
  system: { first: "The management system", second: "of Or HaTzadik" },
  site: { label: "orhazadik.online", url: "https://orhazadik.online" },
  today: "Today",
  greetingsOnTheWay: "The holiday greetings are on their way",
  helpNotice: "You can reach the office on WhatsApp or by phone.",
  failed: "We couldn’t sign you in. Please try again.",
  errors: {
    "not-registered": "This account isn’t registered. You can ask the office to add it.",
    "google-failed": "Signing in with Google didn’t finish. Please try again.",
    "too-many-attempts": "Too many attempts. You can try again in 15 minutes.",
    "invalid-code": "That code is wrong. Check your email and try again.",
    "step-expired": "That took too long. Please sign in again.",
    "email-failed": "We couldn’t email the code. Please try again in a moment.",
    "resend-too-soon": "You can ask for a new code a minute after the last one.",
    unavailable: "Signing in isn’t available right now. Please try again later.",
  },
  code: {
    title: "Verification code",
    sentTo: (email: string) => `We sent a 6-digit code to ${email}. It works for 10 minutes.`,
    label: "6-digit code",
    submit: "Sign in",
    resend: "Send again",
    resent: "We sent a new code.",
    back: "Back",
  },
};
