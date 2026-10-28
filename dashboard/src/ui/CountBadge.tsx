/** Small dark count on the corner of an icon control. The control's label must include the count. */
export function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -end-[3px] -top-[3px] grid h-5 min-w-5 place-items-center rounded-full border-2 border-cream bg-ink px-[5px] text-[11.5px] leading-none font-semibold text-cream"
    >
      {count}
    </span>
  );
}
