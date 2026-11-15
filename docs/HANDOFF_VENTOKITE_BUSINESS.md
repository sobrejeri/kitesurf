# VentoKite Business: passagem de bastão (15/11/2026)

Para quem for continuar (outra pessoa ou outra ferramenta). Leia primeiro `AGENTS.md` e `docs/CONTINUIDADE_VENTOKITE.md` (histórico completo, cronológico).

## Estado em uma frase
As 100 telas do plano existem como **demonstração** em `/admin/business/*` (só Admin com segundo fator, dados fictícios, nada grava, nenhum pagamento real). A fase 1 do banco está pronta em migration, **não aplicada**. Nada foi mergeado nem publicado em produção.

Conferência tela por tela: `docs/BUSINESS_CONFERENCIA_100_TELAS.md` (nenhuma faltando; 16 ficaram juntas com outra tela).

## Cuidado antes de mexer em código
O `AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de escrever código: esta versão do Next.js (16.3.x, Turbopack, `src/proxy.ts`) tem mudanças em relação ao que costuma se conhecer. React 19, TypeScript estrito (`noUncheckedIndexedAccess`, sem `!`), Tailwind v4, Supabase.

## Regras do projeto (resumo do AGENTS.md)
- Dinheiro em centavos inteiros; percentuais em pontos-base; nunca ponto flutuante.
- Valores calculados no banco; o cliente só envia escolhas. Divisão: comissão uma vez e o líquido por subtração.
- Escrita só por função `SECURITY DEFINER` que confere papel e dono; RLS em todas as tabelas; ler por id não é permissão.
- Admin nunca é autoatribuído. Ações administrativas geram auditoria append-only.
- Migration aplicada não se edita: crie a próxima. Só `NEXT_PUBLIC_*` no app; sem `service_role`; sem bypass de autorização.
- Durações em minutos (`1h 30min`), datas no fuso de Fortaleza.
- Antes de commitar: `pnpm typecheck && pnpm lint && pnpm build`; se mexeu no banco, `scripts/test-db.sh`.

Regras específicas do Business, já testadas: a escola paga instrutores **fora** do VentoKite (nada de repasse automático); comissão de afiliado **nunca** aparece como paga; Pix e cartão são só registro externo; reserva e comissão têm valor congelado (mudança de percentual vale só dali em diante); uma escola nunca vê dados privados de outra (outra empresa aparece só como "ocupado"); suspender vínculo na escola não bane o instrutor.

## Pilha de PRs (todos em draft, empilhados)
Cada PR tem como base a branch do anterior. A base do primeiro é a branch de produção `claude/cool-ride-x47z5c`, **que publica sozinha no Render quando recebe merge**.

| Ordem | PR | Branch | Conteúdo |
|---|---|---|---|
| 1 | #262 | `feat/ventokite-business` | Indicadores de desempenho no Admin |
| 2 | #263 | `feat/ventokite-business-shell` | Estrutura visual do Business (menu, filtros, unidades, funcionários, permissões, agenda) |
| 3 | #264 | `feat/ventokite-business-services` | Bloco 4: serviços, preços, pacotes |
| 4 | #265 | `feat/ventokite-business-bookings` | Bloco 10: reservas presenciais |
| 5 | #266 | `feat/ventokite-business-cash` | Bloco 6: caixa e fechamento (Excel e PDF) |
| 6 | #267 | `feat/ventokite-business-finance` | Bloco 7: financeiro e comissões de instrutores |
| 7 | #268 | `feat/ventokite-business-stock` | Bloco 9: estoque e aluguéis |
| 8 | #269 | `feat/ventokite-business-shop` | Bloco 5: lojinha da escola |
| 9 | #270 | `feat/ventokite-business-affiliates` | Bloco 8: afiliados da empresa |
| 10 | #271 | `feat/ventokite-business-company` | Blocos 1 e 2: empresa e equipe |
| 11 | #272 | `feat/ventokite-business-instructors` | Bloco 3: instrutores |
| 12 | #274 | `docs/ventokite-business-schema-proposal` | Proposta do esquema multiempresa (documentos) |
| 13 | #275 | `feat/ventokite-business-db-phase1` | Migration da fase 1 (**não aplicada**) |

Como integrar: de baixo para cima, um por vez, só depois de revisão humana. Ao integrar um PR, mude a base do seguinte para a branch de produção antes de integrá-lo. Cada integração na base de produção dispara deploy.

Outros PRs abertos que **não** fazem parte do Business (não mexi neles nesta frente): #1, #35, #130, #135, #156, #160, #176, #186, #253, #273.

## Onde está cada coisa
- Telas: `src/app/admin/business/**`. Layout com `requireRole(['admin'])` e segundo fator; rotas de arquivo repetem a checagem.
- Dados fictícios: `src/lib/business/demo.ts`. Regras puras (testáveis sem navegador): `rules.ts`, `services.ts`, `bookings.ts`, `caixa.ts`, `finance.ts`, `stock.ts`, `shop.ts`, `affiliates.ts`, `company.ts`, `instructors.ts`; arquivos Excel/PDF escritos à mão em `files.ts` e `report.ts` (sem dependência nova).
- Componentes: `src/components/business/**`.
- Testes: `scripts/test-business-*.mjs` (e `test-admin-indicators.mjs`), listados em `.github/workflows/verify.yml`. Rodar todos: `grep -E "^\s+run: node " .github/workflows/verify.yml | sed -E 's/^\s+run: //' | while read -r c; do bash -c "$c" || echo "FALHOU: $c"; done`.
- Banco: `supabase/migrations/20261115120000_business_company_core.sql` e `supabase/tests/99zzzzzzzzzzzzz_business_company_core.test.sql` (PR #275). Reversão (só sem dados reais): `docs/proposals/business-multiempresa/REVERSAO_fase1.sql`.

## Como foi verificado, e o limite disso
- Cada bloco: testes das regras, typecheck, lint, build e verificação em navegador (Playwright, desktop 1440 e celular 393) contra um Supabase **simulado local**, não contra o real. Nenhum teste de ponta a ponta real foi feito.
- `scripts/test-db.sh` precisa de `LC_ALL=C.UTF-8` em máquinas sem locale UTF-8; sem isso o teste antigo `10_rules` falha em "slug without accents", com ou sem as migrations novas.

## Pendências que dependem de decisão humana
1. **E-mail confirmado no Supabase** (decisão 7 da proposta): conferir antes de aplicar a migration, porque o aceite de convite compara o e-mail da conta com o do convite.
2. **Aplicar a migration** da fase 1, primeiro num projeto de teste, colando o SQL no editor do Supabase.
3. **`pg_cron`** para expirar solicitações de troca e de saldo (pendência antiga) e convites de empresa.
4. **Migrations 47 e 48** (CPF/CNPJ e segundo fator do admin): conferir se foram aplicadas em produção.
5. Pagamento integrado de comissões (só quando a função financeira estiver homologada), tela do instrutor para confirmar recebimento de pagamento externo, armazenamento de comprovantes, impressão térmica real.

## Próximos passos sugeridos (em ordem)
1. Revisão humana e integração da pilha, de baixo para cima.
2. Confirmar o e-mail confirmado e aplicar a fase 1 num projeto de teste; rodar o teste de banco lá.
3. Ligar a primeira tela real (Unidades) à consulta, atrás de uma flag, mantendo o aviso de demonstração nas demais.
4. Escrever a fase 2 do banco (serviços, preços por unidade e reservas presenciais), seguindo o padrão: `company_id`, política por unidade, escrita só por função, teste de isolamento entre empresas e teste de mutação. Esboço das fases 2 a 6 em `docs/proposals/business-multiempresa/PROPOSTA_esquema_multiempresa.md`.

## Não faça
- Não compartilhe nem cole chaves do Supabase ou do Render. O repositório não precisa delas.
- Não aplique SQL em produção sem teste prévio e sem o responsável.
- Não marque comissão de afiliado como paga nem crie cobrança, checkout ou repasse automático.
- Não force push; não edite migration já aplicada; não faça merge sem revisão.
