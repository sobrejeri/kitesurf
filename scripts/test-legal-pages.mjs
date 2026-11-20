import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const proxy = readFileSync('src/proxy.ts', 'utf8');
for (const path of ['/termos', '/privacidade']) assert.match(proxy, new RegExp(`'${path}'`), `${path} precisa ser pública (visitante sem sessão)`);
for (const [file, other] of [['src/app/termos/page.tsx', '/privacidade'], ['src/app/privacidade/page.tsx', '/termos']]) {
  const page = readFileSync(file, 'utf8');
  assert.match(page, new RegExp(`href: '${other}'`), `${file} deve ligar à outra página`);
  assert.doesNotMatch(page, /service_role|SUPABASE/i, 'texto público não pode citar segredos');
}
const shell = readFileSync('src/components/legal-page.tsx', 'utf8');
assert.match(shell, /Rascunho para revisão jurídica/, 'a página deve avisar que é rascunho');
const privacy = readFileSync('src/app/privacidade/page.tsx', 'utf8');
assert.match(privacy, /LGPD/, 'privacidade cita direitos da LGPD');
assert.match(privacy, /não há cobrança real/i, 'não afirmar coleta de cartão nesta fase');
const auth = readFileSync('src/components/auth/area-auth.tsx', 'utf8');
assert.match(auth, /href="\/termos"/); assert.match(auth, /href="\/privacidade"/);
console.log('PASS: termos e privacidade públicos, com aviso de rascunho e links no cadastro');
