import type { signIn as he } from "./signIn.he";
import type { Widen } from "./types";

export const signIn: Widen<typeof he> = {
  brand: "Or HaTzadik",
  help: "Need help?",
  title: "Sign in",
  email: "Email address",
  password: "Password",
  forgot: "Forgot?",
  remember: "Remember me on this device",
  submit: "Sign in",
  allInOne: {
    title: "Everything in one place",
    soft: "Leads, passports and greetings",
    line: "From the first call to the birthday greeting",
  },
  system: { first: "The management system", second: "of Or HaTzadik" },
  site: { label: "orhazadik.online", url: "https://orhazadik.online" },
  today: "Today",
  greetingsOnTheWay: "The holiday greetings are on their way",
  forgotNotice: "We sent a password reset link to your email address.",
  helpNotice: "You can reach the office on WhatsApp or by phone.",
  failed: "We couldn’t sign you in. Please try again.",
};
