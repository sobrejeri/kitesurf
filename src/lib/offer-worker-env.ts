import 'server-only';

/** Never import from client components or expose these values to the browser. */
export function offerWorkerEnv() {
  return {
    // eslint-disable-next-line no-restricted-syntax -- server-only worker feature gate
    enabled: process.env.VENTO_OFFER_WORKER_ENABLED === 'true',
    // eslint-disable-next-line no-restricted-syntax -- server-only worker apply gate
    apply: process.env.VENTO_OFFER_WORKER_APPLY === 'true',
    // eslint-disable-next-line no-restricted-syntax -- server-only bearer secret
    secret: process.env.VENTO_OFFER_WORKER_SECRET,
    // eslint-disable-next-line no-restricted-syntax -- server-only Supabase service key
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
