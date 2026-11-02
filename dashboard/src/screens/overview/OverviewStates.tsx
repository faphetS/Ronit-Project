import type { ReactNode } from "react";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { HScroll } from "../../ui/HScroll";
import { Skeleton } from "../../ui/states";
import { TextLink } from "../../ui/TextLink";

/** Tells screen readers a card is loading; the skeleton itself is hidden from them. */
function Busy({ children, className }: { children: ReactNode; className?: string }) {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{states.loading}</span>
      {children}
    </div>
  );
}

/** A small "didn't load" line with a retry, for the short lines in the orb card. */
export function InlineRetry({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const { overview, states } = useCopy();
  return (
    <p role="alert" className={cx("text-caption text-mute-2", className)}>
      {overview.couldNotLoad}{" "}
      <TextLink size="xs" onClick={onRetry}>
        {states.retry}
      </TextLink>
    </p>
  );
}

/** Two short lines, like the birthdays under the date. */
export function LinesSkeleton({ widths = ["w-32", "w-24"], className }: { widths?: string[]; className?: string }) {
  return (
    <Busy className={cx("flex flex-col gap-2", className)}>
      {widths.map((width, index) => (
        <Skeleton key={`${index}-${width}`} className={cx("h-3.5", width)} />
      ))}
    </Busy>
  );
}

// Bar heights of a typical eight weeks, so the loading chart already looks like one.
const BAR_HEIGHTS = ["h-[57%]", "h-[79%]", "h-[50%]", "h-[86%]", "h-[64%]", "h-[71%]", "h-[64%]", "h-full"];

/** The black card while loading: the big number, its two lines and the bars. */
export function WeekSkeleton({ phone }: { phone: boolean }) {
  return (
    <Busy className={cx("flex flex-col", phone ? "gap-3" : "gap-4")}>
      <div className="flex items-end gap-4">
        <Skeleton onDark className={phone ? "h-[66px] w-20" : "h-[84px] w-24"} />
        <div className="flex flex-col gap-2 pb-2.5">
          <Skeleton onDark className="h-3.5 w-24" />
          <Skeleton onDark className="h-3.5 w-44" />
        </div>
      </div>
      <div className={cx("flex items-end", phone ? "mt-2 h-16 gap-2.5" : "mt-3.5 h-[138px] gap-4 pt-7")}>
        {BAR_HEIGHTS.map((height, index) => (
          <span key={index} className="flex h-full flex-1 items-end justify-center">
            <Skeleton onDark className={cx("w-full max-w-6 rounded-t-[4px] rounded-b-none", height)} />
          </span>
        ))}
      </div>
    </Busy>
  );
}

/** The greeting card while loading. */
export function GreetingSkeleton({ phone }: { phone: boolean }) {
  return (
    <Busy className="flex flex-1 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-28" />
      </div>
      <Skeleton className={phone ? "h-8 w-2/3" : "h-16 w-1/2"} />
      {phone ? null : <Skeleton className="h-16 w-full" />}
      <Skeleton className="mt-auto h-1.5 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-[38px] flex-1" />
        <Skeleton className="h-[38px] w-20" />
      </div>
    </Busy>
  );
}

/** List rows with an avatar or icon circle, two lines and a short end. */
export function RowsSkeleton({ rows, circle = "icon", glass = false }: { rows: number; circle?: "icon" | "avatar"; glass?: boolean }) {
  return (
    <Busy>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cx("flex items-center gap-3 py-3", index > 0 && "border-t", glass ? "border-ink/8" : "border-line")}>
          <Skeleton className={cx("shrink-0", circle === "icon" ? "size-[42px]" : "size-[38px]")} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </Busy>
  );
}

/** The recent leads table while loading: a header and rows of five cells. */
export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <Busy>
      <div className="flex gap-6 pb-2.5">
        {["w-12", "w-14", "w-10", "w-12", "w-10"].map((width, index) => (
          <Skeleton key={index} className={cx("h-3", width, index === 0 ? "me-20" : "")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-6 border-t border-line py-3">
          <span className="flex w-36 shrink-0 items-center gap-2.5">
            <Skeleton className="size-[38px] shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
          </span>
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </Busy>
  );
}

/** Group rows while loading: title and figure, the meter, the caption. */
export function MeterRowsSkeleton({ rows }: { rows: number }) {
  return (
    <Busy>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cx("flex flex-col gap-2.5 py-3.5", index === 0 ? "pt-1" : "border-t border-line")}>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-6 w-14" />
          </div>
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </Busy>
  );
}

/** The phone groups carousel while loading. */
export function CarouselSkeleton({ cards }: { cards: number }) {
  return (
    <Busy>
      <HScroll>
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-[150px] w-[196px] shrink-0 rounded-card-phone" />
        ))}
      </HScroll>
    </Busy>
  );
}
