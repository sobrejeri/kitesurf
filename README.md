# Vento

Plataforma de aulas de kitesurf em Preá e Jericoacoara (CE): o aluno escolhe as
horas, a fila distribui o pedido entre instrutores independentes, e pousadas
parceiras indicam hóspedes em troca de comissão.

> **Fase atual: protótipo navegável.** As 48 telas do esboço estão
> implementadas em Next.js com dados fictícios (`src/data/demo.ts`). Nada é
> enviado a uma API: formulários só confirmam na tela, e não há cobrança,
> autenticação nem notificação real.

## Como rodar

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Requer Node 22+ e pnpm 10+.

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## Áreas

| Perfil | Entrada | Telas |
| --- | --- | --- |
| Aluno | `/aluno/inicio` | explorar, minhas aulas, evolução, montar aula, reserva, perfil, central, imprevistos, chat, avisos, políticas, acesso |
| Instrutor | `/instrutor/central` | meu dia, solicitação, prioridade na fila, agenda, registrar aula, financeiro, perfil, cadastro, turnos, documentos, ocorrências, conversas, avisos, regras |
| Admin | `/admin/central` | visão geral, agenda, fila e distribuição, instrutores, reservas, financeiro, regras, pousadas, transporte, ocorrências, documentos, pontos de encontro, políticas, atendimento, avisos, estrutura |
| Pousada | `/pousada/inicio` | início, indicações, divulgação, cadastro |

A barra "Esboço navegável" no topo troca de perfil.

## Estrutura

```
src/
  app/            rotas por perfil (aluno, instrutor, admin, pousada)
  components/
    ui.tsx        kit visual: botão, card, badge, aviso, stat, avatar, progresso
    shells.tsx    molduras de cada perfil (header, sidebar, barra inferior)
    shared.tsx    telas comuns: central, ocorrências, chat, avisos, políticas, agenda
    interactive.tsx  estado local: contador de horas, abas, formulários de demonstração
  data/demo.ts    dados fictícios — o que a API devolveria
  lib/format.ts   formatação de dinheiro (centavos) e duração (minutos)
```

O visual segue o **Design System Vento** (tema Studio: cobalto `#405fd3`,
DM Sans, cards brancos de raio 17px). Os tokens ficam em
`src/app/globals.css`.

## Regras

Veja [AGENTS.md](./AGENTS.md). As principais: dinheiro sempre em centavos
inteiros, e o navegador só exibe valores que chegam prontos, sem calcular
preço, comissão ou repasse.
