// Pure transitions only. Caller MUST authenticate actor and persist via CAS.
// Actor names are routing identifiers, not proof of an authenticated runtime.
const validActor = actor => actor === 'WORK' || actor === 'CLAUDE';
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const validToken = token => typeof token === 'string' && token.length > 0;
function validLease(task) {
  const lease = task.lease;
  return lease && validActor(task.owner) && lease.actor === task.owner
    && validToken(lease.token) && Number.isSafeInteger(task.fence) && task.fence > 0
    && lease.fence === task.fence && validTime(lease.expiresAt);
}
export function claim(task, actor, now, ttl, token) {
  if (!validActor(actor) || task.owner !== actor || !validTime(now)
    || !Number.isSafeInteger(ttl) || ttl <= 0 || !validTime(now+ttl)
    || !validToken(token)) throw Error('invalid claim');
  if (task.status === 'CLAIMED') {
    if (!validLease(task) || task.lease.expiresAt > now) throw Error('unavailable');
  } else if (task.status !== 'READY' || task.lease != null) {
    throw Error('unavailable');
  }
  const previousFence = task.fence ?? 0;
  if (!Number.isSafeInteger(previousFence) || previousFence < 0) throw Error('invalid fence');
  const fence = previousFence + 1;
  if (!Number.isSafeInteger(fence)) throw Error('fence overflow');
  return {...task,status:'CLAIMED',fence,lease:{actor,token,fence,expiresAt:now+ttl}};
}
function verify(task,actor,token,fence,now) {
  const lease = task.lease;
  if (task.status !== 'CLAIMED' || !validLease(task)
    || lease.actor !== actor || lease.token !== token || lease.fence !== fence
    || !validTime(now) || now >= lease.expiresAt) throw Error('stale lease');
}
export function renew(task,actor,token,fence,now,ttl) {
  verify(task,actor,token,fence,now);
  if(!Number.isSafeInteger(ttl)||ttl<=0||!validTime(now+ttl)) throw Error('invalid ttl');
  return {...task,lease:{...task.lease,expiresAt:Math.max(task.lease.expiresAt,now+ttl)}};
}
export function submit(task,actor,token,fence,now,evidence) {
  verify(task,actor,token,fence,now);
  if(!evidence || !/^[a-f0-9]{40}$/.test(evidence.sha)) throw Error('missing SHA');
  return {...task,status:'REVIEW',lease:null,evidence};
}
