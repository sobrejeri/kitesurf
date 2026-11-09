/**
 * VentoKite Protege - side-effect-free incident classification.
 *
 * A check-in proves at most presence at a point in time; it does not prove
 * minutes delivered or authorize payouts. Settlement and refund decisions MUST
 * stay behind a separately authorized, audited server-side workflow.
 *
 * This module is deliberately NOT imported by checkout or booking actions.
 */
export const PROTECTION_RESPONSE_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
export const PROTECTION_FIRST_REMINDER_MS = 24 * 60 * 60 * 1000;

export type LessonStatement =
  | 'none'
  | 'delivered'
  | 'partially_delivered'
  | 'not_delivered'
  | 'student_absent'
  | 'weather_or_safety';

export type ProtectionPhase =
  | 'not_due'
  | 'awaiting_statements'
  | 'presence_documented'
  | 'matching_statements'
  | 'conflicting_statements'
  | 'admin_review';

export type ProtectionInput = {
  /** Unix epoch milliseconds of the PLANNED END of the lesson. */
  scheduledEndMs: number;
  /** Unix epoch milliseconds from server clock. */
  nowMs: number;
  /** A verified, timely QR/PIN scan. Never derive from a retrospective entry. */
  verifiedCheckIn: boolean;
  studentStatement: LessonStatement;
  instructorStatement: LessonStatement;
};

export type ProtectionAssessment = {
  phase: ProtectionPhase;
  responseDeadlineMs: number;
  needsIncidentHandling: boolean;
  notifyMissingParties: boolean;
  requiresAdminReview: boolean;
  /** Advisory hold flag. Real gateway retention is NOT implemented here. */
  settlementHoldRecommended: boolean;
  /** Never infer payout authorization from a statement or silence. */
  autoReleaseAuthorized: false;
};

function validEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function assessLessonProtection(input: ProtectionInput): ProtectionAssessment {
  const { scheduledEndMs, nowMs, verifiedCheckIn, studentStatement, instructorStatement } = input;
  if (!validEpoch(scheduledEndMs) || !validEpoch(nowMs)) {
    throw new RangeError('Expected non-negative safe integer Unix epoch milliseconds');
  }
  const deadline = scheduledEndMs + PROTECTION_RESPONSE_WINDOW_MS;
  if (!validEpoch(deadline)) throw new RangeError('Protection deadline outside supported epoch range');

  const studentReplied = studentStatement !== 'none';
  const instructorReplied = instructorStatement !== 'none';
  const bothReplied = studentReplied && instructorReplied;
  const conflict = bothReplied && studentStatement !== instructorStatement;
  const hasEnded = nowMs >= scheduledEndMs;

  let phase: ProtectionPhase;
  if (!hasEnded) phase = 'not_due';
  else if (nowMs >= deadline) phase = 'admin_review';
  else if (conflict) phase = 'conflicting_statements';
  else if (bothReplied) phase = 'matching_statements';
  else if (verifiedCheckIn) phase = 'presence_documented';
  else phase = 'awaiting_statements';

  return {
    phase,
    responseDeadlineMs: deadline,
    needsIncidentHandling: hasEnded,
    notifyMissingParties: hasEnded
      && nowMs >= scheduledEndMs + PROTECTION_FIRST_REMINDER_MS
      && nowMs < deadline
      && (!studentReplied || !instructorReplied),
    requiresAdminReview: hasEnded && (conflict || nowMs >= deadline),
    // The source booking/meeting settlement state remains authoritative.
    // When this assessor is called for an unresolved incident, recommending
    // a hold is safer than silently paying either party.
    settlementHoldRecommended: hasEnded,
    autoReleaseAuthorized: false,
  };
}
