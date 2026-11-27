/** Disabled until the Business schema and private Storage are validated. */
export function businessReceiptsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED === 'true';
}
