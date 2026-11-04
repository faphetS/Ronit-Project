import { motion } from "motion/react";
import { useCopy, useLocale } from "../../content/locale";
import { useImportRun } from "../../data/queries";
import { now } from "../../lib/clock";
import { cx } from "../../lib/cx";
import { formatRelative } from "../../lib/format";
import { cardVariants } from "../../motion/variants";

/** The line under the title: the leads are a copy of Monday.com, and when it was last copied. */
export function MondaySyncLine() {
  const { leadsCopy: copy } = useCopy();
  const { locale } = useLocale();
  const run = useImportRun();
  // Until it loads, an empty line of the same height, so nothing below jumps.
  if (!run.data) return <p aria-hidden="true" className="h-5" />;
  const copiedAt = run.data.lastCopiedAt;
  return (
    <motion.p variants={cardVariants} className="flex items-center gap-2 text-small text-mute">
      <span aria-hidden="true" className={cx("size-[7px] shrink-0 rounded-full", copiedAt ? "bg-status-registered" : "bg-status-irrelevant")} />
      {copiedAt ? copy.monday.synced(formatRelative(new Date(copiedAt), now(), locale)) : copy.monday.notYet}
    </motion.p>
  );
}
