import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import hpp from "hpp";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Options, HttpLogger } from "pino-http";
import pinoHttpImport from "pino-http";
const pinoHttp = pinoHttpImport as unknown as (opts?: Options) => HttpLogger<IncomingMessage, ServerResponse>;
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { AppError, globalErrorHandler } from "./lib/errors.js";
import { requestId } from "./middleware/requestId.js";
import apiRoutes from "./routes/index.js";
import rateLimit from "express-rate-limit";
import { startWhatsAppCrons } from "./domains/whatsapp/cron.js";
import { startMetaCrons } from "./domains/meta/meta.cron.js";
import { startMondayCrons } from "./domains/monday/monday.cron.js";

const app = express();

// Trust the first reverse proxy (Nginx on Hostinger) so req.ip + rate-limit key work.
app.set("trust proxy", 1);

// --- Middleware stack (order matters) ---

// 1. Request ID — trace every request
app.use(requestId);

// 2. CORS — must be before helmet to handle preflight correctly
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// 3. Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }),
);

// 4. Structured logging
app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({ requestId: (req as unknown as Request).id }),
    autoLogging: { ignore: (req) => req.url === "/health" },
  }),
);

// 5a. Raw body for webhook HMAC verification — MUST run before express.json()
// so controllers can compute sha256 over the exact bytes the provider signed.
app.use(
  "/api/meta/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);
app.use(
  "/api/calls/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);

// 5b. Body parsing with size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// 6. Cookie parsing
app.use(cookieParser());

// 7. HTTP parameter pollution protection
app.use(hpp());

// 8. Rate limiting
app.use(
  "/api",
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", code: "RATE_LIMITED", message: "Too many requests" },
  }),
);

