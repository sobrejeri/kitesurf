import { requireUuid } from './unique-target.mjs';

/** Report application writes only after bound, persisted state was observed.
 * An unresolved attempt stays unknown; false is not proof that the server did
 * not commit a request whose response was lost. No credentials or PINs enter it.
 */
export function createWriteEvidence() {
  const attempts=new Map();
  const identity=(value={})=>{
    if(Object.keys(value).some(key=>!['requestId','bookingId','meetingId'].includes(key)))throw new Error('evidência contém campo inesperado');
    return Object.fromEntries(Object.entries(value).map(([key,id])=>[key,requireUuid(id,key)]));
  };
  return {
    attempt(step,ids={}) {
      if(!/^P[1-8]$/.test(step))throw new Error('etapa de escrita inválida');
      const token=Symbol(step);
      attempts.set(token,{step,ids:identity(ids),confirmed:false});
      return token;
    },
    confirm(token,ids={}) {
      const entry=attempts.get(token);
      if(!entry)throw new Error('gravação sem tentativa correspondente');
      const additional=identity(ids);
      for(const [key,id] of Object.entries(additional))if(entry.ids[key] && entry.ids[key]!==id)throw new Error('identidade da evidência divergiu');
      entry.ids={...entry.ids,...additional};
      if(!entry.ids.requestId)throw new Error('gravação sem solicitação vinculada');
      entry.confirmed=true;
    },
    summary(writeAuthorized) {
      const rows=[...attempts.values()];
      return {
        escrita_solicitada_por_flags:Boolean(writeAuthorized),
        gravou_dados:rows.some(row=>row.confirmed),
        gravacoes_comprovadas:rows.filter(row=>row.confirmed).length,
        tentativas_sem_confirmacao:rows.filter(row=>!row.confirmed).length,
      };
    },
  };
}

