import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,renew,submit} from './lease.mjs';
const ready={owner:'WORK',status:'READY'};
const evidence={sha:'a'.repeat(40)};
test('malformed expiry cannot renew or submit and never mutates input',()=>{
  const valid=claim(ready,'WORK',100,10,'lease-a');
  for(const expiry of [undefined,null,NaN,Infinity,'110',109.5,-1]){
    const task={...valid,lease:{...valid.lease,expiresAt:expiry}};
    const before=structuredClone(task);
    assert.throws(()=>renew(task,'WORK','lease-a',1,105,10));
    assert.throws(()=>submit(task,'WORK','lease-a',1,105,evidence));
    assert.deepEqual(task,before);
  }
});
test('current task owner and fencing generation must agree with lease',()=>{
  const valid=claim(ready,'WORK',100,10,'lease-a');
  for(const task of [
    {...valid,fence:2},
    {...valid,owner:'CLAUDE'},
    {...valid,fence:undefined},
    {...valid,lease:{...valid.lease,fence:0}}
  ]){
    assert.throws(()=>renew(task,'WORK','lease-a',1,105,10));
    assert.throws(()=>submit(task,'WORK','lease-a',1,105,evidence));
  }
});
test('claim rejects malformed actor, generation and expired lease',()=>{
  for(const owner of [undefined,null,'','UNTRUSTED']){
    assert.throws(()=>claim({owner,status:'READY'},owner,100,10,'token'));
  }
  for(const fence of [-1,0.5,NaN,'1',Number.MAX_SAFE_INTEGER]){
    assert.throws(()=>claim({...ready,fence},'WORK',100,10,'token'));
  }
  const valid=claim(ready,'WORK',100,10,'lease-a');
  assert.throws(()=>claim({...valid,lease:{...valid.lease,expiresAt:99.5}},'WORK',110,10,'new'));
  assert.throws(()=>claim({...valid,fence:2},'WORK',110,10,'new'));
});
test('valid expired generation can be reclaimed, renewed and submitted',()=>{
  const old=claim(ready,'WORK',100,10,'lease-a');
  const current=claim(old,'WORK',110,10,'lease-b');
  assert.equal(current.fence,2);
  const renewed=renew(current,'WORK','lease-b',2,115,20);
  assert.equal(renewed.lease.expiresAt,135);
  assert.equal(submit(renewed,'WORK','lease-b',2,134,evidence).status,'REVIEW');
  assert.throws(()=>submit(renewed,'WORK','lease-b',2,135,evidence));
});
