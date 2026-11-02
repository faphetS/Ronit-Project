import { NotFoundError, type ImportsService } from "../services";
import type { MockContext } from "./context";

export function createImportsMock({ state, respond, clock, actingUserId, logAudit }: MockContext): ImportsService {
  return {
    latest: () => respond("imports", () => state.importRun),
    closeMonday: (id) =>
      respond("imports", () => {
        const run = state.importRun;
        if (run.id !== id) throw new NotFoundError("Import", id);
        if (run.monday !== "closed") {
          run.monday = "closed";
          run.mondayClosedAt = clock().toISOString();
          run.mondayClosedByUserId = actingUserId();
          logAudit({ action: "monday-close", runId: id });
        }
        return run;
      }),
  };
}
