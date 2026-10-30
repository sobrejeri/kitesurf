<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vento — regras do projeto

Vento é uma plataforma de aulas de kitesurf em Preá e Jericoacoara. Hoje este
repositório é um **protótipo navegável**: todas as telas usam dados fictícios
de `src/data/demo.ts` e nada é enviado a uma API.

- **Dinheiro é inteiro em centavos.** Nunca float, nunca string decimal.
- **O navegador exibe valores, não os calcula.** Preço, comissão, líquido e
  repasse chegam prontos (hoje das constantes de demonstração, depois da API).
  Nenhum componente multiplica horas por tarifa ou soma valores.
- **Durações em minutos** e exibidas como `1h 30min`, nunca `1,5h`.
- **Só variáveis `NEXT_PUBLIC_*` no app.** Segredos nunca entram no bundle.
- **Sem bypass de autorização.** Quando houver backend, cada rota de aluno,
  instrutor, admin e pousada é autorizada no servidor; esconder um link é só
  apresentação.
- **Visual:** os tokens de `src/app/globals.css` espelham o Design System Vento.
  Mude os dois juntos.

Antes de commitar: `pnpm typecheck && pnpm lint && pnpm build`.
