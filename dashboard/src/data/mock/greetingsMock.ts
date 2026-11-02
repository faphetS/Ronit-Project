import { estimateSendMinutes, inAudience } from "../rules";
import { NotFoundError, type GreetingsService } from "../services";
import type { AudienceOption, HolidayCampaign } from "../types";
import type { MockContext } from "./context";

export function createGreetingsMock({ state, respond, clock, actingUserId, logAudit }: MockContext): GreetingsService {
  function findCampaign(id: string): HolidayCampaign {
    const campaign = state.campaigns.find((c) => c.id === id);
    if (!campaign) throw new NotFoundError("Campaign", id);
    return campaign;
  }

  function audienceOptions(): AudienceOption[] {
    return state.audiences.map((audience) => ({
      ...audience,
      recipients: state.customers.filter((customer) => inAudience(customer, audience)).length,
    }));
  }

  return {
    current: () =>
      respond("greetings", () => state.campaigns.filter((c) => c.status !== "completed").sort((a, b) => a.sendAt.localeCompare(b.sendAt))[0] ?? null),
    history: () => respond("greetings", () => [...state.campaigns].sort((a, b) => b.sendAt.localeCompare(a.sendAt))),
    audiences: () => respond("greetings", audienceOptions),
    update: (id, patch) =>
      respond("greetings", () => {
        const campaign = findCampaign(id);
        if (campaign.status === "sending" || campaign.status === "completed") throw new Error("campaign-sent");
        if (patch.message !== undefined) {
          if (!patch.message.trim()) throw new Error("empty-message");
          campaign.message = patch.message;
        }
        if (patch.audienceId !== undefined) {
          const option = audienceOptions().find((a) => a.id === patch.audienceId);
          if (!option) throw new NotFoundError("Audience", patch.audienceId);
          campaign.audienceId = option.id;
          campaign.recipients = option.recipients;
          campaign.estimatedMinutes = estimateSendMinutes(option.recipients, campaign.rate);
        }
        campaign.savedAt = clock().toISOString();
        campaign.savedByUserId = actingUserId();
        // A change after approval needs a new approval.
        if (campaign.status === "scheduled") {
          campaign.status = "awaiting-approval";
          campaign.stage = "approve";
          campaign.approvedAt = null;
          campaign.approvedByUserId = null;
        }
        logAudit({ action: "greeting-edit", campaignId: id, holiday: campaign.holiday });
        return campaign;
      }),
    approve: (id) =>
      respond("greetings", () => {
        const campaign = findCampaign(id);
        if (campaign.status === "draft" || campaign.status === "awaiting-approval") {
          campaign.status = "scheduled";
          campaign.stage = "track";
          campaign.approvedAt = clock().toISOString();
          campaign.approvedByUserId = actingUserId();
          logAudit({ action: "greeting-approve", campaignId: id, holiday: campaign.holiday });
        }
        return campaign;
      }),
    sendTest: (id) =>
      respond("greetings", () => {
        const campaign = findCampaign(id);
        campaign.lastTest = { at: clock().toISOString(), toUserId: actingUserId() };
        if (campaign.stage === "write") campaign.stage = "review";
        return campaign;
      }),
  };
}