// --- Routes ---

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/privacy", (_req: Request, res: Response) => {
  res.type("html").send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy — Ronit Barash</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222}h1{border-bottom:2px solid #e0e0e0;padding-bottom:12px}h2{margin-top:32px;color:#333}ul{padding-right:20px}</style></head><body>
<h1>מדיניות פרטיות — רונית ברש</h1>
<p><strong>עדכון אחרון:</strong> מאי 2026</p>
<p>מדיניות פרטיות זו מסבירה כיצד רונית ברש ("אנחנו", "שלנו") אוספת, משתמשת ומגנה על המידע האישי שלך כאשר את/ה מתקשר/ת איתנו דרך אינסטגרם, וואטסאפ, או שיחות טלפון.</p>

<h2>1. מידע שאנחנו אוספים</h2>
<ul>
<li><strong>הודעות אינסטגרם:</strong> כאשר את/ה שולח/ת הודעה ישירה לחשבון האינסטגרם שלנו (@ronit_barash), אנחנו מקבלים את תוכן ההודעה, שם המשתמש שלך, ומזהה המשתמש שלך.</li>
<li><strong>פרטי קשר:</strong> שם ומספר טלפון — אם הם מוזכרים בהודעות או בשיחות.</li>
<li><strong>תמלולי שיחות:</strong> אם יש לנו שיחת טלפון, השיחה עשויה להיות מוקלטת ומתומללת לצורך מעקב.</li>
<li><strong>קבצים:</strong> מסמכים או תמונות שנשלחו אלינו דרך וואטסאפ.</li>
<li><strong>העדפת שירות:</strong> באיזה שירות את/ה מתעניין/ת (טיסות לאומן, טיסות לפולין, הפרשות חלה).</li>
</ul>

<h2>2. כיצד אנחנו משתמשים במידע שלך</h2>
<ul>
<li><strong>סיווג פניות:</strong> ההודעות שלך מעובדות על ידי שירות בינה מלאכותית (AI) כדי לקבוע אם את/ה מתעניין/ת בשירותים שלנו ובאיזה שירות.</li>
<li><strong>ניהול קשרי לקוחות:</strong> פרטי הקשר שלך נשמרים במערכת CRM לצורך מעקב ותקשורת.</li>
<li><strong>מעקב שיחות:</strong> תמלולים מעובדים כדי לחלץ מספרי טלפון ולעדכן את רשומת הלקוח שלך.</li>
<li><strong>הודעות חגים ומעקב:</strong> אנחנו עשויים לשלוח לך ברכות חג והודעות מעקב דרך וואטסאפ.</li>
</ul>

<h2>3. שירותי צד שלישי</h2>
<p>אנחנו משתמשים בשירותים הבאים לעיבוד המידע שלך:</p>
<ul>
<li><strong>Monday.com:</strong> אחסון רשומות CRM (שם, טלפון, העדפת שירות, היסטוריית שיחות).</li>
<li><strong>OpenRouter (AI):</strong> עיבוד טקסט הודעות לסיווג פניות וחילוץ מספרי טלפון. ההודעות שלך נשלחות לשירות AI לניתוח.</li>
<li><strong>מסד נתונים מקומי:</strong> אחסון מאובטח של מזהי הודעות (למניעת כפילויות) ולוגים של קמפיינים.</li>
<li><strong>GreenAPI:</strong> שליחת הודעות וואטסאפ.</li>
<li><strong>Salestrail:</strong> הקלטה ותמלול שיחות.</li>
<li><strong>Meta:</strong> קבלת הודעות אינסטגרם דרך ה-API שלהם.</li>
</ul>
<p>אנחנו לא מוכרים את המידע האישי שלך לצד שלישי כלשהו.</p>

<h2>4. שמירת מידע</h2>
<p>רשומות CRM נשמרות כל עוד הן רלוונטיות לשירותים שלנו. תוכל/י לבקש מחיקה בכל עת (ראה סעיף 6).</p>

<h2>5. אבטחת מידע</h2>
<p>כל התקשורת מוצפנת באמצעות HTTPS. חתימות Webhook מאומתות באמצעות HMAC-SHA256. מפתחות API מאוחסנים באופן מאובטח ולא נחשפים בקוד המקור.</p>

<h2>6. הזכויות שלך</h2>
<p>בהתאם לחוק הגנת הפרטיות, התשמ"א-1981, יש לך את הזכות:</p>
<ul>
<li>לבקש גישה למידע האישי שלך</li>
<li>לבקש תיקון מידע שגוי</li>
<li>לבקש מחיקת המידע שלך</li>
<li>לבקש הסרה מהודעות חגים ומעקב</li>
</ul>
<p>לכל בקשה, פנה/י אלינו: <strong>barashro@gmail.com</strong></p>

<h2>7. יצירת קשר</h2>
<p>רונית ברש<br>אימייל: barashro@gmail.com<br>אינסטגרם: @ronit_barash</p>
</body></html>`);
});

app.get("/terms", (_req: Request, res: Response) => {
  res.type("html").send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms of Service — Ronit Barash</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222}h1{border-bottom:2px solid #e0e0e0;padding-bottom:12px}h2{margin-top:32px;color:#333}ul{padding-right:20px}</style></head><body>
<h1>תנאי שימוש — רונית ברש</h1>
<p><strong>עדכון אחרון:</strong> מאי 2026</p>

<h2>1. אודות השירות</h2>
<p>שירות זה מנהל תקשורת עסקית עבור רונית ברש. כאשר את/ה שולח/ת הודעה לחשבון האינסטגרם שלנו (@ronit_barash) או מתקשר/ת איתנו, ההודעות שלך מעובדות כדי לספק שירות לקוחות טוב יותר.</p>

<h2>2. עיבוד הודעות</h2>
<ul>
<li>הודעות ישירות באינסטגרם מעובדות באופן אוטומטי על ידי בינה מלאכותית כדי לקבוע את העניין שלך בשירותים שלנו.</li>
<li>שיחות טלפון עשויות להיות מוקלטות ומתומללות לצורך מעקב אחר שירות הלקוחות.</li>
<li>אנחנו עשויים לשלוח לך הודעות מעקב וברכות חג דרך וואטסאפ.</li>
</ul>

<h2>3. השירותים שלנו</h2>
<p>אנחנו מציעים מידע ותיאום עבור:</p>
<ul>
<li>טיסות לאומן</li>
<li>טיסות לפולין</li>
<li>אירועי הפרשות חלה</li>
</ul>

<h2>4. תקשורת</h2>
<p>על ידי פנייה אלינו, את/ה מסכים/ה לקבל תשובות ומעקבים הקשורים לפנייה שלך. תוכל/י לבקש הסרה מתקשורת עתידית בכל עת על ידי פנייה ל-barashro@gmail.com.</p>

<h2>5. הגבלת אחריות</h2>
<p>אנחנו שואפים לספק מידע מדויק אך לא מתחייבים לדיוק מלא של כל התוכן. זמינות השירותים עשויה להשתנות.</p>

<h2>6. שינויים בתנאים</h2>
<p>אנחנו שומרים לעצמנו את הזכות לעדכן תנאים אלה. שינויים ייכנסו לתוקף מיד עם פרסומם.</p>

<h2>7. יצירת קשר</h2>
<p>רונית ברש<br>אימייל: barashro@gmail.com<br>אינסטגרם: @ronit_barash</p>
</body></html>`);
});

