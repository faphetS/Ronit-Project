import type { Response } from "express";
import { z } from "zod";
import { NotFoundError } from "../../lib/errors.js";

/** Every dashboard answer: { status: "ok", data }. Errors keep the server's own shape. */
export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ status: "ok", data });
}

/** The way the dashboard shows numbers: 972501234567 → 0501234567. Others as stored. */
export function localPhone(phone: string | null): string {
  if (!phone) return "";
  return /^972\d{9}$/.test(phone) ? `0${phone.slice(3)}` : phone;
}

/** What someone typed to find a phone (054-…, 972…, +972…), as digits found in the stored 972… form. */
export function phoneSearchDigits(term: string): string | null {
  const digits = term.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return digits.startsWith("0") ? digits.slice(1) : digits;
}

export const iso = (value: Date): string => value.toISOString();
export const isoOrNull = (value: Date | null): string | null => value?.toISOString() ?? null;

const IdSchema = z.string().uuid();

/** A row id from the address; anything that isn't one is simply not found. */
export function idParam(value: unknown, what: string): string {
  const parsed = IdSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(what);
  return parsed.data;
}
