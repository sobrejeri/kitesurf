import assert from 'node:assert/strict';
import { friendlyError } from '../src/app/actions/errors.ts';

// A real PostgreSQL deadlock aborts one transaction (40P01); the app must
// offer a manual retry, not expose SQL internals or replay a booking itself.
const text = friendlyError({
  code: '40P01',
  message: 'deadlock detected while locking instructor and student rows',
  details: 'Process 123 waits for ShareLock on transaction 456',
});
assert.match(text, /aguarde.*tente novamente/i);
assert.doesNotMatch(text, /40P01|deadlock|Process|ShareLock/i);

const missing = friendlyError({ code: 'PGRST203', message: 'ambiguous create_booking overload' });
assert.match(missing, /Supabase.*migrações/i);
assert.match(friendlyError({ code: '42501', message: 'permission denied' }), /permissão/i);
console.log('PASS: safe manual retry for deadlock; existing RPC and permission messages preserved');
