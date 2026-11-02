import { PhoneTopBar } from "../../app/phone/PhoneTopBar";
import { useCopy } from "../../content/locale";
import { NotFoundError } from "../../data/services";
import { Button } from "../../ui/Button";
import { ScreenFrame } from "../../ui/ScreenFrame";
import { EmptyState, ErrorState } from "../../ui/states";
import { Surface } from "../../ui/Surface";
import { LeadBodySkeleton, LeadContactLinks, LeadFacts, LeadHeader, LeadHeaderSkeleton, LeadHistory, LeadInMonday } from "./LeadDetailParts";
import { useLeadDetail } from "./leads-data";

/** The lead as a pushed phone screen, with the same parts as the desktop panel: header, contact and details on glass, then Monday and the notes. */
export function LeadPhoneDetail({ leadId }: { leadId: string }) {
  const { leadsCopy: copy } = useCopy();
  const detail = useLeadDetail(leadId);
  const { lead } = detail;

  let content;
  if (lead)
    content = (
      <>
        <Surface variant="glass" compact className="flex flex-col gap-4">
          <LeadHeader lead={lead} level={1} stacked />
          <LeadContactLinks phone={lead.phone} />
          <LeadFacts lead={lead} surface="glass" />
        </Surface>
        <Surface variant="card" compact>
          <LeadInMonday lead={lead} level={2} />
        </Surface>
        <Surface variant="card" compact>
          <LeadHistory lead={lead} level={2} surface="card" />
        </Surface>
      </>
    );
  else if (detail.isError)
    content = (
      <Surface variant="glass" compact>
        {detail.error instanceof NotFoundError ? (
          <EmptyState
            message={copy.detail.notFound}
            action={
              <Button to="/leads" variant="outline" size="sm">
                {copy.detail.backToList}
              </Button>
            }
          />
        ) : (
          <ErrorState onRetry={() => void detail.refetch()} />
        )}
      </Surface>
    );
  else
    content = (
      <Surface variant="glass" compact className="flex flex-col gap-4">
        <LeadHeaderSkeleton />
        <LeadBodySkeleton />
      </Surface>
    );

  return (
    <ScreenFrame>
      <PhoneTopBar title={copy.detail.title} />
      {content}
    </ScreenFrame>
  );
}
