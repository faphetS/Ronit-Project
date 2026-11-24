import { motion } from "motion/react";
import type { ReactElement } from "react";
import { useCopy, useLocale } from "../../content/locale";
import { useCan, useMarkMentionsSeen, useMentions } from "../../data/queries";
import type { Mention } from "../../data/types";
import { now } from "../../lib/clock";
import { formatNumber, formatRelative } from "../../lib/format";
import { PRESS_SCALE, springs } from "../../motion/springs";
import { useStaffLookup } from "../../screens/customers/useStaffLookup";
import { Icon } from "../../ui/Icon";
import { IconCircle } from "../../ui/IconCircle";
import { ListRow } from "../../ui/ListRow";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/states";
import { excerpt, unreadFirst, useBellAlerts } from "./bell";

/** "סימון הכול כנקרא", while some tag is unread. `onMarked` runs as it goes, for the focus to land somewhere sensible. */
export function MarkAllRead({ onMarked }: { onMarked?: () => void }) {
  const { nav } = useCopy();
  const mentions = useMentions();
  const markSeen = useMarkMentionsSeen();
  if (!mentions.data?.unread) return null;
  return (
    <motion.button
      type="button"
      onClick={() => {
        markSeen.mutate("all");
        onMarked?.();
      }}
      whileTap={{ scale: PRESS_SCALE }}
      transition={springs.ui}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-sand-light px-3 text-[13px] font-medium whitespace-nowrap text-ink ring-1 ring-black/[0.04] transition-colors ring-inset hover:bg-sand"
    >
      <Icon name="check" size={15} />
      {nav.bell.markAllRead}
    </motion.button>
  );
}

/** One tag: the lead, who wrote the note and how it opens, when, and a dot until it's read. It opens the lead and is read. */
function MentionRow({ mention, onOpen }: { mention: Mention; onOpen: () => void }) {
  const { nav } = useCopy();
  const copy = nav.bell;
  const { locale } = useLocale();
  const staff = useStaffLookup();
  const author = staff(mention.byUserId)?.name;
  const text = excerpt(mention.text);
  return (
    <ListRow
      as="li"
      to={`/leads/${mention.leadId}`}
      onClick={onOpen}
      align="start"
      leading={<IconCircle icon="at" size="md" />}
      title={
        <>
          {copy.mentionTitle(mention.leadName)}
          {mention.seen ? null : <span className="sr-only">{`, ${copy.unread}`}</span>}
        </>
      }
      titleTone={mention.seen ? "body" : "strong"}
      description={author ? copy.mentionDetail(author, text) : text}
      trailing={
        <span className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
          <span className="text-caption whitespace-nowrap text-mute">{formatRelative(new Date(mention.at), now(), locale)}</span>
          {mention.seen ? null : <span aria-hidden="true" data-unread="" className="size-2 rounded-full bg-gold" />}
        </span>
      }
    />
  );
}

/**
 * What the bell lists: the alerts its count includes (passports waiting for a check, a greeting waiting for approval),
 * each linking to its screen, then the notes that tagged the signed-in person, unread first. `onNavigate` runs as a row
 * is followed, to close the panel around the list.
 */
export function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const { nav, holidayNames } = useCopy();
  const copy = nav.bell;
  const alerts = useBellAlerts();
  const mentions = useMentions();
  const markSeen = useMarkMentionsSeen();
  // People kept out of Leads have no tags to list, nor a list to wait for.
  const tagsShown = useCan("leads", "view");
  const items = tagsShown ? unreadFirst(mentions.data?.items ?? []) : [];
  const failed = tagsShown && mentions.isError && !mentions.data;

  const rows: ReactElement[] = [];
  if (alerts.passports.length > 0) {
    rows.push(
      <ListRow
        key="passports"
        as="li"
        to="/customers"
        onClick={onNavigate}
        leading={<IconCircle icon="customers" size="md" />}
        title={copy.passports(alerts.passports.length)}
        description={<bdi>{alerts.passports.join(", ")}</bdi>}
      />,
    );
  }
  if (alerts.greeting) {
    rows.push(
      <ListRow
        key="greeting"
        as="li"
        to="/greetings/holidays"
        onClick={onNavigate}
        leading={<IconCircle icon="greetings" size="md" />}
        title={copy.greeting(holidayNames[alerts.greeting.holiday])}
        description={copy.greetingDetail(formatNumber(alerts.greeting.recipients))}
      />,
    );
  }
  for (const mention of items) {
    const open = () => {
      if (!mention.seen) markSeen.mutate([mention.noteId]);
      onNavigate();
    };
    rows.push(<MentionRow key={mention.noteId} mention={mention} onOpen={open} />);
  }

  if (rows.length === 0) {
    if (tagsShown && mentions.isPending) return <LoadingBlock lines={2} className="py-4" />;
    if (failed) return <ErrorState message={copy.mentionsFailed} onRetry={() => void mentions.refetch()} />;
    return <EmptyState message={copy.empty} />;
  }
  return (
    <>
      <ul>{rows}</ul>
      {failed ? <ErrorState message={copy.mentionsFailed} onRetry={() => void mentions.refetch()} /> : null}
    </>
  );
}
