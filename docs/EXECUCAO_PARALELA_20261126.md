# VentoKite — execução simultânea de 26/11/2026

Escopo vigente: 16 frentes (#87–#100, #102 e #103), prontas para integrar checkout. #101 real e #104 laboratório 3D ficam fora desta entrega. Pagamentos reais, Protege 3B e scheduler permanecem desligados.

## Evidências confirmadas nesta execução

- #355 integrada: 5a0f53d486c537967289fec3603c807380279ca9, Render dep-dc4d4stbedkc73dg5hkg LIVE. CI 45918133882: testes de isolamento entre conversas, anexos e recibos.
- #360 integrada: 82f17e99cb96d7ac8c812e91704b09649c935aa1, Render dep-dc4d7ojbc2fs739lfucg LIVE; /api/version conferido. CI combinado 45918774210 success (76 etapas). Absorve #301/#342/#345/#358/#359; não integrar essas PRs novamente.
- Navegador real desktop: sessões Aluno, Instrutor, Admin e Afiliado acessíveis. Não equivale à homologação de todas as ações/perfis/aparelhos.
- VNT-1008: leitura autenticada confirmou dois encontros concluídos, 110+115=225 minutos de 240 e saldo15. Nenhuma escrita nessa reserva nesta execução.
- VNT-1017: solicitação e9354877-8dc6-4a69-a4b6-28b199f26e9d, reserva b1cbdfe3-e16d-4ec8-a896-7db4189bc9a3. Criada pelo Aluno em UI real, oferta apareceu no Instrutor sem recarregar; aceite único e confirmação sem cobrança. Dois encontros de2h, 01/12 e03/12/2026 às09h Fortaleza. Banco confirmed,240min, aulas120000centavos+transporte40000=total160000; soma das partes160000. Não foram iniciados encontros futuros nem alteradas suas datas.
- Afiliado fictício: dados de homologação completados, aprovação pelo Admin com justificativa auditável, selo/link/QR liberados. Sem alteração de comissão, banco de recebimento ou repasse. Não usar essa aprovação de teste como evidência comercial.
- UI publicada: Bronze removido mantendo Iniciante; inbox mostra atualização e requisitos de elegibilidade. HTTP /aluno/aulas confirma geolocation=(self) e demais recursos fechados.
- Supabase correto qadkqjfmmnxvovyyhqxw: ledger9; RLS de todas as tabelas public ativa; seis buckets privados. start_meeting(uuid,text) nega anon/authenticated, start_ordered_meeting permite authenticated. Sem DDL remoto nesta rodada.
- #354 integrada somente à #353: testes48 válidos/24 níveis recusados+60 inválidos e ACL; proposta não aplicada no Supabase.
- #356 integrada somente à #346: leases inválidas/obsoletas recusadas;8 testes unitários e CI completo. Não há autenticação de runtime ou gatilhos externos operacionais.

## Distribuição simultânea

| Equipe | Frentes | Entregas/atividade |
|---|---|---|
| Reservas/agenda | #90/#91/#88 | #354; promoção da proposta a migration oficial com preflight |
| Aulas/E2E | #93/#94/#103 | #357/#364: vínculo e segundo encontro com checkpoint, escrita global bloqueada |
| Fila/notificações | #92/#96 | #358 integrado via#360; #363 receptor passivo; assinatura por dono em implementação |
| Operação/Business | #95/#97/#98/#99 | #355 integrado; #361 preflight Business em revisão |
| PWA/design | #87/#100/#98/#99 | #359 integrado; #365 texto aprovado; cadastro veículo/capacidade em implementação |
| Segurança | #89/#102/#88 | #356 integrado à#346; #362 probe HTTP de Storage; revisão independente Business |
| Coordenação | Integração/ambientes | Revisão, CI combinado, merge, SHA LIVE e testes autenticados |

As equipes são agentes internos desta execução. Não declarar Claude Code externo acionado ou revisão Claude operacional: workflows Claude consultados foram skipped.

## Pendências para homologação integral

| Frente | Evidência desta rodada | Ainda obrigatório |
|---|---|---|
| #87 | CI e dois deploys LIVE, versão conferida | Atualização PWA instalado, ensaio de rollback compatível |
| #88 | Ledger9/RLS/buckets/grants reais, somente leitura | Conciliação de migrations; Storage HTTP; recuperação real permanece decisão pré-lançamento registrada |
| #89 | Quatro sessões reais e perfis acessíveis | Upload/troca/documentos/negações entre contas e URL expirada |
| #90 | Reserva4h/2dias aceita/confirmada; matriz SQL completa na proposta | Integrar conciliação testada e revalidar níveis/durações reais |
| #91 | UI rejeitou encontros sobrepostos; suites de concorrência existentes | Concorrência autenticada e agenda por instrutor real |
| #92 | Inbox atualizado e aceite reais | A→B→C offline com3 instrutores fictícios e executor identificado |
| #93 | VNT-1008 lida225/15; runner segundo encontro implementado | Executar runner revisado no horário permitido, preservar idempotência |
| #94 | Suites SQL/E2E preparadas | Reagendamento/cancelamento bilateral autenticado e expiração |
| #95 | Isolamento SQL integrado/LIVE | Multi-conversa/anexos/gestos/estado de conexão no navegador e aparelho |
| #96 | Avisos internos e receptor push testado em código | Subscribe/RLS/VAPID/remetente/retry/executor/aparelhos |
| #97 | Admin autenticado aprovou afiliado fictício | Decisões/documentos/preços/relatórios/fila/ocorrências completos |
| #98 | Cadastro/aprovação/selo/link/QR reais | Primeiro aluno elegível, atribuição até voucher e comissão simulada conciliada |
| #99 | Snapshot transporte4h=40000centavos preservado | Cadastro veículo/capacidade e testes, sem alterar tarifa global/agenda atual |
| #100 | Ajustes publicados conferidos desktop | Mobile/Safari/PWA físico, foco/teclado/zoom e inventário restante |
| #102 | Gates/grants reais conferidos; #362 preparado | HTTP entre owners, retenção/termos, demais IDORs e controles |
| #103 | Quatro sessões e jornada reserva real parcial | Matriz inteira por perfil/dispositivo, revisão e execução E2E completa |

Total de homologação integral continua0/16. Isso não mede percentual de código implementado. Não inventar percentuais de desenvolvimento; cada frente só muda para homologada com seus critérios completos.

## Próximo lote de código

Consolidação do receptor push passivo #363, do probe somente leitura #362 e da mensagem de perfil aprovado #365. Verificar CI combinado e SHA LIVE antes de marcar publicado. Receptor passivo não significa envio push disponível. Não ativar scheduler, financeiro ou3B.
