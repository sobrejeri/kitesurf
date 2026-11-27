export function businessCoreEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED === 'true';
}
