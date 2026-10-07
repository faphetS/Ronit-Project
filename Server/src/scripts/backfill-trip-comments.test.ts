import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../config/db.js", () => ({
  enqueueComment: vi.fn(),
  isCommentQueued: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/dedup.js", () => ({
  isMessageProcessed: vi.fn().mockReturnValue(false),
}));

vi.mock("../domains/meta/meta.token.service.js", () => ({
  getCurrentIgToken: vi.fn().mockResolvedValue("test-token"),
}));

import {
  DEFAULT_MAX_AGE_HOURS,
  igTimestampToMs,
  igTimestampToSqlite,
  findRonitReplyParents,
  evaluateComment,
  hasBusinessMessageSince,
  planBackfill,
  selectForEnqueue,
  summarizeDecisions,
  fetchBusinessAccount,
  fetchAllComments,
  fetchConversationMessages,
  parseCliArgs,
  runBackfill,
  type IgCommentNode,
  type ConversationMessage,
  type EvaluateContext,
} from "./backfill-trip-comments.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../config/logger.js";
import * as db from "../config/db.js";
import * as dedup from "../lib/dedup.js";

const BUSINESS = { id: "biz-1", username: "ronit_barash" };
const NOW = Date.parse("2026-10-07T12:00:00Z");
const HOUR = 3_600_000;

// Graph returns timestamps like 2026-10-05T19:45:52+0000 (no colon in the offset).
const hoursAgo = (hours: number): string =>
  new Date(NOW - hours * HOUR).toISOString().replace(/\.\d{3}Z$/, "+0000");

function igComment(overrides: Partial<IgCommentNode> = {}): IgCommentNode {
  return {
    id: "c-1",
    text: "חנוכה",
    timestamp: hoursAgo(10),
    username: "dina",
    from: { id: "u-1", username: "dina" },
    ...overrides,
  };
}

function ctx(overrides: Partial<EvaluateContext> = {}): EvaluateContext {
  return {
    business: BUSINESS,
    nowMs: NOW,
    maxAgeMs: DEFAULT_MAX_AGE_HOURS * HOUR,
    ronitRepliedTo: new Set<string>(),
    isProcessed: () => false,
    isQueued: () => false,
    ...overrides,
  };
}

function reasonOf(comment: IgCommentNode, context: EvaluateContext = ctx()): string {
  const decision = evaluateComment(comment, context);
  return decision.outcome === "skip" ? decision.reason : decision.outcome;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.isCommentQueued).mockReturnValue(false);
  vi.mocked(dedup.isMessageProcessed).mockReturnValue(false);
  vi.unstubAllGlobals();
});

describe("timestamp conversion", () => {
  it("2026-10-05T19:45:52+0000 → '2026-10-05 19:45:52' (the SQLite UTC shape)", () => {
    expect(igTimestampToSqlite("2026-10-05T19:45:52+0000")).toBe("2026-10-05 19:45:52");
  });

  it("a Z suffix, a colon offset and fractional seconds all parse", () => {
    expect(igTimestampToSqlite("2026-10-05T19:45:52Z")).toBe("2026-10-05 19:45:52");
    expect(igTimestampToSqlite("2026-10-05T19:45:52+00:00")).toBe("2026-10-05 19:45:52");
    expect(igTimestampToSqlite("2026-10-05T19:45:52.123+0000")).toBe("2026-10-05 19:45:52");
  });

  it("a non-UTC offset is converted to UTC, not just stripped", () => {
    expect(igTimestampToSqlite("2026-10-05T22:45:52+0300")).toBe("2026-10-05 19:45:52");
    expect(igTimestampToSqlite("2026-10-05T15:15:52-0430")).toBe("2026-10-05 19:45:52");
  });

  it("crosses midnight correctly", () => {
    expect(igTimestampToSqlite("2026-10-06T01:30:00+0300")).toBe("2026-10-05 22:30:00");
  });

  it("igTimestampToMs returns the epoch milliseconds", () => {
    expect(igTimestampToMs("2026-10-05T19:45:52+0000")).toBe(Date.UTC(2026, 9, 5, 19, 45, 52));
  });

  it.each([undefined, "", "yesterday", "2026-10-05", "2026-13-45T10:00:00+0000", "2026-10-05 19:45:52"])(
    "%j → not a usable timestamp (null)",
    (value) => {
      expect(igTimestampToMs(value)).toBeNull();
      expect(igTimestampToSqlite(value ?? "")).toBeNull();
    },
  );
});

