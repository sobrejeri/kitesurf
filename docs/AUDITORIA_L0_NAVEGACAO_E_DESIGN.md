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

## Revisão adicional do menu mobile e navegação desktop

- [x] **Atividade de rota no menu lateral do Aluno:** para detalhes `/aluno/reserva/[id]`, manter `Minhas aulas` destacado; detalhes filhos permanecem selecionados. O roteador agora usa correspondência de caminho completo ou descendente, sem falsos positivos de prefixo como `/aluno/reserva` versus `/aluno/reservar`.
- [x] **Modal `Mais` no celular:** ciclo de foco pelo teclado corrigido para manter Tab/Shift+Tab dentro da janela, permitindo Escape e retorno do foco ao botão original. Aplica-se aos menus das quatro áreas que usam `MoreSheet`.
- [x] **CTA central e botão `Mais`:** estado visual mutuamente exclusivo quando a barra inferior tiver ambos; evita dois itens selecionados simultaneamente.
- [x] Teste `scripts/test-l0-mobile-navigation.mjs` cobre rota principal e filha, tab do detalhe da reserva, exclusão de prefixos colidentes, rotação de foco e invariantes de acessibilidade do modal.
- [ ] **Não equivale a teste real:** conferir no iPhone com teclado/VoiceOver, Android/TalkBack e desktop com leitor de tela; validar swipe em Safari/PWA e capturas antes/depois. Preservadas as cores, imagens, logo, fontes e botões aprovados.

## L0 — robustez do swipe entre as cinco telas

### Causas de falhas encontradas no código

- [x] O gesto horizontal que terminava **sem destino válido** (nas bordas de Explorar/Perfil ou ao inverter a direção) podia deixar `data-dragging` e o estado da prévia ativos. O encerramento agora limpa esses estados.
- [x] Se uma rota demorava muito ou falhava offline depois do swipe, a tela antiga podia ficar deslocada e a tabbar ainda mostrar a rota anterior. Foi acrescentada uma reversão temporizada, sem alterar dados nem forçar reload.
- [x] As prévias HTML armazenadas podiam ficar ultrapassadas e continuar sendo exibidas após o TTL. Agora qualquer renderização verifica a expiração; erros de rede mantêm apenas uma prévia inerte, e requisições canceladas não apagam marcadores de requisições novas.
- [x] Elementos interativos (`<a>`, `<button>`, `<summary>` e controles ARIA) não iniciam mais swipe por engano; continua possível deslizar em áreas neutras da tela.
- [x] **Endurecimento de prévias:** a prévia HTML é de exibição apenas, mas injetar HTML bruto poderia incorporar atributos de evento ou imagens externas. O código agora remove scripts, formulários, mídia ativa, SVG, custom elements, atributos de evento e recursos externos; permite imagens locais estáticas do app e do otimizador Next. URLs assinadas privadas não são reutilizadas na prévia.
- [x] Novos testes puros de limites/direções, velocidade do gesto, validade da prévia, sanitização de URLs e invariantes do pager no CI.

### Critérios ainda abertos

- [ ] Validar manualmente no iPhone Safari/PWA o gesto de cinco abas, estado de aba ativa, recarga por URL, inversão do dedo, gesto na borda e rede lenta/offline, incluindo o retorno após timeout.
- [ ] Comparar a aparência da prévia de transição antes/depois em telas com foto e conteúdo do Aluno (estilos inline e imagens externas são omitidos deliberadamente na **prévia inerte**, não na tela final).
- [ ] Exercitar carrosséis internos, campos e botões para confirmar que não disparam troca de aba; testar também leitor de tela e redução de movimento.
- [ ] Continuar inventário e refinamento visual de fontes, tons de azul, botões, espaçamentos e fotos no PC/mobile. **Sem homologação completa por testes somente estáticos.**


## L0 — controles compartilhados: progresso e foco (10/11/2026)

- [x] O componente compartilhado `ProgressBar` não normalizava a soma de horas concluídas e reservadas, permitindo que larguras extrapolassem 100%, fossem negativas ou não finitas. O helper puro `progressBarShares` agora limita cada faixa a 0–100% e o total à largura do card, **sem alterar cálculo de horas ou dados de reserva**.
- [x] A barra de progresso ganha nome acessível e leitura diferenciada de percentual concluído e reservado; o visual normal de percentuais válidos permanece igual.
- [x] Os campos `inputClass` e `textareaClass` usavam `focus:outline-none`, podendo suprimir o foco de teclado. Agora exibem contorno de 2px com a cor de foco da identidade atual. Mantidos texto de 16px no iPhone (evita zoom automático) e tamanho compacto no desktop.
- [x] Teste `scripts/test-l0-shared-control-accessibility.mjs` cobre valores negativos, acima de 100, NaN, infinito, acessibilidade do `progressbar`, foco dos campos e tamanhos tipográficos.
- [ ] Conferir o contorno de foco e a barra visualmente em Safari/PWA iPhone e navegador desktop; revisão completa de formulários e cores continua aberta. Não declarar L0 homologado por testes de código.

## L0 — quatro áreas: menu ativo e status em cards compactos

