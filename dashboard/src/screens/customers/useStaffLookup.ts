import { useUsers } from "../../data/queries";
import { staffFirstName } from "./customer-helpers";

export interface StaffLabel {
  /** First name, as lists and logs show staff. */
  name: string;
  initial: string;
}

/** Looks up a staff member by id (note authors, assignees, who opened a passport). Null while users load or for automatic actions. */
export function useStaffLookup(): (id: string | null) => StaffLabel | null {
  const users = useUsers().data?.users;
  return (id) => {
    if (!id || !users) return null;
    const user = users.find((candidate) => candidate.id === id);
    return user ? { name: staffFirstName(user.name), initial: user.initial } : null;
  };
}