describe("findRonitReplyParents — which comments Ronit already answered publicly", () => {
  it("collects the parent_id of every reply written by the business (by id)", () => {
    const replies = findRonitReplyParents(
      [
        igComment({ id: "r-1", parent_id: "c-1", from: { id: "biz-1" }, username: undefined }),
        igComment({ id: "r-2", parent_id: "c-2", from: { id: "biz-1", username: "ronit_barash" } }),
      ],
      BUSINESS,
    );
    expect([...replies].sort()).toEqual(["c-1", "c-2"]);
  });

  it("matches the business by username when the id is in a different scope", () => {
    const replies = findRonitReplyParents(
      [igComment({ id: "r-1", parent_id: "c-1", username: "ronit_barash", from: { id: "other-scope-id" } })],
      BUSINESS,
    );
    expect([...replies]).toEqual(["c-1"]);
  });

  it("ignores replies written by other people and the business's own top-level comments", () => {
    const replies = findRonitReplyParents(
      [
        igComment({ id: "r-1", parent_id: "c-1", from: { id: "u-9", username: "someone" }, username: "someone" }),
        igComment({ id: "top-1", from: { id: "biz-1" }, username: "ronit_barash" }),
      ],
      BUSINESS,
    );
    expect(replies.size).toBe(0);
  });
});

describe("evaluateComment — the offline candidate filter", () => {
  it("a top-level trip word, recent, unseen → candidate, with everything the enqueue needs", () => {
    const decision = evaluateComment(
      igComment({ id: "c-7", text: "חנוכה 🙏", timestamp: "2026-10-05T19:45:52+0000", from: { id: "u-7", username: "rivka" }, username: "rivka_ig" }),
      ctx({ nowMs: Date.parse("2026-10-06T12:00:00Z") }),
    );

    expect(decision.outcome).toBe("candidate");
    if (decision.outcome !== "candidate") return;
    expect(decision.candidate).toEqual({
      commentId: "c-7",
      commenterId: "u-7",
      commenterUsername: "rivka_ig",
      text: "חנוכה 🙏",
      trip: "hanukkah",
      commentMs: Date.UTC(2026, 9, 5, 19, 45, 52),
      createdAt: "2026-10-05 19:45:52",
    });
  });

  it("the commenter's username falls back to from.username", () => {
    const decision = evaluateComment(igComment({ username: undefined, from: { id: "u-1", username: "from_name" } }), ctx());
    expect(decision.outcome === "candidate" && decision.candidate.commenterUsername).toBe("from_name");
  });

  it("a kislev word picks the kislev trip", () => {
    const decision = evaluateComment(igComment({ text: 'ר"ח כסלו' }), ctx());
    expect(decision.outcome === "candidate" && decision.candidate.trip).toBe("kislev");
  });

  describe("exclusion reasons", () => {
    it("a reply (has parent_id) → reply", () => {
      expect(reasonOf(igComment({ parent_id: "c-0" }))).toBe("reply");
    });

    it("written by the business (by id) → own-comment", () => {
      expect(reasonOf(igComment({ from: { id: "biz-1" } }))).toBe("own-comment");
    });

    it("written by the business (by username) → own-comment", () => {
      expect(reasonOf(igComment({ username: "ronit_barash", from: { id: "other-scope" } }))).toBe("own-comment");
    });

    it.each(["חנוכה שמח", "מעוניינת בכסלו", "כסלו או חנוכה", "אומן", "תודה"])("%j → no-trigger", (text) => {
      expect(reasonOf(igComment({ text }))).toBe("no-trigger");
    });

    it("no text at all → no-trigger", () => {
      expect(reasonOf(igComment({ text: undefined }))).toBe("no-trigger");
    });

    it("older than the max age → too-old; just under it → still a candidate", () => {
      expect(reasonOf(igComment({ timestamp: hoursAgo(DEFAULT_MAX_AGE_HOURS + 1) }))).toBe("too-old");
      expect(reasonOf(igComment({ timestamp: hoursAgo(DEFAULT_MAX_AGE_HOURS - 0.1) }))).toBe("candidate");
    });

    it("exactly at the max age → too-old (the window is exclusive)", () => {
      expect(reasonOf(igComment({ timestamp: hoursAgo(DEFAULT_MAX_AGE_HOURS) }))).toBe("too-old");
    });

    it("the max age is configurable", () => {
      const strict = ctx({ maxAgeMs: 24 * HOUR });
      expect(reasonOf(igComment({ timestamp: hoursAgo(30) }), strict)).toBe("too-old");
      expect(reasonOf(igComment({ timestamp: hoursAgo(20) }), strict)).toBe("candidate");
    });

    it("a missing or unparseable timestamp → bad-timestamp (age cannot be checked)", () => {
      expect(reasonOf(igComment({ timestamp: undefined }))).toBe("bad-timestamp");
      expect(reasonOf(igComment({ timestamp: "soon" }))).toBe("bad-timestamp");
    });

    it("no from.id → no-commenter-id (nobody to enqueue)", () => {
      expect(reasonOf(igComment({ from: undefined }))).toBe("no-commenter-id");
      expect(reasonOf(igComment({ from: { username: "ghost" } }))).toBe("no-commenter-id");
    });

    it("already handled (ig_comment mark) → already-processed", () => {
      expect(reasonOf(igComment({ id: "c-9" }), ctx({ isProcessed: (id) => id === "c-9" }))).toBe("already-processed");
    });

    it("already waiting in the queue → already-queued", () => {
      expect(reasonOf(igComment({ id: "c-9" }), ctx({ isQueued: (id) => id === "c-9" }))).toBe("already-queued");
    });

    it("Ronit replied to it publicly → ronit-replied", () => {
      expect(reasonOf(igComment({ id: "c-9" }), ctx({ ronitRepliedTo: new Set(["c-9"]) }))).toBe("ronit-replied");
    });
  });

  it("reports the FIRST failing check: a reply by the business with a trip word is a 'reply', not 'own-comment'", () => {
    expect(reasonOf(igComment({ parent_id: "c-0", from: { id: "biz-1" } }))).toBe("reply");
  });

  it("an already-processed comment older than the window is reported as too-old (age is checked first)", () => {
    expect(
      reasonOf(igComment({ timestamp: hoursAgo(200) }), ctx({ isProcessed: () => true })),
    ).toBe("too-old");
  });
});

