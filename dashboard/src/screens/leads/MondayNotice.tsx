import { motion } from "motion/react";
import { useCopy, useLocale } from "../../content/locale";
import { useImportRun } from "../../data/queries";
import { now } from "../../lib/clock";
import { formatRelative } from "../../lib/format";
import { cardVariants } from "../../motion/variants";
import { IconCircle } from "../../ui/IconCircle";
import { Skeleton } from "../../ui/states";
import { StatusTag } from "../../ui/StatusTag";
import { TextLink } from "../../ui/TextLink";

/** The glass strip under the header: the leads are a copy of Monday.com, when it was last copied, and a link to the copy's page. */
export function MondayNotice() {
  const { leadsCopy: copy, states } = useCopy();
  const { locale } = useLocale();
  const run = useImportRun();
  let count;
  if (run.data) {
    const copiedAt = run.data.lastCopiedAt;
    count = copiedAt ? (
      <StatusTag tone="registered">{copy.monday.copiedAt(formatRelative(new Date(copiedAt), now(), locale))}</StatusTag>
    ) : (
      <StatusTag>{copy.monday.notYet}</StatusTag>
    );
  }
  else if (run.isError)
    count = (
      <TextLink size="sm" onClick={() => void run.refetch()}>
        {states.retry}
      </TextLink>
    );
  else count = <Skeleton className="h-7 w-24" />;

  return (
    <motion.section
      variants={cardVariants}
      aria-label={copy.monday.label}
      className="surface-glass flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-full py-3.5 ps-[18px] pe-[22px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconCircle icon="import" tone="glass" />
        <p className="text-copy">{copy.monday.note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {count}
        <TextLink to="/import" size="sm">
          {copy.monday.details}
        </TextLink>
      </div>
    </motion.section>
  );
}
