import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { getFormData, submitHolidayForm } from "./holiday.service.js";

function formatDateHebrew(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function renderPage(title: string, body: string, description?: string): string {
  const desc = description ?? title;
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="website">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f2f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      max-width: 480px;
      width: 100%;
      padding: 32px 24px;
    }
    h1 { font-size: 1.5rem; margin-bottom: 4px; color: #1a1a1a; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 0.95rem; }
    label { display: block; font-weight: 600; margin-bottom: 6px; color: #333; }
    textarea {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      font-size: 1rem;
      font-family: inherit;
      resize: vertical;
      min-height: 120px;
      margin-bottom: 24px;
    }
    textarea:focus { outline: none; border-color: #25d366; }
    button {
      width: 100%;
      background: #25d366;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 14px;
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #1da851; }
    .info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 24px;
      color: #555;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .msg { text-align: center; padding: 24px 0; }
    .msg .icon { font-size: 3rem; margin-bottom: 12px; }
    .msg p { color: #666; font-size: 1.05rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

export async function getHolidayForm(req: Request, res: Response): Promise<void> {
  const token = req.query.token as string | undefined;

  if (!token) {
    res.status(400).type("html").send(renderPage("שגיאה", `<div class="msg"><div class="icon">&#10060;</div><p>קישור לא תקין</p></div>`));
    return;
  }

  try {
    const data = await getFormData(token);

    if (data.status === "expired") {
      res.type("html").send(renderPage(
        "פג תוקף",
        `<div class="msg"><div class="icon">&#8987;</div><p>הקמפיין פג תוקף.<br>${data.holidayHebrew} כבר עבר.</p></div>`,
      ));
      return;
    }

    if (data.status !== "pending_reply") {
      res.type("html").send(renderPage(
        "נשלח",
        `<div class="msg"><div class="icon">&#9989;</div><p>ההודעה כבר נשלחה!<br>אין צורך לשלוח שוב.</p></div>`,
      ));
      return;
    }

    const formBody = `
    <h1>${data.holidayHebrew}</h1>
    <p class="subtitle">${formatDateHebrew(data.holidayDate)} — ${data.holidayName}</p>
    <form method="POST" action="/api/whatsapp/holiday-form">
      <input type="hidden" name="token" value="${token}">
      <label for="greeting">הודעת החג ללקוחות</label>
      <textarea id="greeting" name="greeting" placeholder="כתבי כאן את הודעת החג..." required></textarea>
      <div class="info">ההודעה תישלח אוטומטית ביום החג (${formatDateHebrew(data.holidayDate)}) לכל הלקוחות.</div>
      <button type="submit">שליחה</button>
    </form>`;

    res.type("html").send(renderPage(
      `טופס חג — ${data.holidayHebrew}`,
      formBody,
      `${data.holidayHebrew} — מילוי הודעת חג ללקוחות`,
    ));
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      res.status(404).type("html").send(renderPage("לא נמצא", `<div class="msg"><div class="icon">&#10060;</div><p>הקישור לא תקין או שפג תוקפו.</p></div>`));
      return;
    }
    throw err;
  }
}

export async function postHolidayForm(req: Request, res: Response): Promise<void> {
  const { token, greeting } = req.body as { token: string; greeting: string };

  try {
    const result = await submitHolidayForm(token, greeting);

    res.type("html").send(renderPage(
      "נשמר!",
      `<div class="msg"><div class="icon">&#9989;</div><p>ההודעה נשמרה!<br>תישלח ביום ${formatDateHebrew(result.holidayDate)} לכל הלקוחות.</p></div>`,
    ));
  } catch (err) {
    if (err instanceof AppError) {
      const message = err.code === "CAMPAIGN_NOT_FOUND"
        ? "הקישור לא תקין."
        : err.code === "CAMPAIGN_NOT_PENDING"
          ? "ההודעה כבר נשלחה."
          : "אירעה שגיאה.";

      res.status(err.statusCode).type("html").send(renderPage(
        "שגיאה",
        `<div class="msg"><div class="icon">&#10060;</div><p>${message}</p></div>`,
      ));
      return;
    }
    throw err;
  }
}
