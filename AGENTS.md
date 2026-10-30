<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vento — regras do projeto

Vento é uma plataforma de aulas de kitesurf em Preá e Jericoacoara: Next.js no
Render e Supabase (Postgres + Auth) como banco. Algumas telas ainda são
protótipo com dados de `src/data/demo.ts`.

- **Dinheiro é inteiro em centavos.** Nunca float, nunca string decimal.
- **Valores são calculados no banco.** `create_booking` deriva total,
  comissão, parte da pousada e líquido do instrutor a partir da versão de preço
  vigente. O cliente envia escolhas (praia, nível, idioma, horários), nunca um
  valor; os schemas zod são `strictObject` e rejeitam campos a mais.
- **Divisão:** calcule a comissão uma vez e obtenha o líquido por subtração —
  as partes sempre somam o total (há CHECK no banco).
- **Reserva tem valor congelado.** O trigger `bookings_snapshot_frozen` impede
  alterar valores; mudança de preço é uma nova linha em `price_versions`.
- **Toda escrita passa por função `SECURITY DEFINER`** que confere papel e dono
  (`require_role` + checagem do registro). As tabelas não dão INSERT, UPDATE ou
  DELETE ao cliente, exceto colunas de perfil liberadas uma a uma.
- **RLS em todas as tabelas.** Ler por id não é permissão: as consultas de aluno
  e instrutor filtram pelo próprio id, e a página confere o dono de novo.
- **Admin nunca é autoatribuído** no cadastro.
- **Ações administrativas geram `audit_logs`**, que é append-only por trigger.
- **Migration aplicada não se edita**: crie a próxima em `supabase/migrations`.
- **Só `NEXT_PUBLIC_*` no app.** O app não usa a chave `service_role`.
- **Sem bypass de autorização**, nem temporário.
- **Durações em minutos**, exibidas como `1h 30min`; datas no fuso de Fortaleza.
- **Visual:** os tokens de `src/app/globals.css` espelham o Design System Vento.

Antes de commitar: `pnpm typecheck && pnpm lint && pnpm build` e, se mexeu no
banco, `scripts/test-db.sh`.