describe("hasBusinessMessageSince — the conversation check", () => {
  const SINCE = Date.parse("2026-10-06T10:00:00Z");
  const msg = (from: string | undefined, createdTime: string | undefined): ConversationMessage => ({
    from: from === undefined ? undefined : { id: from },
    created_time: createdTime,
  });

  it("a message from someone other than the commenter, after the comment → contacted", () => {
    expect(hasBusinessMessageSince([msg("biz-1", "2026-10-06T11:00:00+0000")], "u-1", SINCE)).toBe(true);
  });

  it("created exactly at the comment time counts (>=)", () => {
    expect(hasBusinessMessageSince([msg("biz-1", "2026-10-06T10:00:00+0000")], "u-1", SINCE)).toBe(true);
  });

  it("a business message from BEFORE the comment does not count", () => {
    expect(hasBusinessMessageSince([msg("biz-1", "2026-10-06T09:59:59+0000")], "u-1", SINCE)).toBe(false);
  });

  it("only the commenter's own messages → not contacted", () => {
    expect(
      hasBusinessMessageSince(
        [msg("u-1", "2026-10-06T11:00:00+0000"), msg("u-1", "2026-10-06T12:00:00+0000")],
        "u-1",
        SINCE,
      ),
    ).toBe(false);
  });

  it("any one qualifying message among many is enough", () => {
    expect(
      hasBusinessMessageSince(
        [msg("u-1", "2026-10-06T11:00:00+0000"), msg("biz-1", "2026-10-06T12:00:00+0000"), msg("u-1", "2026-10-06T13:00:00+0000")],
        "u-1",
        SINCE,
      ),
    ).toBe(true);
  });

  it("an empty conversation → not contacted", () => {
    expect(hasBusinessMessageSince([], "u-1", SINCE)).toBe(false);
  });

  it("a message with no sender after the comment is treated as contact (fail safe: do not DM on a guess)", () => {
    expect(hasBusinessMessageSince([msg(undefined, "2026-10-06T11:00:00+0000")], "u-1", SINCE)).toBe(true);
  });

  it("a message with an unusable timestamp is ignored", () => {
    expect(hasBusinessMessageSince([msg("biz-1", undefined), msg("biz-1", "later")], "u-1", SINCE)).toBe(false);
  });
});

