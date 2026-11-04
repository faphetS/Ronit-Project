import { useCopy } from "../../content/locale";
import { NotFoundError } from "../../data/services";
import { cx } from "../../lib/cx";
import { Button } from "../../ui/Button";
import { SidePanel } from "../../ui/SidePanel";
import { EmptyState, ErrorState } from "../../ui/states";
import { LeadBodySkeleton, LeadContactLinks, LeadFacts, LeadHeader, LeadHeaderSkeleton, LeadHistory, LeadInMonday } from "./LeadDetailParts";
import { useLeadDetail } from "./leads-data";

interface LeadSidePanelProps {
  leadId: string;
  onClose: () => void;
  /** "card" when it floats over the board. */
  surface?: "glass" | "card";
  className?: string;
}

/**
 * The lead on desktop: status, contact, details, where it is worked in Monday, and Monday's notes.
 * It scrolls on its own when it is taller than the window.
 */
export function LeadSidePanel({ leadId, onClose, surface = "glass", className }: LeadSidePanelProps) {
  const { leadsCopy: copy } = useCopy();
  const detail = useLeadDetail(leadId);
  const { lead } = detail;

  let body;
  if (lead)
    body = (
      <>
        <LeadContactLinks phone={lead.phone} />
        <LeadFacts lead={lead} surface={surface} />
        <LeadInMonday lead={lead} level={3} />
        <LeadHistory lead={lead} level={3} surface={surface} />
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
      surface={surface}
      header={lead ? <LeadHeader lead={lead} level={2} /> : detail.isPending ? <LeadHeaderSkeleton /> : null}
      className={cx("max-h-[calc(100dvh-8.5rem)] overflow-y-auto [scrollbar-width:thin]", className)}
    >
      {body}
    </SidePanel>
  );
}
