import type { Request, Response } from "express";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../config/logger.js";
import { getFormData, submitHolidayForm } from "./holiday.service.js";

function formatDateHebrew(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function generateDateOptions(holidayDate: string): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const today = new Date();

  for (let i = 1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const value = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    if (value > holidayDate) break;
    const label = formatDateHebrew(value);
    options.push({ value, label });
  }

  return options;
}

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
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
      margin-bottom: 16px;
    }
    textarea:focus, select:focus { outline: none; border-color: #25d366; }
    select {
      width: 100%;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 12px;
      font-size: 1rem;
      font-family: inherit;
      background: #fff;
      margin-bottom: 24px;
      -webkit-appearance: none;
    }
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

    const dateOptions = generateDateOptions(data.holidayDate);
    const optionsHtml = dateOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");

    const formBody = `
    <h1>${data.holidayHebrew}</h1>
    <p class="subtitle">${formatDateHebrew(data.holidayDate)} — בעוד 3 ימים</p>
    <form method="POST" action="/api/whatsapp/holiday-form">
      <input type="hidden" name="token" value="${token}">
      <label for="greeting">הודעת החג ללקוחות</label>
      <textarea id="greeting" name="greeting" placeholder="כתבי כאן את הודעת החג..." required></textarea>
      <label for="sendDate">מתי לשלוח?</label>
      <select id="sendDate" name="sendDate" required>${optionsHtml}</select>
      <button type="submit">שליחה</button>
    </form>`;

    res.type("html").send(renderPage(`טופס חג — ${data.holidayHebrew}`, formBody));
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      res.status(404).type("html").send(renderPage("לא נמצא", `<div class="msg"><div class="icon">&#10060;</div><p>הקישור לא תקין או שפג תוקפו.</p></div>`));
      return;
    }
    throw err;
  }
}

export async function postHolidayForm(req: Request, res: Response): Promise<void> {
  const { token, greeting, sendDate } = req.body as { token: string; greeting: string; sendDate: string };

  try {
    const result = await submitHolidayForm(token, greeting, sendDate);

    res.type("html").send(renderPage(
      "נשמר!",
      `<div class="msg"><div class="icon">&#9989;</div><p>ההודעה נשמרה!<br>תישלח ב-${formatDateHebrew(result.sendDate)} לכל הלקוחות.</p></div>`,
    ));
  } catch (err) {
    if (err instanceof AppError) {
      const message = err.code === "CAMPAIGN_NOT_FOUND"
        ? "הקישור לא תקין."
        : err.code === "CAMPAIGN_NOT_PENDING"
          ? "ההודעה כבר נשלחה."
          : err.code === "INVALID_SEND_DATE"
            ? "תאריך השליחה לא תקין."
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