describe("planBackfill", () => {
  const baseInput = () => ({
    business: BUSINESS,
    nowMs: NOW,
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    isProcessed: () => false,
    isQueued: () => false,
  });

  it("only offline candidates trigger a conversation lookup (one API call per real candidate)", async () => {
    const getConversationMessages = vi.fn().mockResolvedValue([]);

    const decisions = await planBackfill({
      ...baseInput(),
      comments: [
        igComment({ id: "c-ok", from: { id: "u-1", username: "a" } }),
        igComment({ id: "c-text", text: "תודה", from: { id: "u-2", username: "b" } }),
        igComment({ id: "c-old", timestamp: hoursAgo(300), from: { id: "u-3", username: "c" } }),
      ],
      getConversationMessages,
    });

    expect(getConversationMessages).toHaveBeenCalledTimes(1);
    expect(getConversationMessages).toHaveBeenCalledWith("u-1");
    expect(decisions.map((d) => (d.outcome === "skip" ? d.reason : d.outcome))).toEqual([
      "candidate",
      "no-trigger",
      "too-old",
    ]);
  });

  it("a business message after the comment → contacted, so she is not enqueued", async () => {
    const decisions = await planBackfill({
      ...baseInput(),
      comments: [igComment({ id: "c-1", timestamp: hoursAgo(10), from: { id: "u-1", username: "a" } })],
      getConversationMessages: async () => [{ from: { id: "biz-1" }, created_time: hoursAgo(5) }],
    });

    expect(decisions[0]).toMatchObject({ outcome: "skip", reason: "contacted" });
  });

  it("a business message from before the comment does not block her", async () => {
    const decisions = await planBackfill({
      ...baseInput(),
      comments: [igComment({ id: "c-1", timestamp: hoursAgo(10), from: { id: "u-1", username: "a" } })],
      getConversationMessages: async () => [{ from: { id: "biz-1" }, created_time: hoursAgo(50) }],
    });

    expect(decisions[0]?.outcome).toBe("candidate");
  });

  it("a failed conversation lookup fails closed (conversation-check-failed), never enqueues, and does not abort the run", async () => {
    const getConversationMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce([]);

    const decisions = await planBackfill({
      ...baseInput(),
      comments: [
        igComment({ id: "c-1", from: { id: "u-1", username: "a" } }),
        igComment({ id: "c-2", from: { id: "u-2", username: "b" } }),
      ],
      getConversationMessages,
    });

    expect(decisions[0]).toMatchObject({ outcome: "skip", reason: "conversation-check-failed" });
    expect(decisions[1]?.outcome).toBe("candidate");
  });

  it("Ronit's public replies in the same listing exclude the comments they answer", async () => {
    const getConversationMessages = vi.fn().mockResolvedValue([]);

    const decisions = await planBackfill({
      ...baseInput(),
      comments: [
        igComment({ id: "c-answered", from: { id: "u-1", username: "a" } }),
        igComment({ id: "c-open", from: { id: "u-2", username: "b" } }),
        igComment({ id: "reply-1", parent_id: "c-answered", text: "נשלחה לך הודעה", from: { id: "biz-1" }, username: "ronit_barash" }),
      ],
      getConversationMessages,
    });

    expect(decisions.map((d) => (d.outcome === "skip" ? d.reason : d.outcome))).toEqual([
      "ronit-replied",
      "candidate",
      "reply",
    ]);
    expect(getConversationMessages).toHaveBeenCalledTimes(1);
  });

  it("consults the processed and queued predicates with the comment id", async () => {
    const isProcessed = vi.fn((id: string) => id === "c-done");
    const isQueued = vi.fn((id: string) => id === "c-waiting");

    const decisions = await planBackfill({
      ...baseInput(),
      isProcessed,
      isQueued,
      comments: [
        igComment({ id: "c-done", from: { id: "u-1", username: "a" } }),
        igComment({ id: "c-waiting", from: { id: "u-2", username: "b" } }),
      ],
      getConversationMessages: async () => [],
    });

    expect(decisions.map((d) => (d.outcome === "skip" ? d.reason : d.outcome))).toEqual([
      "already-processed",
      "already-queued",
    ]);
  });
});

