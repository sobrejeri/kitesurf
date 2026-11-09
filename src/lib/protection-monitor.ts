import {
  PROTECTION_FIRST_REMINDER_MS,
  PROTECTION_RESPONSE_WINDOW_MS,
} from './lesson-protection-policy.ts';

/**
 * Read-only projection over booked meetings. A past scheduled meeting is NOT
 * evidence of student or instructor absence. No money/booking/incident update.
 */
export type ProtectionMeetingCandidate = {
  id: string;
  bookingId: string;
  bookingCode: string;
  bookingStatus: string;
  meetingStatus: string;
  startsAt: string;
  minutes: number;
  isTest: boolean;
};

export type ProtectionMonitorPhase = 'awaiting_record' | 'response_window' | 'needs_admin_review';

export type ProtectionMonitorItem = ProtectionMeetingCandidate & {
  scheduledEndMs: number;
  responseDeadlineMs: number;
  phase: ProtectionMonitorPhase;
};

export function listProtectionMonitorItems(
  meetings: readonly ProtectionMeetingCandidate[],
  nowMs: number,
): ProtectionMonitorItem[] {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Invalid server time');
  }
  return meetings.flatMap((meeting): ProtectionMonitorItem[] => {
    // Never turn a finished, cancelled or active lesson into an incident.
    if (meeting.bookingStatus !== 'confirmed' || meeting.meetingStatus !== 'scheduled') return [];
    const startMs = Date.parse(meeting.startsAt);
    if (!Number.isSafeInteger(startMs) || startMs < 0
      || !Number.isSafeInteger(meeting.minutes) || meeting.minutes < 1 || meeting.minutes > 480) return [];
    const endMs = startMs + meeting.minutes * 60_000;
    const deadline = endMs + PROTECTION_RESPONSE_WINDOW_MS;
    if (!Number.isSafeInteger(deadline) || endMs > nowMs) return [];
    const phase: ProtectionMonitorPhase = nowMs >= deadline ? 'needs_admin_review'
      : nowMs >= endMs + PROTECTION_FIRST_REMINDER_MS ? 'response_window' : 'awaiting_record';
    return [{
      ...meeting,
      scheduledEndMs: endMs,
      responseDeadlineMs: deadline,
      phase,
    }];
  }).sort((a, b) => a.responseDeadlineMs - b.responseDeadlineMs
    || a.startsAt.localeCompare(b.startsAt));
}
