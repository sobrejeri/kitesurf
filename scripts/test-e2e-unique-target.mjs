import assert from 'node:assert/strict';
import { requireUniqueTarget, requireUuid } from './e2e/unique-target.mjs';

const target = { count: async () => 1 };
assert.equal(await requireUniqueTarget(target, 'oferta'), target);
for (const count of [0, 2]) {
  await assert.rejects(requireUniqueTarget({ count: async () => count }, 'oferta'), /esperado um alvo/);
}
assert.equal(requireUuid('ABCDEF12-1234-1234-1234-123456789ABC', 'solicitação'), 'abcdef12-1234-1234-1234-123456789abc');
for (const bad of ['', 'x', '12345678-1234-1234-1234-123456789abc" i]']) {
  assert.throws(() => requireUuid(bad, 'solicitação'), /inválido/);
}
console.log('E2E unique target checks passed.');
