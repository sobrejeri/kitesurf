/**
 * Evidence retention assessment (dry-run only).
 *
 * This does NOT delete records or Storage objects, or define the legal
 * retention period. The operations team must approve a policy, verify
 * dispute/legal-hold status, then use the Storage API with an audit trail.
 */
export type EvidenceReviewInput = {
  createdAtMs: number;
  confirmed: boolean;
  caseState: 'open' | 'reviewing' | 'resolved' | 'unknown';
  legalHold: boolean | null;
};
export type EvidenceReviewDecision =
  | { kind: 'retain'; reason: string }
  | { kind: 'manual_review_candidate'; reason: string };

export function assessEvidenceForManualCleanup(
  evidence: EvidenceReviewInput,
  nowMs: number,
  pendingReviewAfterDays: number,
): EvidenceReviewDecision {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(evidence.createdAtMs) ||
      evidence.createdAtMs < 0 || evidence.createdAtMs > nowMs ||
      !Number.isInteger(pendingReviewAfterDays) ||
      pendingReviewAfterDays < 1 || pendingReviewAfterDays > 3650) {
    throw new RangeError('Invalid evidence retention review input');
  }
  if (evidence.confirmed) {
    return { kind: 'retain', reason: 'Confirmed evidence is never automatically deleted' };
  }
  if (evidence.legalHold !== false || evidence.caseState !== 'resolved') {
    return { kind: 'retain', reason: 'Unresolved or unverified preservation obligation' };
  }
  const ageMs = nowMs - evidence.createdAtMs;
  if (ageMs < pendingReviewAfterDays * 86_400_000) {
    return { kind: 'retain', reason: 'Pending-upload review period not elapsed' };
  }
  return {
    kind: 'manual_review_candidate',
    reason: 'Unconfirmed expired upload may be reviewed after independent legal and Storage verification',
  };
}
