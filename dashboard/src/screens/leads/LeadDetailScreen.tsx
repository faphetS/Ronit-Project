import { LeadsScreen } from "./LeadsScreen";

/**
 * One lead: a side panel beside the list on desktop, a pushed screen on phones.
 * It is LeadsScreen itself. React Router renders a route's element without a key, so when /leads and
 * /leads/:leadId render the same component, the desktop list page (its filters, scroll and focus) stays mounted
 * and only the panel slides in. A separate component here would remount the page and replay its entrance.
 */
export const LeadDetailScreen = LeadsScreen;
