import assert from 'node:assert/strict';
import { webhookInboxDecision as decide } from '../src/lib/sandbox-webhook-inbox.mjs';

const event = { provider: 'mercadopago', eventId: 'evt-1', resourceId: 'payment-1', eventType: 'payment.updated' };
const first = decide(event);
assert.equal(first.action, 'insert');
assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
assert.deepEqual(decide({ ...event, existing: first.fingerprint }), { action: 'duplicate', fingerprint: first.fingerprint });
assert.deepEqual(decide({ ...event, resourceId: 'payment-2', existing: first.fingerprint }), { action: 'reject', reason: 'event_id_collision' });
assert.deepEqual(decide({ ...event, eventType: 'payment.created', existing: first.fingerprint }), { action: 'reject', reason: 'event_id_collision' });
assert.deepEqual(decide({ ...event, eventId: '', existing: null }), { action: 'reject', reason: 'invalid_identity' });
assert.deepEqual(decide({ ...event, eventId: 'a\\nb', existing: null }), { action: 'reject', reason: 'invalid_identity' });
assert.deepEqual(decide({ ...event, existing: 'bad' }), { action: 'reject', reason: 'invalid_existing_fingerprint' });
assert.equal(decide({ ...event, existing: '0'.repeat(64) }).action, 'reject');
console.log('Sandbox webhook inbox preflight passed; no durable storage or PSP calls');
