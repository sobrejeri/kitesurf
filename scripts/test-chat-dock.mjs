import assert from 'node:assert/strict';
import {chatBookingId,chatBubbles,mergeChatMessages} from '../src/lib/chat-dock.ts';
const id='00000000-0000-0000-0000-000000000001';
assert.equal(chatBookingId(`/aluno/atendimento/${id}`,'aluno'),id);
assert.equal(chatBookingId(`/instrutor/atendimento/${id}`,'aluno'),null);
assert.equal(chatBookingId(`/aluno/atendimento/${id}?antes=x`,'aluno'),null);
assert.equal(chatBookingId(`/aluno/atendimento/${id}/extra`,'aluno'),null);
const threads=[
  {id:'old',peerId:'teacher',lastAt:'2026-11-01T10:00:00Z',unread:2},
  {id:'new',peerId:'teacher',lastAt:'2026-11-02T10:00:00Z',unread:3},
  {id:'read',peerId:'other',lastAt:'2026-11-03T10:00:00Z',unread:0},
];
const bubbles=chatBubbles(threads);
assert.equal(bubbles.length,1);assert.equal(bubbles[0].id,'new');assert.equal(bubbles[0].unread,5);
assert.equal(threads[0].unread,2);assert.equal(threads[1].unread,3);
const message=(id,created_at,body=id)=>({id,created_at,body,sender_id:'owner'});
const a=message('a','2026-11-04T10:00:00-03:00');
const b=message('b','2026-11-04T13:00:00Z');
const c=message('c','2026-11-04T13:01:00Z');
const merged=mergeChatMessages([b,c],[a,b]);
assert.deepEqual(merged.map(m=>m.id),['a','b','c']);
assert.equal(mergeChatMessages([b],[{...b,body:'latest'}])[0].body,'latest');
console.log('PASS: chat bubbles group each participant without mixing reservations; history merges without duplicates');
