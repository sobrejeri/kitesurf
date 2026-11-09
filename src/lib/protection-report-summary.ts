/**
 * Safe read-only summary of incident reports already visible to the current
 * participant under the existing booking_incidents RLS policies.
 *
 * A missing report here is NOT evidence that neither party responded:
 * upstream queries are paginated and may be restricted by RLS.
 * No report, check-in, settlement or refund is created by this helper.
 */
export type VisibleProtectionReport = {
  meeting_id: string;
  reported_by: string;
  status: string;
};

export type ProtectionReportSummary = {
  visibleReports: number;
  hasViewerReport: boolean;
  hasOpenOrReviewingReport: boolean;
};

export function summarizeVisibleProtectionReports(
  reports: readonly VisibleProtectionReport[],
  viewerId: string,
): Record<string, ProtectionReportSummary> {
  if (!viewerId.trim()) throw new RangeError('Missing viewer ID');

  const byMeeting: Record<string, ProtectionReportSummary> = Object.create(null);
  for (const report of reports) {
    if (!report.meeting_id) continue;
    const current = byMeeting[report.meeting_id] ?? {
      visibleReports: 0,
      hasViewerReport: false,
      hasOpenOrReviewingReport: false,
    };
    current.visibleReports++;
    current.hasViewerReport ||= report.reported_by === viewerId;
    current.hasOpenOrReviewingReport ||= report.status === 'open' || report.status === 'reviewing';
    byMeeting[report.meeting_id] = current;
  }
  return byMeeting;
}
