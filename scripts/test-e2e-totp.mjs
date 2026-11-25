// Vetores oficiais da RFC 6238 (segredo ASCII "12345678901234567890", SHA-1), 6 últimos dígitos dos códigos de 8.
import assert from 'node:assert/strict';
import { totp } from './e2e/totp.mjs';
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 de "12345678901234567890"
const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];
for (const [seconds, expected] of vectors) assert.equal(totp(SECRET, seconds * 1000), expected, `t=${seconds}`);
assert.throws(() => totp('não é base32!', 0));
console.log('TOTP RFC 6238 vectors passed.');
