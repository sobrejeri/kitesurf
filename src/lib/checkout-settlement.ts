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

type SplitInput = {
  totalCents: number
  platformCents: number
  affiliateCents?: number
}

/** Builds a gross allocation from commission amounts calculated on the server, before gateway fees. */
export function buildCheckoutSplit({ totalCents, platformCents, affiliateCents = 0 }: SplitInput) {
  if (![totalCents, platformCents, affiliateCents].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new RangeError('Split amounts must be non-negative integer cents')
  }

  const instructorCents = totalCents - platformCents - affiliateCents
  if (instructorCents <= 0 || platformCents <= 0) {
    throw new RangeError('Split must include positive instructor and platform amounts')
  }

  const recipients = [
    { role: 'instructor' as const, amountCents: instructorCents },
    { role: 'platform' as const, amountCents: platformCents },
  ]
  return affiliateCents > 0
    ? [...recipients, { role: 'affiliate' as const, amountCents: affiliateCents }]
    : recipients
}
