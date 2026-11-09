/**
 * The sign-in emails, in Hebrew, right to left. Every email has a plain-text part too, for
 * clients that don't show HTML.
 */

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function layout(body: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<body style="margin:0;padding:24px;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#1c1a18">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;text-align:right;line-height:1.6">
${body}
<p style="margin:28px 0 0;font-size:13px;color:#6b635c">אור הצדיק · מערכת הניהול</p>
</div>
</body>
</html>`;
}

/** The 6-digit code after "Continue with Google" on a new device. The code is in the subject, so a phone's notification shows it. */
export function signInCodeEmail({ name, code }: { name: string; code: string }): EmailContent {
  return {
    subject: `קוד הכניסה שלך: ${code}`,
    text: `שלום ${name},\n\nהקוד לכניסה למערכת של אור הצדיק: ${code}\nהוא תקף ל-10 דקות.\n\nאם לא ניסית להיכנס עכשיו, אפשר להתעלם מההודעה.`,
    html: layout(`<p style="margin:0 0 12px">שלום ${escapeHtml(name)},</p>
<p style="margin:0">הקוד לכניסה למערכת של אור הצדיק:</p>
<p dir="ltr" style="margin:16px 0;font-size:34px;font-weight:bold;letter-spacing:8px;text-align:center">${code}</p>
<p style="margin:0">הוא תקף ל-10 דקות.</p>
<p style="margin:16px 0 0;font-size:13px;color:#6b635c">אם לא ניסית להיכנס עכשיו, אפשר להתעלם מההודעה.</p>`),
  };
}

/**
 * Sent when the office registers someone: where to go, and the ways in. With a password it
 * names the username (or the email) to type, but never the password: the office passes that
 * on by hand. Without one, Google is the way in, as before.
 */
export function inviteEmail({
  name,
  email,
  username = null,
  withPassword = false,
  dashboardUrl,
}: {
  name: string;
  email: string;
  username?: string | null;
  withPassword?: boolean;
  dashboardUrl: string;
}): EmailContent {
  const url = dashboardUrl.replace(/\/+$/, "");
  const login = username ?? email;
  const passwordText = withPassword ? `נכנסים עם שם המשתמש ${login} והסיסמה שתקבלו מהמשרד, או בלחיצה על "המשך עם Google" עם ${email}.` : null;
  const passwordHtml = withPassword
    ? `<p style="margin:0">נכנסים עם שם המשתמש <span dir="ltr">${escapeHtml(login)}</span> והסיסמה שתקבלו מהמשרד.</p>
<p style="margin:12px 0 0">או בלחיצה על "המשך עם Google" עם <span dir="ltr">${escapeHtml(email)}</span>.</p>`
    : `<p style="margin:0">בוחרים "המשך עם Google" ונכנסים עם <span dir="ltr">${escapeHtml(email)}</span>.</p>`;
  return {
    subject: "נפתח לך חשבון במערכת של אור הצדיק",
    text:
      `שלום ${name},\n\nנפתח לך חשבון במערכת הניהול של אור הצדיק.\n\nלכניסה: ${url}\n` +
      `${passwordText ?? `בוחרים "המשך עם Google" ונכנסים עם ${email}.`}\n` +
      "בכניסה ממכשיר חדש יגיע לכאן קוד בן 6 ספרות.",
    html: layout(`<p style="margin:0 0 12px">שלום ${escapeHtml(name)},</p>
<p style="margin:0 0 20px">נפתח לך חשבון במערכת הניהול של אור הצדיק.</p>
<p style="margin:0 0 20px;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1c1a18;color:#f4efe6;text-decoration:none;border-radius:999px;padding:12px 28px;font-weight:bold">כניסה למערכת</a></p>
${passwordHtml}
<p style="margin:12px 0 0">בכניסה ממכשיר חדש יגיע לכאן קוד בן 6 ספרות.</p>`),
  };
}