describe("selectForEnqueue + summarizeDecisions", () => {
  async function decide(comments: IgCommentNode[]) {
    return planBackfill({
      business: BUSINESS,
      nowMs: NOW,
      maxAgeHours: DEFAULT_MAX_AGE_HOURS,
      isProcessed: () => false,
      isQueued: () => false,
      comments,
      getConversationMessages: async () => [],
    });
  }

  const COMMENTS = [
    igComment({ id: "newer", timestamp: hoursAgo(5), from: { id: "u-1", username: "a" } }),
    igComment({ id: "oldest", timestamp: hoursAgo(90), from: { id: "u-2", username: "b" } }),
    igComment({ id: "middle", timestamp: hoursAgo(40), from: { id: "u-3", username: "c" } }),
    igComment({ id: "skipped", text: "תודה", from: { id: "u-4", username: "d" } }),
  ];

  it("returns candidates oldest-first", async () => {
    const selected = selectForEnqueue(await decide(COMMENTS));
    expect(selected.map((c) => c.commentId)).toEqual(["oldest", "middle", "newer"]);
  });

  it("--limit keeps the OLDEST N (they are the ones closest to the 7-day window)", async () => {
    const selected = selectForEnqueue(await decide(COMMENTS), 2);
    expect(selected.map((c) => c.commentId)).toEqual(["oldest", "middle"]);
  });

  it("a limit larger than the candidate count returns them all", async () => {
    expect(selectForEnqueue(await decide(COMMENTS), 50)).toHaveLength(3);
  });

  it("summarizes decisions by reason, counting candidates under 'candidate'", async () => {
    expect(summarizeDecisions(await decide(COMMENTS))).toEqual({ candidate: 3, "no-trigger": 1 });
  });
});

describe("parseCliArgs", () => {
  it("--media only → dry run, 140h window (inside the 144h queue expiry), no limit", () => {
    expect(parseCliArgs(["--media", "1234"])).toEqual({
      mediaId: "1234",
      apply: false,
      limit: undefined,
      maxAgeHours: 140,
    });
  });

  it("all flags", () => {
    expect(parseCliArgs(["--media", "1234", "--apply", "--limit", "25", "--max-age-hours", "48"])).toEqual({
      mediaId: "1234",
      apply: true,
      limit: 25,
      maxAgeHours: 48,
    });
  });

  it.each([
    [["--apply"], "missing --media"],
    [["--media", ""], "empty --media"],
    [["--media", "1", "--limit", "0"], "limit 0"],
    [["--media", "1", "--limit", "abc"], "limit not a number"],
    [["--media", "1", "--limit", "-3"], "negative limit"],
    [["--media", "1", "--limit", "2.5"], "fractional limit"],
    [["--media", "1", "--max-age-hours", "0"], "max-age 0"],
    [["--media", "1", "--max-age-hours", "soon"], "max-age not a number"],
    [["--media", "1", "--nope"], "unknown flag"],
  ])("%j → rejected (%s)", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(AppError);
  });
});

