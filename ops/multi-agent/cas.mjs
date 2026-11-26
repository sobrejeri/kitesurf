// Adapter must provide authenticated read() and compareAndSwap(version, document).
// A conflict must never be treated as success. No agent activation here.
export async function transition(store, taskId, mutate) {
  const {version, document} = await store.read();
  if (!version || !Array.isArray(document.tasks)) throw Error('invalid snapshot');
  const matches = document.tasks.filter(t=>t.id===taskId);
  if(matches.length!==1) throw Error('invalid task identity');
  const next = mutate(structuredClone(matches[0]));
  if(next.id!==taskId) throw Error('identity changed');
  const revision=(document.revision??0)+1;
  if(!Number.isSafeInteger(revision)) throw Error('revision overflow');
  const updated={...document,revision,tasks:document.tasks.map(t=>t.id===taskId?next:t)};
  if(await store.compareAndSwap(version,updated)!==true) throw Error('queue conflict; reread before retry');
  return next;
}
