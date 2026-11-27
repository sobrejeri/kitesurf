import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { blocked, validateCheckpoint } from './second-meeting.mjs';

const canonical = (checkpoint) => JSON.stringify(Object.fromEntries(Object.keys(checkpoint).sort()
  .map(key => [key, key === 'meetingIds' ? { 1:checkpoint.meetingIds[1],2:checkpoint.meetingIds[2] } : checkpoint[key]])));
export const checkpointIdentity = (checkpoint) => canonical(Object.fromEntries(Object.entries(checkpoint)
  .filter(([key]) => !['stage','revision'].includes(key))));
const read = (path, base) => {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16_384 || (stat.mode & 0o077)) throw blocked('checkpoint deve ser arquivo privado regular');
    return validateCheckpoint(JSON.parse(readFileSync(fd,'utf8')),base);
  } finally { closeSync(fd); }
};
function privateDirectory(path) {
  mkdirSync(path,{recursive:true,mode:0o700});
  const stat=lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)
    || (process.getuid && stat.uid !== process.getuid())) throw blocked('diretório do journal não é privado');
}
function create(path, checkpoint) {
  const fd=openSync(path,'wx',0o600);
  try { writeFileSync(fd,canonical(checkpoint));fsyncSync(fd); } finally { closeSync(fd); }
}
function replace(path, checkpoint) {
  const temporary=path+'.'+randomUUID()+'.tmp';
  try {
    create(temporary,checkpoint);
    renameSync(temporary,path);
    const fd=openSync(dirname(path),constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } finally { try { unlinkSync(temporary); } catch (error) { if(error.code!=='ENOENT')throw error; } }
}

/** Same-machine durable journal keyed by origin+booking, not by copied filename.
 * Exclusive locks never expire automatically. A crashed holder requires manual
 * read-only reconciliation; silently stealing a stale lock could repeat writes.
 */
export function createCheckpointStore({ path, journalDirectory = join(tmpdir(),'vento-e2e-checkpoints-'+(process.getuid?.() ?? 'user')) }) {
  const output=resolve(path);
  const paths = (checkpoint) => {
    privateDirectory(journalDirectory);
    const key=createHash('sha256').update(checkpoint.baseOrigin+'\n'+checkpoint.bookingId).digest('hex');
    return { state:join(journalDirectory,key+'.json'),lock:join(journalDirectory,key+'.lock') };
  };
  const exclusive = async (checkpoint, fn) => {
    const files=paths(checkpoint);
    let fd;
    try { fd=openSync(files.lock,'wx',0o600); }
    catch(error) { if(error.code==='EEXIST')throw blocked('checkpoint já está em execução ou exige reconciliação de lock; não repetir');throw error; }
    const token=randomUUID();
    writeFileSync(fd,JSON.stringify({token,pid:process.pid}));fsyncSync(fd);closeSync(fd);
    try { return await fn(files); }
    finally {
      // Never remove a lock replaced by another actor.
      if(JSON.parse(readFileSync(files.lock,'utf8')).token!==token)throw blocked('dono do lock mudou; reconciliação necessária');
      unlinkSync(files.lock);
    }
  };
  return {
    load: (base) => read(output,base),
    initialize: async (raw,base) => {
      const checkpoint=validateCheckpoint(raw,base);
      if(checkpoint.revision!==0 || checkpoint.stage!=='first-recorded')throw blocked('checkpoint novo precisa da etapa inicial');
      return exclusive(checkpoint, async(files) => {
        // Refuse overwrite: an older run/journal must be reconciled, not reset.
        create(files.state,checkpoint);
        mkdirSync(dirname(output),{recursive:true});
        create(output,checkpoint);
        return checkpoint;
      });
    },
    withLease: async (raw,base,fn) => {
      const expected=validateCheckpoint(raw,base);
      return exclusive(expected,async(files) => {
        let current;
        try { current=read(files.state,base); }
        catch(error) { if(error.code==='ENOENT')throw blocked('journal da retomada ausente; não importar/copiar como nova execução');throw error; }
        if(checkpointIdentity(current)!==checkpointIdentity(expected))throw blocked('identidade imutável do checkpoint divergiu');
        const lease={
          read: () => structuredClone(current),
          compareAndSwap: async (previous,next) => {
            const disk=read(files.state,base);
            if(canonical(disk)!==canonical(previous) || canonical(current)!==canonical(previous))throw blocked('checkpoint mudou durante a execução');
            const valid=validateCheckpoint(next,base);
            if(checkpointIdentity(valid)!==checkpointIdentity(current) || valid.revision!==current.revision+1)throw blocked('CAS não pode alterar identidade ou reutilizar revisão');
            // Journal first. If mirroring fails, no click is allowed and the
            // authoritative attempted stage still prevents a later retry.
            replace(files.state,valid);
            current=valid;
            replace(output,valid);
          },
        };
        return fn(lease);
      });
    },
  };
}

