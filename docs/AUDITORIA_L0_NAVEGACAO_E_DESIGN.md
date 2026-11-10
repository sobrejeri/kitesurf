# VentoKite — lote L0: auditoria inicial de navegação e consistência visual

**Referência:** [plano de entrega sem checkout](./PLANO_ENTREGA_VENTOKITE_SEM_CHECKOUT.md), issues [#100](https://github.com/sobrejeri/kitesurf/issues/100), [#102](https://github.com/sobrejeri/kitesurf/issues/102) e [#105](https://github.com/sobrejeri/kitesurf/issues/105).

> Este é um **inventário inicial de rotas exibidas nos layouts**, extraído do repositório. Não representa a lista exaustiva de todas as páginas dinâmicas e não equivale a um teste visual em navegador. A homologação completa depende de capturas mobile/PC, autenticação com contas de teste e validação de cada ação.

## Mapa dos menus principais

| Papel | Navegação principal observada | Atalhos e páginas secundárias encontrados no layout |
| --- | --- | --- |
| **Aluno** | `/aluno/inicio` Explorar, `/aluno/aulas` Minhas aulas, `/aluno/reservar` Agendar, `/aluno/evolucao` Evolução, `/aluno/conta` Perfil | `/aluno/reserva/[id]`, `/aluno/central`, `/aluno/avisos`, `/aluno/atendimento`, `/aluno/ocorrencias`, `/aluno/politicas`, `/laboratorio-kite.html` |
| **Instrutor** | `/instrutor/hoje` Meu dia, `/instrutor/fila` Prioridade, `/instrutor/aula` Registrar aula, `/instrutor/financeiro` | `/instrutor/central`, `/instrutor/solicitacao`, `/instrutor/agenda`, `/instrutor/pontos`, `/instrutor/cadastro`, `/instrutor/disponibilidade`, `/instrutor/documentos`, `/instrutor/ocorrencias`, `/instrutor/atendimento`, `/instrutor/avisos`, `/instrutor/politicas` |
| **Admin** | `/admin/visao` Visão geral, `/admin/instrutores`, `/admin/reservas`, `/admin/financeiro` | `/admin/central`, `/admin/agenda`, `/admin/aula-teste`, `/admin/distribuicao`, `/admin/praias`, `/admin/regras`, `/admin/afiliados`, `/admin/transporte`, `/admin/ocorrencias`, `/admin/documentos`, `/admin/pontos`, `/admin/politicas`, `/admin/atendimento`, `/admin/avisos`, `/admin/estrutura`, `/admin/configuracoes`, `/admin/auditoria`, `/admin/protege-homologacao` (atalho via central) |
| **Pousada** | `/pousada/inicio`, `/pousada/indicacoes`, `/pousada/divulgacao`, `/pousada/perfil` | `/pousada/central`, `/pousada/cadastro` |

Os shells **Instrutor/Admin/Pousada** exigem uma sessão da role apropriada; o shell Aluno permite páginas públicas de busca, e as rotas privadas devem validar autenticação individualmente. Este documento não substitui auditoria de RLS/RPC por papel.

## Achados confirmados na revisão do código

1. **Botão Voltar no mobile do Aluno (corrigido no código):** telas secundárias usavam `history.back()`, que pode voltar para um site externo ou falhar quando o usuário abre um link direto no PWA. Agora o destino do botão é uma rota interna previsível via `studentSafeBackHref`, com teste automatizado para reserva, agendamento, atendimento, ocorrências e central.
2. **Atividade de abas:** `TabBar` usa a rota atual para `aria-current`; o destaque de Agendar impede destacar Explorar simultaneamente. Pendência: verificar se o gesto de deslizar altera a rota antes de limpar a animação em iPhone real, pois a issue #100 documenta intermitências visuais anteriores.
3. **Design por papel:** existe kit de componentes compartilhados (`src/components/ui.tsx`), mas múltiplos CSS específicos do Aluno e temas escuros para Pousada/Instrutor/Admin. **Revisar visualmente**, sem sobrescrever as telas mobile aprovadas. A preferência registrada é desktop com superfícies claras, acentos azuis e densidade padrão, mantendo identidade própria.
4. **Animação do swipe:** `StudentSwipePager` busca prévias HTML inertes das telas vizinhas e navega com `router.replace`; pode criar divergências temporárias entre prévia e estado ativo. Requer verificação real de gesto, recarga e conexão lenta em iPhone/PWA.
5. **Acessibilidade pendente:** conferir foco, relação de contraste, regiões de toque e diálogos em todas as áreas. O sistema tem utilitários de foco e redução de movimento, mas isso não prova que todas as páginas sejam acessíveis.

## Fila imediata de revisão de interface

- [x] Mapa inicial de navegação a partir dos quatro shells e correção de retorno seguro do Aluno, com teste de regressão no CI.
- [ ] Confirmar renderização das rotas do inventário no navegador com sessões adequadas e links dinâmicos.
- [ ] Testar tabbar, swipe, destaque da aba ativa, voltar, menu lateral e refresh por URL direta no iPhone PWA e PC.
- [ ] Revisar cores, contraste, fontes, ícones, tamanhos de botão, bordas, sombras, imagens HD, estado loading/erro/vazio e consistência de formulários.
- [ ] Corrigir duplicação de marca na Evolução, se reproduzida; conferir status e contraste do voucher e avisos.
- [ ] Documentar estado antes/depois por tela e só marcar ✅ se passou em mobile e desktop.
- [ ] Executar a auditoria de links e autorização dos quatro papéis, inclusive acesso direto a URLs alheias.
- [ ] Preservar `VALIDATION_WITHOUT_CHECKOUT`, as migrations 39–42 aplicadas e a trava 41 de VentoKite Protege durante as correções.

**Estado da frente #100:** em andamento; alteração de navegação corrigida em código e testada automaticamente, mas a homologação completa do design permanece pendente.
