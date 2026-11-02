import type { ReactNode } from "react";
import logoUrl from "../assets/logo.png";
import { useCopy } from "../content/locale";
import { cx } from "../lib/cx";

interface ChatPreviewProps {
  /** The message as written, with tokens in braces: "ערב טוב {שם פרטי},". New lines are kept. */
  text: string;
  /**
   * Values for the tokens, keyed by the token as written ({ [MESSAGE_TOKENS.firstName]: "מיכל" }, from src/data/messages.ts)
   * or by the name inside the braces ({ "שם פרטי": "מיכל" }). A token without a value stays visible, marked.
   */
  values?: Record<string, string>;
  /** Mark the filled-in values too, so it is clear what changes per person. Off by default, as on the canvas. */
  highlightValues?: boolean;
  /** When it goes out, under the bubble: "17:00". */
  time?: string;
  /** The business name and logo above the bubble. Off on phones. */
  showSender?: boolean;
  className?: string;
}

const TOKEN = /\{([^{}]+)\}/g;

function fillTokens(text: string, values: Record<string, string>, highlightValues: boolean): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const value = values[match[0]] ?? values[(match[1] ?? "").trim()];
    if (value === undefined) {
      parts.push(
        <mark key={start} className="rounded-[6px] bg-gold/25 px-1 text-inherit">
          {match[0]}
        </mark>,
      );
    } else if (highlightValues) {
      parts.push(
        <mark key={start} className="rounded-[4px] bg-gold/15 text-inherit">
          {value}
        </mark>,
      );
    } else {
      parts.push(value);
    }
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** A WhatsApp-style preview: the message in a white bubble on the chat background, tokens filled in for one person. */
export function ChatPreview({ text, values = {}, highlightValues = false, time, showSender = true, className }: ChatPreviewProps) {
  const { common, uiCopy } = useCopy();
  return (
    <div className={cx("flex flex-col gap-2.5 rounded-inner bg-line p-4", className)}>
      {showSender ? (
        <div className="flex items-center gap-2.5 border-b border-ink/8 pb-2.5">
          <span aria-hidden="true" className="grid size-[38px] shrink-0 place-items-center overflow-hidden rounded-full bg-paper">
            <img src={logoUrl} alt="" className="w-[30px]" />
          </span>
          <div>
            <p className="text-small font-medium text-ink">{common.brandFull}</p>
            <p className="text-caption text-mute">{uiCopy.businessAccount}</p>
          </div>
        </div>
      ) : null}
      <p className="max-w-[92%] self-start rounded-[18px] rounded-ss-[6px] bg-paper px-3.5 pt-3 pb-2 text-[14.5px] leading-[1.6] whitespace-pre-line text-ink shadow-button">
        {fillTokens(text, values, highlightValues)}
        {time ? <span className="mt-0.5 block text-end text-[11.5px] text-mute">{time}</span> : null}
      </p>
    </div>
  );
}
