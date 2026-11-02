import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { Skeleton } from "../../ui/states";

type Shape = "person" | "switch" | "matrix" | "timeline" | "account";

// Bars of different lengths, so the rows read as text rather than a block.
const WIDTHS = ["w-28", "w-20", "w-32", "w-24", "w-36", "w-16"] as const;

function Bones({ shape, index, onDark }: { shape: Shape; index: number; onDark: boolean }) {
  const width = WIDTHS[index % WIDTHS.length];
  switch (shape) {
    case "person":
      return (
        <>
          <Skeleton onDark={onDark} className="size-[38px] shrink-0" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton onDark={onDark} className={cx("h-4", width)} />
            <Skeleton onDark={onDark} className="h-3 w-40 max-w-full" />
          </span>
          <Skeleton onDark={onDark} className="h-7 w-20 shrink-0" />
        </>
      );
    case "switch":
      return (
        <>
          <span className="flex-1">
            <Skeleton onDark={onDark} className="h-4 w-3/4" />
          </span>
          <Skeleton onDark={onDark} className="h-8 w-[52px] shrink-0" />
        </>
      );
    case "matrix":
      return (
        <>
          <span className="flex-1">
            <Skeleton onDark={onDark} className={cx("h-4", width)} />
          </span>
          {[0, 1, 2].map((column) => (
            <span key={column} className="grid w-1/5 place-items-center">
              <Skeleton onDark={onDark} className="size-[30px]" />
            </span>
          ))}
        </>
      );
    case "timeline":
      return (
        <>
          <Skeleton onDark={onDark} className="mt-[7px] size-[9px] shrink-0 self-start" />
          <span className="flex flex-1 flex-col gap-1.5">
            <Skeleton onDark={onDark} className="h-4 w-3/4" />
            <Skeleton onDark={onDark} className="h-3 w-1/3" />
          </span>
        </>
      );
    case "account":
      return (
        <>
          <Skeleton onDark={onDark} className="size-[76px] shrink-0" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton onDark={onDark} className="h-7 w-40 max-w-full" />
            <Skeleton onDark={onDark} className="h-5 w-20" />
            <Skeleton onDark={onDark} className="h-3 w-32" />
          </span>
        </>
      );
  }
}

/** Skeleton rows shaped like the list, table or card that is loading. Screen readers hear that it is loading. */
export function LoadingRows({ shape, count = 1, onDark = false }: { shape: Shape; count?: number; onDark?: boolean }) {
  const { states } = useCopy();
  const divided = shape === "person" || shape === "switch" || shape === "matrix";
  return (
    <div role="status" aria-busy="true" className={cx("w-full", !divided && "flex flex-col gap-4")}>
      <span className="sr-only">{states.loading}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cx(
            "flex items-center gap-3",
            divided && "border-t py-3 first-of-type:border-t-0",
            divided && (onDark ? "border-white/10" : "border-line"),
          )}
        >
          <Bones shape={shape} index={index} onDark={onDark} />
        </div>
      ))}
    </div>
  );
}
