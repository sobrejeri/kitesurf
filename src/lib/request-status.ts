export type RequestStatus = 'searching' | 'accepted' | 'expired' | 'cancelled';

/** Only a still-searching request may be displayed as expired by its deadline. */
export function visibleRequestStatus(status: RequestStatus, expiresAt: string, now: number): RequestStatus {
  return status === 'searching' && Date.parse(expiresAt) <= now ? 'expired' : status;
}
