import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { HScroll } from "../../ui/HScroll";
import { Skeleton } from "../../ui/states";
import { Surface } from "../../ui/Surface";

function Rows({ rows, avatar }: { rows: number; avatar: boolean }) {
  return (
    <span className="flex flex-col">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
          {avatar ? <Skeleton className="size-[38px] shrink-0" /> : null}
          <Skeleton className="h-4 w-1/3" />
          <span className="flex-1" />
          <Skeleton className="h-4 w-1/5" />
        </span>
      ))}
    </span>
  );
}

/** Rows of a table or list while they load: an avatar circle and two bars per row. */
export function RowsSkeleton({ rows, avatar = true }: { rows: number; avatar?: boolean }) {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{states.loading}</span>
      <Rows rows={rows} avatar={avatar} />
    </div>
  );
}

/** A group card while it loads: tag, name, figure, meter and date. */
function GroupCardSkeleton({ dark = false, compact = false, className }: { dark?: boolean; compact?: boolean; className?: string }) {
  return (
    <Surface variant={dark ? "ink" : "card"} compact={compact} aria-hidden="true" className={cx("flex flex-col gap-3", className)}>
      <Skeleton onDark={dark} className="h-7 w-24" />
      <Skeleton onDark={dark} className="h-5 w-3/4" />
      <Skeleton onDark={dark} className="h-12 w-28" />
      <Skeleton onDark={dark} className="h-1.5 w-full" />
      <Skeleton onDark={dark} className="h-4 w-1/2" />
    </Surface>
  );
}

const CARDS = [0, 1, 2, 3];

/** The desktop page while the groups load: four cards, the participants table and the side column. */
export function DesktopGroupsSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="grid gap-5 lg:grid-cols-12">
      <span className="sr-only">{states.loading}</span>
      {CARDS.map((index) => (
        <GroupCardSkeleton key={index} dark={index === 0} className="lg:col-span-6 xl:col-span-3" />
      ))}
      <Surface variant="card" aria-hidden="true" className="lg:col-span-12 xl:col-span-8">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="mt-2 mb-5 h-4 w-1/2" />
        <Rows rows={8} avatar />
      </Surface>
      <div className="grid content-start gap-5 lg:col-span-12 lg:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
        <Surface variant="card" aria-hidden="true" className="flex min-h-[290px] p-3!">
          <Skeleton className="w-[55%]" />
        </Surface>
        <Surface variant="glass" aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Surface>
      </div>
    </div>
  );
}

/** The phone screen while the groups load: the black card, the carousel, the orb card and a list. */
export function PhoneGroupsSkeleton() {
  const { states } = useCopy();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3.5">
      <span className="sr-only">{states.loading}</span>
      <GroupCardSkeleton dark compact />
      <HScroll>
        {CARDS.slice(1).map((index) => (
          <GroupCardSkeleton key={index} compact className="w-[196px] shrink-0" />
        ))}
      </HScroll>
      <Surface variant="card" compact aria-hidden="true" className="flex min-h-[240px] p-2.5!">
        <Skeleton className="w-1/2" />
      </Surface>
      <Surface variant="card" compact aria-hidden="true">
        <Rows rows={3} avatar />
      </Surface>
    </div>
  );
}
