import type { ReactNode } from "react";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { Skeleton } from "../../ui/states";
import { Surface } from "../../ui/Surface";

/** Announces loading once, around skeleton shapes. Quiet inside a bigger skeleton that already announces it. */
function Loading({ className, quiet = false, children }: { className?: string; quiet?: boolean; children: ReactNode }) {
  const { states } = useCopy();
  if (quiet) {
    return (
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    );
  }
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{states.loading}</span>
      {children}
    </div>
  );
}

/** The WhatsApp inbox's tiles while they load (desktop: two by two). */
export function TilesSkeleton() {
  return (
    <Loading className="grid grid-cols-2 gap-2.5">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} onDark className="h-[108px]" />
      ))}
    </Loading>
  );
}

/** List rows while they load: an avatar circle and two lines, with the row dividers of the surface. */
export function RowsSkeleton({ rows = 3, onDark = false, avatar = true, quiet = false }: { rows?: number; onDark?: boolean; avatar?: boolean; quiet?: boolean }) {
  return (
    <Loading quiet={quiet}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cx("flex items-center gap-3 border-t py-3 first:border-t-0", onDark ? "border-white/10" : "border-line")}>
          {/* The inner radius rounds a 38px square into a circle. */}
          {avatar ? <Skeleton onDark={onDark} className="size-[38px] shrink-0" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton onDark={onDark} className="h-3.5 w-2/5" />
            <Skeleton onDark={onDark} className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </Loading>
  );
}

/** The customer table while it loads: a header line and rows. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Loading>
      <div className="flex gap-10 pb-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-3 w-16" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-t border-line py-3">
          <Skeleton className="size-[38px] shrink-0" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="ms-auto h-3.5 w-3/5" />
        </div>
      ))}
    </Loading>
  );
}

/** The passport fields while the card loads. */
function FieldsSkeleton({ columns }: { columns: 2 | 3 }) {
  return (
    <Loading quiet className={cx("grid gap-x-5 gap-y-4", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {Array.from({ length: columns * 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </Loading>
  );
}

/** The profile's name and avatar while the card loads. */
function HeaderSkeleton({ phone }: { phone: boolean }) {
  return (
    <div className={cx("flex gap-5", phone ? "items-center" : "items-end px-1 pt-1.5")}>
      <span aria-hidden="true" className={cx("block shrink-0 animate-pulse rounded-full bg-ink/6 motion-reduce:animate-none", phone ? "size-[76px]" : "size-24")} />
      <div className="flex flex-1 flex-col gap-3 pb-1.5">
        <Skeleton className={cx("w-56 max-w-full", phone ? "h-7" : "h-10")} />
        <Skeleton className="h-6 w-36" />
      </div>
    </div>
  );
}

/** Desktop profile while the card loads: the header, the passport card and the cards beside and under it. */
export function DesktopProfileSkeleton() {
  return (
    <Loading className="flex flex-col gap-[18px]">
      <HeaderSkeleton phone={false} />
      <div className="grid gap-5 lg:grid-cols-12">
        <Surface variant="card" className="lg:col-span-12 lg:px-7 lg:py-[26px] xl:col-span-8">
          <Skeleton className="mb-5 h-5 w-40" />
          <FieldsSkeleton columns={3} />
        </Surface>
        <Surface variant="ink" className="lg:col-span-6 xl:col-span-4">
          <Skeleton onDark className="mb-4 h-5 w-40" />
          <RowsSkeleton onDark avatar={false} quiet />
        </Surface>
        <Surface variant="glass" className="lg:col-span-6 xl:col-span-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <RowsSkeleton avatar={false} quiet />
        </Surface>
        <Surface variant="card" className="lg:col-span-6 xl:col-span-4">
          <Skeleton className="mb-3 h-5 w-24" />
          <RowsSkeleton avatar={false} quiet />
        </Surface>
        <Surface variant="card" className="lg:col-span-6 xl:col-span-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <RowsSkeleton rows={2} quiet />
        </Surface>
      </div>
    </Loading>
  );
}

/** Phone profile while the card loads: the glass header and the passport card. */
export function PhoneProfileSkeleton() {
  return (
    <Loading className="flex flex-col gap-3.5">
      <Surface variant="glass" compact>
        <HeaderSkeleton phone />
        <Skeleton className="mt-3 h-7 w-48" />
      </Surface>
      <Surface variant="card" compact>
        <Skeleton className="mb-4 h-5 w-24" />
        <FieldsSkeleton columns={2} />
      </Surface>
    </Loading>
  );
}
