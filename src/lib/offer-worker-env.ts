import 'server-only';

/** Never import from client components or expose these values to the browser. */
export function offerWorkerEnv() {
  return {
    enabled: process.env.VENTO_OFFER_WORKER_ENABLED === 'true',
    apply: process.env.VENTO_OFFER_WORKER_APPLY === 'true',
    secret: process.env.VENTO_OFFER_WORKER_SECRET,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
