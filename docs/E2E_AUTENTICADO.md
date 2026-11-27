# E2E autenticado (contas fictícias) — como rodar e o que prova

> **Bloqueio de segurança:** o cenário P de escrita está desabilitado antes de criar a solicitação. A oferta agora é vinculada à solicitação, o aceite exige o link da reserva na página dessa solicitação e os dois encontros recebem UUIDs distintos antes do primeiro início. Os testes desses protocolos usam páginas simuladas; ainda não comprovam o DOM real nem a jornada completa. As variáveis de escrita não removem o bloqueio. Falta concluir o percurso do segundo encontro, revisar a pilha e executar o E2E autenticado antes de habilitá-lo.

**O que é:** `scripts/e2e/run.mjs`, um roteiro em navegador real (Playwright/Chromium) que entra com contas **fictícias** de cada perfil e devolve PASS / FAIL / BLOQUEADO por cenário, com capturas. É o primeiro passo para tirar as frentes de "0/16 homologadas".
**O que NÃO é:** não roda no CI (precisa de credenciais), não abre nenhuma tela de pagamento e **não substitui** o roteiro manual de reserva/fila. Validei o próprio script apenas contra um backend fictício local (login, telas de entrada, e a montagem de 4 h em 2 encontros na tela real do aluno, sem enviar); ainda **não foi executado contra o app de teste real**.

## Pré-requisitos (feitos por quem tem acesso ao projeto de TESTE)
1. Contas fictícias no projeto de teste: Aluno, Instrutor (aprovado, com praia e idioma), Afiliado e, se quiser, Admin (com o autenticador já configurado).
2. Playwright na máquina de quem roda: `npm i -D playwright && npx playwright install chromium`.
3. Nunca use contas reais. As capturas ficam em disco local (`E2E_OUT`, padrão `e2e-out/`); não as suba ao GitHub sem conferir.

## Variáveis (só ambiente; nada é impresso nem gravado)
| Variável | Para quê |
|---|---|
| `E2E_BASE_URL` | Ex.: `http://localhost:3000` ou o app de teste. **Obrigatória** |
| `E2E_ALLOWED_HOSTS` | Hosts aceitos (padrão: localhost, 127.0.0.1, `vento-kitesurf.onrender.com`). Qualquer outro é recusado |
| `E2E_STUDENT_EMAIL` / `_PASSWORD`, `E2E_INSTRUCTOR_*`, `E2E_AFFILIATE_*`, `E2E_ADMIN_*` | Contas fictícias. Perfil sem credencial fica BLOQUEADO |
| `E2E_ADMIN_TOTP_SECRET` | Chave base32 do autenticador da conta Admin **fictícia** (gera o código de 6 dígitos) |
| `E2E_WRITE=sim` | Permite os cenários que **gravam** (salvar turnos do instrutor fictício, registrar e remover uma folga) |
| `E2E_OUT` | Pasta do relatório e das capturas |

```bash
E2E_BASE_URL=https://<app-de-teste> E2E_INSTRUCTOR_EMAIL=... E2E_INSTRUCTOR_PASSWORD=... node scripts/e2e/run.mjs
```
Sem `E2E_WRITE=sim` o roteiro só lê (o cenário P fica BLOQUEADO). O resultado vai para `e2e-out/resultado.md` e `resultado.json`; o código de saída é 1 se houver FAIL.

## Cenários
- **S0** as quatro telas de entrada abrem e cabem na tela (celular 390 px e PC 1280 px).
- **S1** login de cada perfil chega à própria área (Admin: passa pelo código do autenticador). **S1b** um perfil logado não acessa as outras áreas (cada app tem o seu cookie).
- **P (cenário prioritário, `scripts/e2e/cenario-4h.mjs`)**, só com `E2E_WRITE=sim` **e** `E2E_CONFIRM_NO_CHARGE=sim`: P1 aluno monta 4 h em 2 encontros de 2 h e pede instrutor; P2 instrutor aceita; P3 aluno vê a reserva, confirma **sem cobrança** (botões "Confirmar aula sem cobrança"/"Confirmar pagamento de teste", nunca pagamento real) e lê o código de presença; P4 instrutor inicia o 1º encontro com o código; P5 registra minutos e etapas (competências); P6 aluno confere evolução e saldo (realizadas, agendadas, disponíveis). Cada passo que falha deixa os seguintes BLOQUEADO. Variáveis extras: `E2E_BEACH` (nome da praia), `E2E_M1`/`E2E_M2` ("AAAA-MM-DDTHH:MM", Fortaleza; padrão: 1º encontro daqui a 2 h, 2º dois dias depois às 09:00), `E2E_DONE_MINUTES` (padrão 120).
- **M2** (fila A→B→C com 3 instrutores, #92) fica **BLOQUEADO** por desenho: depende de 3 instrutores aprovados e do agendador no projeto de teste.

## Segurança do próprio runner
Recusa host fora da lista; não envia credenciais a nada além do formulário de entrada do app; não toca pagamento; só grava com `E2E_WRITE=sim` e só nas contas informadas. Os vetores da RFC 6238 do gerador de código estão em `scripts/test-e2e-totp.mjs` (roda no CI).

## Próximos passos para ampliar (em ordem)
1. Rodar contra o app de teste com as contas fictícias e arquivar `resultado.md` na issue #103.
2. Automatizar a reserva do aluno (2h e 4h) e o aceite/confirmação sem cobrança (#90).
3. Fila A→B→C com 3 instrutores (#92), após o agendador do projeto de teste.

## Varredura de telas (`scripts/e2e/crawl.mjs`)
Visita **todas as telas estáticas** de cada área (descobertas em `src/app`; rotas com `[id]` são puladas) em 390 px e 1280 px, só por GET: não clica nem envia formulários. Por tela aponta erro HTTP, rolagem horizontal, erros de console, requisições que falharam, imagens quebradas ou sem `alt`, botões/links/campos sem nome acessível, alvos de toque menores que 40 px no celular, `lang` e título ausentes. Saída em `crawl-out/telas.md`. As mesmas variáveis do E2E valem. Tela sem sessão do perfil fica BLOQUEADO.
Na primeira rodada, contra o backend fictício, a varredura achou alvos de toque pequenos (corrigidos em outra PR). Avisos de `NaN` no console e o 404 de `/instrutor/checkin` vieram do backend fictício e da tela que exige parâmetro; confirme no app de teste.

## Regressões do protocolo de aceite e confirmação (#103)

`scripts/test-e2e-accept-once.mjs` usa relógio determinístico e páginas simuladas para provar que resposta tardia, ausência de resposta e exceção no clique nunca repetem o aceite. A confirmação exige a página da solicitação correta e um único link da reserva, com origem, rota e UUID validados. P3 exige estado exato `Confirmada` no voucher dessa reserva e códigos de presença consistentes; texto genérico ou ausência do botão não bastam.

`scripts/test-e2e-booking-targets.mjs` também confere que os dois encontros da reserva possuem UUIDs válidos e distintos antes do início. Ausência, duplicidade, identidade inválida e repetição do mesmo encontro em posições diferentes são recusadas. Esses testes não executam os formulários do app real.

O segundo encontro continua sem percurso de início/registro no runner. Seu horário padrão é dois dias após o primeiro, podendo estar fora da janela permitida quando o roteiro for executado; não adiantar datas nem contornar a regra para obter PASS.
