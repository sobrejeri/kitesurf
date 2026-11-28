import test from 'node:test';
import assert from 'node:assert/strict';
import {claim,renew,submit} from './lease.mjs';
const ready={owner:'WORK',status:'READY'};
test('exclusive claim and owner',()=>{
 const a=claim(ready,'WORK',100,10,'a');
 assert.throws(()=>claim(a,'WORK',101,10,'b'));
 assert.throws(()=>claim(ready,'CLAUDE',100,10,'b'));
});
test('expired claim fences old worker',()=>{
 const a=claim(ready,'WORK',100,10,'a');
 const b=claim(a,'WORK',110,10,'b');
 assert.equal(b.fence,2);
 assert.throws(()=>submit(b,'WORK','a',1,111,{sha:'a'.repeat(40)}));
 assert.equal(submit(b,'WORK','b',2,111,{sha:'b'.repeat(40)}).status,'REVIEW');
});
test('renewal and evidence validation',()=>{
 const a=claim(ready,'WORK',100,10,'a');
 const b=renew(a,'WORK','a',1,105,20);
 assert.equal(b.lease.expiresAt,125);
 assert.throws(()=>submit(b,'WORK','a',1,125,{sha:'a'.repeat(40)}));
 assert.throws(()=>submit(b,'WORK','a',1,110,{sha:'invalid'}));
});