describe("Graph fetchers", () => {
  function stubFetch(handler: (url: URL) => { status?: number; body: unknown }) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const { status = 200, body } = handler(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("fetchBusinessAccount → GET /me?fields=id,username on graph.instagram.com", async () => {
    const fetchMock = stubFetch(() => ({ body: { id: "biz-1", username: "ronit_barash" } }));

    await expect(fetchBusinessAccount("tok")).resolves.toEqual({ id: "biz-1", username: "ronit_barash" });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://graph.instagram.com/v23.0/me");
    expect(url.searchParams.get("fields")).toBe("id,username");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });

  it("fetchAllComments asks for the documented fields at limit 50 and follows paging.next to the end", async () => {
    const fetchMock = stubFetch((url) =>
      url.searchParams.get("after") === "P2"
        ? { body: { data: [{ id: "c-3" }] } }
        : {
            body: {
              data: [{ id: "c-1" }, { id: "c-2" }],
              paging: { next: "https://graph.instagram.com/v23.0/MEDIA-1/comments?after=P2&access_token=tok" },
            },
          },
    );

    const comments = await fetchAllComments("MEDIA-1", "tok");

    expect(comments.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(first.origin + first.pathname).toBe("https://graph.instagram.com/v23.0/MEDIA-1/comments");
    expect(first.searchParams.get("fields")).toBe("id,text,timestamp,username,parent_id,from");
    expect(first.searchParams.get("limit")).toBe("50");
    expect(first.searchParams.get("access_token")).toBe("tok");
  });

  it("fetchAllComments with an empty media → []", async () => {
    stubFetch(() => ({ body: { data: [] } }));
    await expect(fetchAllComments("MEDIA-1", "tok")).resolves.toEqual([]);
  });

  it("fetchConversationMessages → GET /me/conversations for that user, flattened across conversations", async () => {
    const fetchMock = stubFetch(() => ({
      body: {
        data: [
          { id: "t-1", messages: { data: [{ from: { id: "biz-1" }, created_time: "2026-10-06T11:00:00+0000" }] } },
          { id: "t-2", messages: { data: [{ from: { id: "u-1" }, created_time: "2026-10-06T12:00:00+0000" }] } },
        ],
      },
    }));

    const messages = await fetchConversationMessages("u-1", "tok");

    expect(messages).toEqual([
      { from: { id: "biz-1" }, created_time: "2026-10-06T11:00:00+0000" },
      { from: { id: "u-1" }, created_time: "2026-10-06T12:00:00+0000" },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://graph.instagram.com/v23.0/me/conversations");
    expect(url.searchParams.get("platform")).toBe("instagram");
    expect(url.searchParams.get("user_id")).toBe("u-1");
    expect(url.searchParams.get("fields")).toBe("messages.limit(20){from,created_time}");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });

  it("fetchConversationMessages with no conversation yet → []", async () => {
    stubFetch(() => ({ body: { data: [] } }));
    await expect(fetchConversationMessages("u-1", "tok")).resolves.toEqual([]);
  });

  it("a conversation with no messages field → []", async () => {
    stubFetch(() => ({ body: { data: [{ id: "t-1" }] } }));
    await expect(fetchConversationMessages("u-1", "tok")).resolves.toEqual([]);
  });

  it("a non-2xx from Graph throws an AppError (and never leaks the token into the message)", async () => {
    stubFetch(() => ({ status: 400, body: { error: { message: "bad", code: 100 } } }));

    const error = await fetchAllComments("MEDIA-1", "secret-token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).not.toContain("secret-token");
  });
});

describe("runBackfill", () => {
  const MEDIA = "MEDIA-1";

  function stubGraph(comments: IgCommentNode[], conversations: Record<string, ConversationMessage[] | "error"> = {}) {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      let status = 200;
      let body: unknown;
      if (url.pathname.endsWith("/me")) {
        body = { id: BUSINESS.id, username: BUSINESS.username };
      } else if (url.pathname.endsWith("/comments")) {
        body = { data: comments };
      } else if (url.pathname.endsWith("/me/conversations")) {
        const userId = url.searchParams.get("user_id") ?? "";
        const conversation = conversations[userId] ?? [];
        if (conversation === "error") {
          status = 500;
          body = { error: { message: "boom" } };
        } else {
          body = { data: [{ id: "t", messages: { data: conversation } }] };
        }
      } else {
        status = 404;
        body = {};
      }
      return { ok: status === 200, status, json: async () => body, text: async () => JSON.stringify(body) };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const comments = (): IgCommentNode[] => [
    igComment({ id: "c-newer", text: "כסלו", timestamp: hoursAgo(10), from: { id: "u-1", username: "rivka" }, username: "rivka" }),
    igComment({ id: "c-oldest", text: "חנוכה", timestamp: hoursAgo(100), from: { id: "u-2", username: "dina" }, username: "dina" }),
    igComment({ id: "c-contacted", text: "חנוכה", timestamp: hoursAgo(50), from: { id: "u-3", username: "sara" }, username: "sara" }),
    igComment({ id: "c-chat", text: "מתי הטיסה?", from: { id: "u-4", username: "noa" }, username: "noa" }),
  ];

  const conversations = { "u-3": [{ from: { id: "biz-1" }, created_time: hoursAgo(20) }] };

  it("a dry run (the default) decides and logs but enqueues nothing", async () => {
    stubGraph(comments(), conversations);

    const result = await runBackfill({ mediaId: MEDIA, apply: false, maxAgeHours: 156 }, NOW);

    expect(db.enqueueComment).not.toHaveBeenCalled();
    expect(result.enqueued).toEqual([]);
    expect(result.summary).toEqual({ candidate: 2, contacted: 1, "no-trigger": 1 });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-contacted", decision: "skip", reason: "contacted" }),
      expect.stringContaining("backfill"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: "c-oldest", decision: "candidate", trip: "hanukkah" }),
      expect.stringContaining("backfill"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ summary: { candidate: 2, contacted: 1, "no-trigger": 1 } }),
      expect.stringContaining("summary"),
    );
  });

  it("--apply enqueues the candidates oldest-first with the real comment time as created_at", async () => {
    stubGraph(comments(), conversations);

    const result = await runBackfill({ mediaId: MEDIA, apply: true, maxAgeHours: 156 }, NOW);

    expect(result.enqueued).toEqual(["c-oldest", "c-newer"]);
    expect(db.enqueueComment).toHaveBeenCalledTimes(2);
    expect(vi.mocked(db.enqueueComment).mock.calls[0]?.[0]).toEqual({
      commentId: "c-oldest",
      commenterId: "u-2",
      commenterUsername: "dina",
      recipientId: "biz-1",
      commentText: "חנוכה",
      kind: "trip",
      createdAt: igTimestampToSqlite(hoursAgo(100)),
    });
    expect(vi.mocked(db.enqueueComment).mock.calls[1]?.[0]).toMatchObject({ commentId: "c-newer", kind: "trip" });
  });

  it("--limit caps how many are enqueued (the oldest ones)", async () => {
    stubGraph(comments(), conversations);

    const result = await runBackfill({ mediaId: MEDIA, apply: true, limit: 1, maxAgeHours: 156 }, NOW);

    expect(result.enqueued).toEqual(["c-oldest"]);
    expect(db.enqueueComment).toHaveBeenCalledTimes(1);
  });

  it("skips comments the system already knows about (processed / queued)", async () => {
    stubGraph(comments(), conversations);
    vi.mocked(dedup.isMessageProcessed).mockImplementation((_source, id) => id === "c-oldest");
    vi.mocked(db.isCommentQueued).mockImplementation((id) => id === "c-newer");

    const result = await runBackfill({ mediaId: MEDIA, apply: true, maxAgeHours: 156 }, NOW);

    expect(dedup.isMessageProcessed).toHaveBeenCalledWith("ig_comment", "c-oldest");
    expect(result.enqueued).toEqual([]);
    expect(result.summary).toMatchObject({ "already-processed": 1, "already-queued": 1 });
  });

  it("a failed conversation lookup never enqueues that commenter, the rest still go through", async () => {
    stubGraph(comments(), { "u-2": "error" });

    const result = await runBackfill({ mediaId: MEDIA, apply: true, maxAgeHours: 156 }, NOW);

    expect(result.enqueued).toEqual(["c-contacted", "c-newer"]);
    expect(result.summary["conversation-check-failed"]).toBe(1);
  });

  it("warns when the window is wider than the queue's 6-day expiry (those rows would be dropped right after enqueue)", async () => {
    stubGraph([], {});

    await runBackfill({ mediaId: MEDIA, apply: false, maxAgeHours: 156 }, NOW);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ maxAgeHours: 156, queueExpiryHours: 144 }),
      expect.stringContaining("6-day"),
    );

    vi.mocked(logger.warn).mockClear();
    await runBackfill({ mediaId: MEDIA, apply: false, maxAgeHours: 120 }, NOW);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reports how many replies it saw, so a listing that omits replies is visible in the output", async () => {
    stubGraph(
      [
        igComment({ id: "c-1", from: { id: "u-1", username: "a" } }),
        igComment({ id: "r-1", parent_id: "c-1", from: { id: "biz-1" }, username: "ronit_barash" }),
      ],
      {},
    );

    await runBackfill({ mediaId: MEDIA, apply: false, maxAgeHours: 120 }, NOW);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ comments: 2, replies: 1, ronitReplies: 1 }),
      expect.stringContaining("fetched"),
    );
  });
});
