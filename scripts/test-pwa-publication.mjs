import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Lote de 10, item 9: invariantes de PUBLICAÇÃO e ATUALIZAÇÃO do PWA (cache nunca guarda resposta autenticada; versão sempre ao vivo).
// Não substitui o teste em iPhone/Android: isso exige o aparelho.
const read = (p) => readFileSync(p, 'utf8');

// 1. /api/version: dinâmica, sem cache, devolve o SHA do deploy do Render (nada de segredo).
const version = read('src/app/api/version/route.ts');
assert.match(version, /export const dynamic = 'force-dynamic'/);
assert.match(version, /RENDER_GIT_COMMIT/, 'o marcador é o SHA do deploy');
assert.match(version, /no-store/, 'sem cache');
assert.doesNotMatch(version, /process\.env\.(?!RENDER_GIT_COMMIT|NEXT_PUBLIC_BUILD_ID)\w+/, 'só lê as duas variáveis de versão');

// 2. next.config: version.json sem cache e o id do build vem do SHA do Render.
const config = read('next.config.mjs');
assert.match(config, /source: '\/version\.json'[\s\S]*no-store/, 'version.json sem cache');
assert.match(config, /RENDER_GIT_COMMIT/, 'id do build = SHA do Render');
for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) assert.match(config, new RegExp(header), `cabeçalho ${header}`);

// 3. Service worker: não usa Cache API (nenhuma resposta, autenticada ou não, entra em cache); só devolve a tela de "sem conexão" a navegações das áreas do app.
const sw = read('public/sw.js');
assert.doesNotMatch(sw, /\bcaches\b|CacheStorage|cache\.put|cache\.add|addAll|skipWaiting/, 'o worker não guarda nada em cache e não força troca de versão');
assert.match(sw, /request\.mode !== 'navigate'/, 'só navegações');
assert.match(sw, /aluno\|instrutor\|admin\|afiliado/, 'só as áreas do app');
assert.match(sw, /'Cache-Control': 'no-store'/, 'a tela offline também não é guardada');
assert.match(sw, /fetch\(request\)\.catch/, 'online sempre vai à rede');

// 4. Registro e aviso de atualização: sem cache do script do worker, compara a versão remota e recarrega com parâmetro novo.
const prompt = read('src/components/update-prompt.tsx');
assert.match(prompt, /register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/, 'o script do worker nunca vem do cache HTTP');
assert.match(prompt, /\/api\/version/, 'consulta a versão ao vivo');
assert.match(prompt, /vento_build/, 'recarga com parâmetro novo (contorna cache de página do iOS Safari)');
assert.match(prompt, /try \{[\s\S]*localStorage[\s\S]*catch/, 'localStorage indisponível não quebra o app');

// 5. Manifesto instalável e ícones existentes.
const manifest = JSON.parse(read('public/manifest.webmanifest'));
assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
for (const icon of manifest.icons) assert.ok(existsSync('public' + icon.src), `ícone ${icon.src} existe`);
assert.ok(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'), 'ícones 192 e 512');
console.log('PASS: publicação e atualização do PWA: versão ao vivo sem cache, worker sem Cache API, registro sem cache HTTP, manifesto instalável');
