type SettlementInput = {
  payment: 'pending' | 'approved' | 'failed' | 'refunded' | 'disputed'
  booking: 'scheduled' | 'completed' | 'cancelled'
  chargedMeetings: readonly ('pending' | 'completed' | 'cancelled')[]
  openIncident: boolean
  releaseAuthorized: boolean
}

/** Simulates repasse eligibility after an audited server-side authorization. */
export function settlementEligibility(input: SettlementInput) {
  if (input.payment !== 'approved') return 'payment_not_approved'
  if (input.openIncident) return 'incident_open'
  if (input.booking !== 'completed') return 'booking_not_completed'
  if (!input.chargedMeetings.length || input.chargedMeetings.some(status => status !== 'completed')) {
    return 'meetings_not_completed'
  }
  if (!input.releaseAuthorized) return 'authorization_required'
  return 'eligible'
}
