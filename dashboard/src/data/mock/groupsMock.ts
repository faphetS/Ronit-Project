import { NotFoundError, type GroupsService } from "../services";
import { passportExpiresSoon } from "../rules";
import type { Group, GroupSummary } from "../types";
import type { MockContext } from "./context";

export function createGroupsMock({ state, respond, clock }: MockContext): GroupsService {
  function findGroup(id: string): Group {
    const group = state.groups.find((g) => g.id === id);
    if (!group) throw new NotFoundError("Group", id);
    return group;
  }

  function summarize(group: Group): GroupSummary {
    const members = state.customers.filter((c) => c.groupIds.includes(group.id));
    const registered = members.length;
    const passportsReceived = members.filter((c) => c.passport !== null).length;
    const readiness = group.type === "event" ? null : registered === 0 ? 0 : Math.round((100 * passportsReceived) / registered);
    return { ...group, registered, passportsReceived, missingPassports: registered - passportsReceived, readiness };
  }

  return {
    list: () => respond("groups", () => [...state.groups].sort((a, b) => a.startsOn.localeCompare(b.startsOn)).map(summarize)),
    get: (id) => respond("groups", () => summarize(findGroup(id))),
    participants: (id) =>
      respond("groups", () => {
        findGroup(id);
        const reference = clock();
        return state.customers
          .filter((customer) => customer.groupIds.includes(id))
          .map((customer) => ({
            customerId: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phone: customer.phone,
            passport: customer.passport ? ("received" as const) : ("missing" as const),
            passportExpiry: customer.passport?.expiryDate ?? null,
            passportExpiringSoon: customer.passport ? passportExpiresSoon(customer.passport.expiryDate, reference) : false,
            note: state.participantNotes.find((note) => note.groupId === id && note.customerId === customer.id)?.text ?? null,
          }));
      }),
  };
}
