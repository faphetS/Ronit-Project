export interface CallTranscriptSegment {
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface CallTranscript {
  meetingId: string;
  segments: CallTranscriptSegment[];
  fullText: string;
  title: string | null;
  duration: number | null;
  createdAt: string;
}

export interface CallProvider {
  fetchTranscript(meetingId: string): Promise<CallTranscript>;
}
