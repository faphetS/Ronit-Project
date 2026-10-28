import { motion } from "motion/react";
import { useCopy } from "../../content/locale";
import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { Icon } from "../../ui/Icon";

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}

const BUTTON =
  "inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap text-ink ring-1 ring-inset ring-ink/15 transition-colors hover:bg-sand-light disabled:opacity-40 disabled:hover:bg-transparent lg:h-[38px]";

/** Quiet paging under the customer list: which rows are showing, and the previous and next pages. Hidden when one page holds them all. */
export function Pager({ page, pageSize, total, onChange, className }: PagerProps) {
  const { customersCopy: copy } = useCopy();
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const from = Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label={copy.pager.label} className={cx("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-caption text-mute">{copy.pager.range(formatNumber(from), formatNumber(to), formatNumber(total))}</p>
      <div className="flex items-center gap-2">
        <motion.button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui} className={BUTTON}>
          {/* The forward chevron turned around points back, in either reading direction. */}
          <span className="inline-flex -scale-x-100">
            <Icon name="forward" size={16} />
          </span>
          {copy.pager.previous}
        </motion.button>
        <motion.button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} whileTap={{ scale: PRESS_SCALE }} transition={springs.ui} className={BUTTON}>
          {copy.pager.next}
          <Icon name="forward" size={16} />
        </motion.button>
      </div>
    </nav>
  );
}
