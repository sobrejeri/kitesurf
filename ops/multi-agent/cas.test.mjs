import test from 'node:test';
import assert from 'node:assert/strict';
import {transition} from './cas.mjs';
import {claim} from './lease.mjs';
test('simultaneous claims: exactly one persists',async()=>{
 let version='v0', document={tasks:[{id:'a',owner:'WORK',status:'READY'}]};
 const store={async read(){return {version,document:structuredClone(document)}},async compareAndSwap(v,d){if(v!==version)return false;document=d;version='v'+d.revision;return true}};
 const results=await Promise.allSettled(['one','two'].map(token=>transition(store,'a',t=>claim(t,'WORK',100,10,token))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.equal(document.revision,1);
 assert.equal(document.tasks[0].fence,1);
});
