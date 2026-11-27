import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {runPriorityScenario} from './e2e/cenario-4h.mjs';
import {createCheckpointStore} from './e2e/checkpoint-store.mjs';
import {createWriteEvidence} from './e2e/write-evidence.mjs';

// Execute the actual CLI control flow with only its browser/login/I/O bindings
// injected. No real login, network, form click or application write is possible.
const source=readFileSync(new URL('./e2e/run.mjs',import.meta.url),'utf8').replace(/^#!.*\n/,'').replace(/^import .*;\n/gm,'');
const root=mkdtempSync(join(tmpdir(),'vento-cli-gate-'));
const base='https://example.invalid';
const ACCOUNTS=Object.fromEntries(['aluno','instrutor','admin','afiliado'].map(area=>[area,{path:'/'+area+'/entrar'}]));
function page(initial=base+'/aluno/entrar') {
  let url=initial;
  return {url:()=>url,async goto(target){const area=new URL(target).pathname.split('/')[1];url=base+'/'+area+'/entrar';return{ok:()=>true,status:()=>200};},
    locator(){return{count:async()=>1,first(){return this;},innerText:async()=>''};}};
}
try{
  const absent=join(root,'absent.json'),corrupt=join(root,'corrupt.json');
  writeFileSync(corrupt,'{not json',{mode:0o600});
  for(const path of [absent,corrupt]){
    assert.throws(()=>createCheckpointStore({path}).load(base),'the eager load really would fail');
    const OUT=join(root,path===absent?'missing-out':'corrupt-out');mkdirSync(OUT);
    const results=[];let exitCode;
    const context={URL,ACCOUNTS,BASE:base,OUT,VIEWPORTS:{pc:{width:1280,height:900}},WRITE:true,results,
      join,writeFileSync,runPriorityScenario,createCheckpointStore,createWriteEvidence,
      process:{env:{E2E_CONFIRM_NO_CHARGE:'sim',E2E_RESUME_CHECKPOINT:path},exit(code){exitCode=code;}},
      record(id,titulo,status,detalhe=''){results.push({id,titulo,status,detalhe});},shot:async()=>{},overflow:async()=>0,
      login:async(area)=>({page:page(base+'/'+area+'/inicio'),context:{close:async()=>{}}}),
      browser:{newContext:async()=>({newPage:async()=>page(),close:async()=>{}}),close:async()=>{}},console:{log(){}},
    };
    await vm.runInNewContext('(async()=>{'+source+'})()',context);
    assert.equal(exitCode,0);
    const report=JSON.parse(readFileSync(join(OUT,'resultado.json'),'utf8'));
    assert.equal(report.summary.gravou_dados,false);
    assert.equal(report.summary.tentativas_sem_confirmacao,0);
    assert.equal(report.results.filter(row=>/^P[1-9]$/.test(row.id)&&row.status==='BLOQUEADO').length,9);
    assert.match(readFileSync(join(OUT,'resultado.md'),'utf8'),/gravação comprovada: não/);
  }
  console.log('PASS: real CLI emits truthful blocked reports with missing/corrupt resume files; gate prevents checkpoint loading and application writes');
}finally{rmSync(root,{recursive:true,force:true});}

