import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type {
  CallProvider,
  CallTranscript,
  CallTranscriptSegment,
} from "../../integrations/calls.js";

const BASE_URL = "https://api.timeless.day/v1";

interface TimelessSegment {
  speaker_id: string;
  speaker_name: string | null;
  text: string;
  start_time: number;
  end_time: number;
  language: string | null;
}

interface TimelessTranscriptResponse {
  meeting_id: string;
  title: string | null;
  duration: number | null;
  created_at: string;
  segments: TimelessSegment[];
}

export class TimelessClient implements CallProvider {
  async fetchTranscript(meetingId: string): Promise<CallTranscript> {
    if (!env.TIMELESS_API_KEY) {
      throw new AppError(
        503,
        "Timeless not configured — TIMELESS_API_KEY missing",
        "TIMELESS_NOT_CONFIGURED",
      );
    }

    const res = await fetch(`${BASE_URL}/meetings/${meetingId}/transcript`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.TIMELESS_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new AppError(
        502,
        `Timeless HTTP ${res.status}: ${body.slice(0, 300)}`,
        "TIMELESS_HTTP_ERROR",
      );
    }

    const json = (await res.json()) as TimelessTranscriptResponse;

    const segments: CallTranscriptSegment[] = json.segments.map((s) => ({
      speaker: s.speaker_name ?? s.speaker_id,
      text: s.text,
      startTime: s.start_time,
      endTime: s.end_time,
    }));

    return {
      meetingId: json.meeting_id,
      segments,
      fullText: segments.map((s) => s.text).join(" "),
      title: json.title,
      duration: json.duration,
      createdAt: json.created_at,
    };
  }
}

export const timelessClient = new TimelessClient();
