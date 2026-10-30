# Vento

Plataforma de aulas de kitesurf em Preá e Jericoacoara (CE): o aluno escolhe as
horas, a fila distribui o pedido entre instrutores independentes, e pousadas
parceiras indicam hóspedes em troca de comissão.

> **Fase atual: base funcional.** Login, perfis por papel, reservas, fila de
> instrutores, registro de aula, preços versionados e pousadas parceiras
> funcionam com Supabase. O **pagamento é simulado** ("Confirmar pagamento de
> teste"): nenhuma cobrança é feita até integrarmos um provedor. Chat, avisos,
> ocorrências, documentos, transporte, agenda e pontos de encontro ainda são
> protótipo, com dados fictícios.

## Colocar no ar (Supabase + Render)

### 1. Supabase — banco e login

1. No projeto Supabase, abra **SQL Editor** e rode, em ordem, cada arquivo de
   `supabase/migrations/` inteiro. Com a CLI:
   `supabase link --project-ref <ref>` e `supabase db push`.
2. **Authentication → URL Configuration**: em *Site URL* coloque a URL do
   Render (ex.: `https://vento.onrender.com`) e adicione
   `https://vento.onrender.com/**` em *Redirect URLs*.
3. **Authentication → Email Templates → Confirm signup**: troque o link por
   `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`
   (o app manda `RedirectTo` com o app certo, ex.: `…/auth/confirm?area=instrutor`).
4. **Project Settings → API**: copie a *Project URL* e a chave *anon* /
   *publishable*. Só essas duas — o app não usa a `service_role`.

### 2. Render — o app

1. Render → **New → Blueprint** → escolha este repositório. O `render.yaml`
   cria o serviço web a partir do branch `main`.
2. Preencha as variáveis pedidas: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SITE_URL` (a URL do próprio
   serviço no Render).
3. O deploy roda `pnpm install && pnpm build` e `pnpm start`. As variáveis
   `NEXT_PUBLIC_*` entram no build: depois de mudar alguma, faça um novo deploy.

### 3. Primeiro administrador

Crie sua conta em `/cadastro`, confirme o e-mail e rode
`supabase/bootstrap-admin.sql` no SQL Editor com o seu e-mail. A partir daí o
admin aprova instrutores e pousadas e publica preços pelo próprio app.

### Fluxo para testar

1. Uma conta **instrutor** (`/cadastro` → "Sou instrutor") preenche praias e
   idiomas em *Meu perfil profissional*.
2. O **admin** aprova o instrutor em *Instrutores*.
3. Uma conta **aluno** monta a aula em *Explorar* → *Encontrar minha aula*, busca
   o instrutor e confirma o pagamento de teste.
4. O **instrutor** vê o encontro em *Meu dia*, inicia com o código de presença
   do aluno e registra os minutos em *Realizar e registrar aula*.
5. O aluno acompanha em *Evolução*; o admin vê valores em *Financeiro*.

## Quatro apps, quatro logins

Cada perfil instala o seu próprio app (PWA), com nome, ícone e login próprios:

| App | Instalar a partir de | Login |
| --- | --- | --- |
| Vento (aluno) | `/aluno/inicio` | `/aluno/entrar` |
| Vento Instrutor | `/instrutor/entrar` | `/instrutor/entrar` |
| Vento Admin | `/admin/entrar` | `/admin/entrar` |
| Vento Pousada | `/pousada/entrar` | `/pousada/entrar` |

Cada app guarda a sessão num cookie próprio (`vento-<app>-auth`), então o
mesmo celular pode estar logado como aluno no Vento e como admin no Vento
Admin. Um app só aceita contas do seu tipo (ou admin). `/entrar` mostra a
escolha entre os quatro.

## Desenvolvimento

Requer Node 22+ e pnpm 10+.

```bash
pnpm install
cp .env.example .env.local   # preencha com um projeto Supabase de desenvolvimento
pnpm dev                     # http://localhost:3000
```

```bash
pnpm typecheck && pnpm lint && pnpm build
scripts/test-db.sh           # regras do banco (precisa de PostgreSQL 15+ local, usuário não-root)
```

## Áreas

| Perfil | Entrada | Ligado ao banco | Ainda protótipo |
| --- | --- | --- | --- |
| Aluno | `/aluno/inicio` | explorar (preço), montar aula, minhas aulas, reserva, evolução, perfil | central, imprevistos, chat, avisos, acesso |
| Instrutor | `/instrutor/hoje` | meu dia, fila, registrar aula, financeiro, perfil profissional | solicitação, agenda, turnos, documentos, ocorrências, conversas, avisos |
| Admin | `/admin/visao` | visão geral, fila, instrutores, reservas, financeiro, preços, pousadas | agenda, transporte, ocorrências, documentos, pontos, políticas, atendimento, avisos, estrutura |
| Pousada | `/pousada/inicio` | início, indicações, divulgação, cadastro | — |

## Estrutura

```
src/
  app/            rotas por perfil (aluno, instrutor, admin, pousada), login e cadastro
  app/actions/    ações do servidor: validam a entrada (zod) e chamam funções do banco
  components/     kit visual, molduras, telas compartilhadas
  data/demo.ts    dados fictícios das telas que ainda são protótipo
  lib/
    auth.ts       sessão e checagem de papel (requireRole)
    data.ts       todas as leituras do banco
    format.ts     dinheiro (centavos), duração (minutos), datas (Fortaleza, UTC−3)
  proxy.ts        renova a sessão e manda visitantes de áreas privadas ao login
supabase/
  migrations/     esquema, RLS e funções (preço, reserva, fila, auditoria)
  tests/          testes das regras do banco
render.yaml       serviço web no Render
```

O visual segue o **Design System Vento** (tema Studio: cobalto `#405fd3`,
DM Sans, cards brancos de raio 17px). Os tokens ficam em `src/app/globals.css`.

## Regras

Veja [AGENTS.md](./AGENTS.md). As principais: dinheiro sempre em centavos
inteiros; preço, comissão e divisão calculados só no banco (`create_booking`);
toda escrita passa por uma função que confere papel **e** dono do registro; e
cada reserva tem o valor congelado na criação.
