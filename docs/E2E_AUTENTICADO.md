# E2E autenticado (contas fictícias) — como rodar e o que prova

**O que é:** `scripts/e2e/run.mjs`, um roteiro em navegador real (Playwright/Chromium) que entra com contas **fictícias** de cada perfil e devolve PASS / FAIL / BLOQUEADO por cenário, com capturas. É o primeiro passo para tirar as frentes de "0/16 homologadas".
**O que NÃO é:** não roda no CI (precisa de credenciais), não abre nenhuma tela de pagamento e **não substitui** o roteiro manual de reserva/fila. Validei o próprio script apenas contra um backend fictício local; ainda **não foi executado contra o app de teste real**.

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
Sem `E2E_WRITE=sim` o roteiro só lê. O resultado vai para `e2e-out/resultado.md` e `resultado.json`; o código de saída é 1 se houver FAIL.

## Cenários
- **S0** as quatro telas de entrada abrem e cabem na tela (celular 390 px e PC 1280 px).
- **S1** login de cada perfil chega à própria área (Admin: passa pelo código do autenticador). **S1b** um perfil logado não acessa as outras áreas (cada app tem o seu cookie).
- **S2 (#91, agenda v2)**: telas de turnos e agenda (dia, semana e mês) abrem e cabem; com `E2E_WRITE=sim`: salvar turnos por dia com pausa, recusa de pausa fora do turno, registrar e remover uma folga.
- **M1 e M2** ficam **BLOQUEADO** por desenho: reserva de 2h e 4h e fila A→B→C seguem no roteiro manual (`docs/ROTEIRO_HOMOLOGACAO_FRENTES_89_93_103.md`, `docs/HOMOLOGACAO_AGENDA_91.md`, `docs/HOMOLOGACAO_FILA_92.md`).

## Segurança do próprio runner
Recusa host fora da lista; não envia credenciais a nada além do formulário de entrada do app; não toca pagamento; só grava com `E2E_WRITE=sim` e só nas contas informadas. Os vetores da RFC 6238 do gerador de código estão em `scripts/test-e2e-totp.mjs` (roda no CI).

## Próximos passos para ampliar (em ordem)
1. Rodar contra o app de teste com as contas fictícias e arquivar `resultado.md` na issue #103.
2. Automatizar a reserva do aluno (2h e 4h) e o aceite/confirmação sem cobrança (#90).
3. Fila A→B→C com 3 instrutores (#92), após o agendador do projeto de teste.