app.get("/data-deletion", (_req: Request, res: Response) => {
  res.type("html").send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Data Deletion — Ronit Barash</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#222}h1{border-bottom:2px solid #e0e0e0;padding-bottom:12px}h2{margin-top:32px;color:#333}ul{padding-right:20px}</style></head><body>
<h1>בקשת מחיקת מידע — רונית ברש</h1>
<p><strong>עדכון אחרון:</strong> מאי 2026</p>

<h2>כיצד לבקש מחיקת המידע שלך</h2>
<p>אם ברצונך למחוק את כל המידע האישי שלך ממערכות שלנו, שלח/י אימייל ל:</p>
<p><strong>barashro@gmail.com</strong></p>
<p>עם הנושא: <strong>"בקשת מחיקת מידע"</strong></p>

<h2>אנא כלול/י בבקשה:</h2>
<ul>
<li>שם המשתמש שלך באינסטגרם</li>
<li>מספר הטלפון שלך (אם סופק בעבר)</li>
<li>כל פרט מזהה נוסף שסופק בעבר</li>
</ul>

<h2>מה יימחק</h2>
<ul>
<li>רשומת CRM שלך ב-Monday.com (שם, טלפון, העדפת שירות, היסטוריית שיחות)</li>
<li>מזהי הודעות ומיפויי שולח בבסיס הנתונים שלנו</li>
<li>לוגים של הודעות חגים ומעקב</li>
</ul>

<h2>זמן עיבוד</h2>
<p>נעבד את בקשתך תוך <strong>30 יום</strong> ונאשר בדוא"ל כאשר כל המידע נמחק.</p>

<h2>הערה</h2>
<p>מחיקה מהמערכות שלנו לא משפיעה על מידע שנשמר על ידי Meta (אינסטגרם), וואטסאפ, או פלטפורמות צד שלישי אחרות. עיין/י במדיניות הפרטיות של אותם שירותים בנפרד.</p>
</body></html>`);
});

app.use("/api", apiRoutes);

// --- 404 handler for unmatched routes ---
app.use((_req: Request, _res: Response) => {
  throw new AppError(404, "Route not found", "ROUTE_NOT_FOUND");
});

// --- Global error handler (must be last) ---
app.use(globalErrorHandler);

// --- Graceful shutdown ---
const server = app.listen(env.PORT, () => {
  logger.info(`Server running on ${env.BACKEND_URL} [${env.NODE_ENV}]`);
  startWhatsAppCrons();
  startMetaCrons();
  startMondayCrons();
});

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10s if connections won't close
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
