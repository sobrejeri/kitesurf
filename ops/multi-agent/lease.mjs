// Pure transitions only. Caller MUST authenticate actor and persist via CAS.
export function claim(task, actor, now, ttl, token) {
  if (task.owner !== actor || !Number.isSafeInteger(now) || !Number.isSafeInteger(ttl) || ttl <= 0 || !Number.isSafeInteger(now+ttl) || typeof token !== 'string' || !token) throw Error('invalid claim');
  if (task.status !== 'READY' && !(task.status === 'CLAIMED' && task.lease && task.lease.expiresAt <= now)) throw Error('unavailable');
  const fence = (task.fence ?? 0) + 1;
  if (!Number.isSafeInteger(fence)) throw Error('fence overflow');
  return {...task,status:'CLAIMED',fence,lease:{actor,token,fence,expiresAt:now+ttl}};
}
function verify(task,actor,token,fence,now) {
  const l=task.lease;
  if(task.status !== 'CLAIMED' || !l || l.actor!==actor || l.token!==token || l.fence!==fence || !Number.isSafeInteger(now) || now>=l.expiresAt) throw Error('stale lease');
}
export function renew(task,actor,token,fence,now,ttl) {
  verify(task,actor,token,fence,now);
  if(!Number.isSafeInteger(ttl)||ttl<=0||!Number.isSafeInteger(now+ttl)) throw Error('invalid ttl');
  return {...task,lease:{...task.lease,expiresAt:Math.max(task.lease.expiresAt,now+ttl)}};
}
export function submit(task,actor,token,fence,now,evidence) {
  verify(task,actor,token,fence,now);
  if(!evidence || !/^[a-f0-9]{40}$/.test(evidence.sha)) throw Error('missing SHA');
  return {...task,status:'REVIEW',lease:null,evidence};
}