- [x] No `WorkspaceShell` de Admin e Instrutor, o menu lateral e o título/breadcrumb do topo usavam `pathname.startsWith(item.href)`, o que podia marcar rotas irmãs como se fossem páginas filhas, por exemplo `/instrutor/aulas` confundido com `/instrutor/aula`. Agora usam `isActive`, que exige rota exata ou descendente com barra. A lógica já era utilizada pelo Aluno e Pousada.
- [x] Badges de status compartilhadas deixaram de forçar `whitespace-nowrap`. Um status longo pode quebrar linha, centralizado e limitado à largura do card. Preservadas cores, tamanhos de fonte e desenho dos badges curtos.
- [x] Botões padronizados permanecem com os tamanhos de toque atuais no mobile; nenhum redesenho dos componentes aprovados.
- [x] Teste `scripts/test-l0-workspace-controls.mjs` incluído no CI para as quatro áreas, cobrindo prefixos colidentes, detalhes de reserva, estado ARIA do menu, wrap de badges e medidas dos botões.
- [ ] Testar a legibilidade dos status e a navegação do Admin, Instrutor e Pousada em telas reais com login próprio; não equivale a homologação E2E nem a captura visual antes/depois.

## Redesign Instrutor e Admin — "Vento Pro" (11/11/2026)

- [x] **Tema de trabalho único** para Instrutor e Admin (`.theme-pro` em `globals.css`): superfícies brancas sobre cinza frio, azul `#2563eb` como único acento e barra lateral/app bar em azul-marinho `#0b1220` com o logo oficial. O laranja do tema antigo saiu das telas da equipe; Aluno e Pousada não mudam.
- [x] **Navegação agrupada por assunto** em `src/components/workspace-nav.ts` (Instrutor: Trabalho, Ganhos, Cadastro, Suporte; Admin: Operação, Pessoas, Financeiro, Cadastros, Segurança, Sistema). A mesma lista alimenta a barra lateral do PC, as quatro abas do celular, a folha "Mais" (agora em seções) e as páginas Central/Mais opções. Avaliações do instrutor passou a ter entrada no menu.
- [x] **Topo do PC** com trilha (área › grupo › página), seletor de áreas para admin e notificações com contador; a barra global antiga não aparece mais nessas duas áreas. Sair da conta fica no rodapé da barra lateral.
- [x] **Meu dia** (Instrutor) prioriza a aula em andamento/próxima com ações diretas, a posição na fila e os números; **Visão geral** (Admin) abre com "Precisa da sua atenção" (cadastros em análise, reservas sem instrutor, pagamentos pendentes) e mostra as próximas aulas. Os números continuam vindo dos snapshots congelados das reservas, sem recálculo.
- [x] **PWA**: novos ícones 192/512 (marca oficial do kite sobre o marinho, com o papel embaixo), manifestos com nome VentoKite, `theme_color` igual à app bar, atalhos de tela inicial e `viewport.themeColor` correspondente. Login, recuperação de senha, erro, aviso de nova versão e chat flutuante do instrutor seguem o mesmo azul.
- [x] Teste `scripts/test-staff-workspace-redesign.mjs` no CI: todo link do menu tem página, toda página de primeiro nível é alcançável pelo menu ou pela central, quatro abas por área, sem laranja antigo nas telas da equipe, manifestos e tamanhos reais dos ícones.
- [ ] Conferido com capturas desktop 1440px e iPhone 393px usando **dados fictícios em um ambiente local**; ainda falta conferir com login real de instrutor/admin no Render e instalar o PWA de novo no iPhone (o ícone antigo só é trocado ao reinstalar).

## Aluno com "cara de app" — 11/11/2026

- [x] **Telas secundárias no celular** (Central, Regras, Avisos, Conversas, Conversa, Imprevistos, Solicitação) abrem com título compacto (`StudentPageTitle`): nome da tela e uma linha de status. Saem os cabeçalhos de site com sobretítulo, título grande e parágrafo, e os textos de protótipo ("Fluxos da plataforma", "Push externo ainda não está conectado").
- [x] **Avisos** viram caixa de entrada: a linha inteira abre o aviso, ícone por tipo, ponto de não lido, horário relativo ("Hoje, 08:00") e "Marcar como lida" discreto. Compartilhado com Instrutor e Admin.
- [x] **Conversas** viram lista de mensageiro (foto do instrutor, última mensagem e horário). Corrigido: mostrava "Reserva c0000000" (parte do id interno) em vez do código da reserva.
- [x] **Chat** com cabeçalho do contato, separadores por dia e caixa de mensagem com botão "Enviar". Corrigido: as próprias mensagens tinham texto branco sobre o verde, quase ilegível; agora usam `text-on-brand` em todos os temas.
- [x] **Reserva**: botão "Abrir no mapa", aviso de prazo encerrado discreto, link de imprevistos (mantido como texto, conforme decisão anterior) numa linha só, e saldo de aprendizado na coluna lateral — no PC a metade direita deixou de ficar vazia e, na reserva pendente, "Confirmar aula sem cobrança" vem logo após o voucher no celular.
- [x] **Imprevistos (Protege)**: orientações longas dobradas em seções que abrem com um toque (texto jurídico inalterado) e paginação em botões.
- [x] **Início**: "Em acompanhamento" não é mais cortado no meio da palavra. **Minhas aulas**: subtítulo mostra a próxima aula ("Próxima: amanhã às 09:00").
- [x] **PC**: telas secundárias com cabeçalho compacto (voltar, título e uma linha), sem faixa de foto; as quatro telas principais mantêm os banners aprovados.
- [x] Teste `scripts/test-student-app-screens.mjs` no CI. Conferido com capturas de celular (393px) e PC (1440px) das **páginas reais**, servidas por um backend Supabase fictício local com dados inventados (sem conta nem banco reais). Também conferidas as telas reais do Instrutor que compartilham avisos, chat e Protege.
- [ ] Falta conferir com login real no Render (aluno e instrutor).
