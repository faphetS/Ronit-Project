import { useParams } from "react-router";
import { useShell } from "../../app/useShell";
import { LeadPhoneDetail } from "./LeadPhoneDetail";
import { LeadsDesktopPage } from "./LeadsDesktopPage";
import { LeadsPhoneList } from "./LeadsPhoneList";

/**
 * Leads, for both /leads and /leads/:leadId (LeadDetailScreen is this same component).
 * Desktop: the list page, with the chosen lead in a side panel beside it. Because both routes render this one
 * component, React keeps the page mounted when a lead opens or closes, so only the panel moves.
 * Phones: the grouped list, or the lead as a pushed screen.
 */
export function LeadsScreen() {
  const phone = useShell() === "phone";
  const { leadId } = useParams();
  if (!phone) return <LeadsDesktopPage leadId={leadId} />;
  return leadId ? <LeadPhoneDetail leadId={leadId} /> : <LeadsPhoneList />;
}
