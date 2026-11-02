import { createTransport, type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Throws EMAIL_FAILED when the SMTP server refuses or can't be reached. */
  send(message: MailMessage): Promise<void>;
}

let transport: Transporter | null = null;

/**
 * Email over SMTP (SMTP_HOST etc.): Resend, Gmail with an app password, or any other server.
 * Null until SMTP is configured. Port 465 is TLS from the start; any other port must
 * upgrade with STARTTLS.
 */
export function smtpMailerFromEnv(): Mailer | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM) return null;
  transport ??= createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT !== 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const smtp = transport;
  return {
    async send(message) {
      try {
        await smtp.sendMail({ from: MAIL_FROM, ...message });
      } catch (err) {
        throw new AppError(502, `Sending email failed: ${err instanceof Error ? err.message : String(err)}`, "EMAIL_FAILED");
      }
    },
  };
}
