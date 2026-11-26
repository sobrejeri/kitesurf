// Dedicated queue branch only. Token supplied by trusted runtime, never queue data.
export function githubStore({token,fetchImpl=fetch}) {
 if(!token) throw Error('missing runtime credential');
 const branch='agent/work/multi-agent-orchestrator';
 const url='https://api.github.com/repos/sobrejeri/kitesurf/contents/ops/multi-agent/queue.json';
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 return {
  async read(){
   const r=await fetchImpl(url+'?ref='+encodeURIComponent(branch),{headers,redirect:'error'});
   if(!r.ok) throw Error('queue read failed: '+r.status);
   const b=await r.json();
   if(b.encoding!=='base64'||!/^[a-f0-9]{40}$/.test(b.sha)) throw Error('invalid snapshot');
   return {version:b.sha,document:JSON.parse(Buffer.from(b.content,'base64').toString('utf8'))};
  },
  async compareAndSwap(version,document){
   if(!/^[a-f0-9]{40}$/.test(version)) throw Error('invalid version');
   const r=await fetchImpl(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},redirect:'error',body:JSON.stringify({branch,sha:version,message:'chore: update agent queue revision '+document.revision,content:Buffer.from(JSON.stringify(document,null,2)+'\n').toString('base64')})});
   if(r.status===409||r.status===422) return false;
   if(!r.ok) throw Error('queue write failed: '+r.status);
   return true;
  }
 };
}
