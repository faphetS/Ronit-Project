import { motion } from "motion/react";
import { useCopy } from "../../content/locale";
import { NotFoundError } from "../../data/services";
import { fadeOut, springs } from "../../motion/springs";
import { Button } from "../../ui/Button";
import { IconCircle } from "../../ui/IconCircle";
import { SidePanel } from "../../ui/SidePanel";
import { EmptyState, ErrorState } from "../../ui/states";
import { LeadBodySkeleton, LeadContactLinks, LeadFacts, LeadHeader, LeadHeaderSkeleton, LeadHistory, LeadInMonday } from "./LeadDetailParts";
import { useLeadDetail } from "./leads-data";

/**
 * The lead beside the list: status, contact, details, where it is worked in Monday, and Monday's notes.
 * It stays in view while the list scrolls and scrolls on its own when it is taller than the window.
 */
export function LeadSidePanel({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { leadsCopy: copy } = useCopy();
  const detail = useLeadDetail(leadId);
  const { lead } = detail;

  let body;
  if (lead)
    body = (
      <>
        <LeadContactLinks phone={lead.phone} />
        <LeadFacts lead={lead} surface="glass" />
        <LeadInMonday lead={lead} level={3} />
        <LeadHistory lead={lead} level={3} surface="glass" />
      </>
    );
  else if (detail.isError && detail.error instanceof NotFoundError)
    body = (
      <EmptyState
        message={copy.detail.notFound}
        action={
          <Button variant="outline" size="sm" onClick={onClose}>
            {copy.detail.backToList}
          </Button>
        }
      />
    );
  else if (detail.isError) body = <ErrorState onRetry={() => void detail.refetch()} />;
  else body = <LeadBodySkeleton />;

  return (
    <SidePanel
      label={lead ? copy.detail.label(lead.name) : copy.detail.title}
      onClose={onClose}
      focusOnOpen
      header={lead ? <LeadHeader lead={lead} level={2} /> : detail.isPending ? <LeadHeaderSkeleton /> : null}
      className="max-h-[calc(100dvh-8.5rem)] overflow-y-auto [scrollbar-width:thin]"
    >
      {body}
    </SidePanel>
  );
}

/** The side column before a lead is chosen. */
export function LeadPanelHint() {
  const { leadsCopy: copy } = useCopy();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: springs.surface }}
      exit={{ opacity: 0, transition: fadeOut }}
      className="surface-glass flex flex-col items-center gap-3 rounded-card px-[22px] py-12 text-center"
    >
      <IconCircle icon="leads" tone="glass" />
      <p className="text-title font-medium text-ink">{copy.hint.title}</p>
      <p className="max-w-[280px] text-small text-mute">{copy.hint.text}</p>
    </motion.div>
  );
}
