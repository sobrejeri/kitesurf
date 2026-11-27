# VentoKite — execução simultânea de 26/11/2026

Escopo vigente: 16 frentes (#87–#100, #102 e #103), prontas para integrar checkout. #101 real e #104 laboratório 3D ficam fora desta entrega. Pagamentos reais, Protege 3B e scheduler permanecem desligados.

## Atualização verificada pela coordenação — lote atual

- **Produção atual:** #369 publicada no SHA `03dff66eb40380a468f55e883716175aa8f44484`; Render `dep-dc4dm5rrjlhs73fnspp0` em **LIVE** e `/api/version` no mesmo SHA. O lote anterior #366 (`d01c3f6`) absorveu #362/#363/#365, ficou LIVE e foi conferido no desktop. Não reaplicar essas fontes.
- **Conciliação de entradas #88/#90 aplicada no Kitesurf:** ledger agora com **10 migrations**. A versão remota `20261127012854 / vento_90_validate_request_and_booking_input` corresponde ao arquivo versionado `supabase/migrations/20261127004852_validate_request_and_booking_input.sql`, SQL SHA-256 `f648e135e815751acf07b229811d0edd2c39a9976b02cb48e850acde09b0bfcc`. Essa equivalência deve ser mantida: **não usar db push para reaplicar o arquivo como outra migration** nem repetir o histórico antigo.
- **Preservação no instante do DDL:** hash dos dados antes e depois `9eb991e354fe4a1176ebe8fc6c099e53`, idêntico. Contagens naquele instante: 14 reservas, 20 encontros, 19 solicitações e 18 ofertas. Essas são contagens históricas do preflight/postflight; não representam os totais após os testes seguintes.
- **Regressão remota transacional:** passaram 60 entradas inválidas nas quatro assinaturas RPC, com claims de aluno e READ ONLY/ROLLBACK. O agente de reservas versionará o script exato. Não equivale a sessão de login ou teste no navegador.
- **Após o DDL, navegador autenticado:** VNT-1018, solicitação `7e0a1172-3d71-419f-9b1a-b7ca6f853a02`, reserva `a0341ae9-88e1-44b9-b7b5-fa729b284592`, confirmada sem cobrança. Um encontro de 2 horas em **08/12/2026 às 09h de Fortaleza**, total 60000 centavos, soma das parcelas igual ao total.
- **Auth/segurança:** HIBP ficou ON e sua configuração foi confirmada persistida. Advisors não apresenta mais o aviso de HIBP; continuam os avisos das quatro funções anon e 83 funções authenticated mantidas intencionalmente. Não revogar essas RPCs em bloco nem considerar a frente de segurança homologada só por essa consulta.

## Release combinada em preparação

Esta branch reúne #375 (13 arquivos de opt-in push por dono), #377 (13 arquivos de metadados de veículo) e #374 (três arquivos de orientação de senha fraca), sobre a principal `03dff66`. Os únicos arquivos compartilhados são `.github/workflows/verify.yml` e `.env.example`: foram conciliados preservando todos os passos/valores da principal e sem duplicar testes ou flags. `scripts/test-db.sh` permanece no blob `61aee90f882844e04ec4c6715788171d80ac5fc6`, incluindo a regressão e o ensaio oficial da migration #90.

A assinatura push e os metadados de veículo continuam **OFF**. A chave pública VAPID do exemplo continua vazia e a configuração de registro no banco tem padrão false. O dispatcher é trabalho separado, filho da #370, e não faz parte desta release. Não houve mudança de DDL, env, chave operacional, permissão de navegador ou envio externo durante esta agregação.

Antes de integrar: conferir o CI do SHA combinado e revisar o diff final; depois confirmar o novo SHA LIVE e testar os caminhos publicados. As migrations de push e veículo ainda são somente versionadas. Não declarar funcionalidades com flag OFF como homologadas.

## Histórico das evidências anteriores

- #355 integrada: 5a0f53d486c537967289fec3603c807380279ca9, Render dep-dc4d4stbedkc73dg5hkg LIVE. CI 45918133882: testes de isolamento entre conversas, anexos e recibos.
- #360 integrada: 82f17e99cb96d7ac8c812e91704b09649c935aa1, Render dep-dc4d7ojbc2fs739lfucg LIVE; /api/version conferido. CI combinado 45918774210 success (76 etapas). Absorve #301/#342/#345/#358/#359; não integrar essas PRs novamente.
- Navegador real desktop: sessões Aluno, Instrutor, Admin e Afiliado acessíveis. Não equivale à homologação de todas as ações/perfis/aparelhos.
- VNT-1008: leitura autenticada confirmou dois encontros concluídos, 110+115=225 minutos de 240 e saldo15. Nenhuma escrita nessa reserva nesta execução.
- VNT-1017: solicitação e9354877-8dc6-4a69-a4b6-28b199f26e9d, reserva b1cbdfe3-e16d-4ec8-a896-7db4189bc9a3. Criada pelo Aluno em UI real, oferta apareceu no Instrutor sem recarregar; aceite único e confirmação sem cobrança. Dois encontros de2h, 01/12 e03/12/2026 às09h Fortaleza. Banco confirmed,240min, aulas120000centavos+transporte40000=total160000; soma das partes160000. Nenhum encontro foi iniciado antecipadamente. Em teste posterior desta mesma execução, o Aluno solicitou adiar somente o segundo encontro de 03/12 para 07/12 às 09h e o Instrutor aprovou. Os dois perfis e o banco confirmaram a mudança, preservando o UUID do encontro, o primeiro dia, os 240 minutos e o total de 160000 centavos.
- Afiliado fictício: dados de homologação completados, aprovação pelo Admin com justificativa auditável, selo/link/QR liberados. Sem alteração de comissão, banco de recebimento ou repasse. Não usar essa aprovação de teste como evidência comercial.
- UI publicada: Bronze removido mantendo Iniciante; inbox mostra atualização e requisitos de elegibilidade. HTTP /aluno/aulas confirma geolocation=(self) e demais recursos fechados.
- Baseline inicial do Supabase correto qadkqjfmmnxvovyyhqxw: ledger9, RLS public ativa e seis buckets privados; start_meeting(uuid,text) nega anon/authenticated e start_ordered_meeting permite authenticated. O ledger passou a10 após o DDL conciliado descrito na atualização acima.
- #354 foi integrada à #353 com48 válidos/24 níveis recusados+60 inválidos e ACL. A proposta histórica foi promovida à migration oficial #369 e aplicada conforme o mapping acima; não instalar os arquivos proposed junto com a oficial.
- #356 integrada somente à #346: leases inválidas/obsoletas recusadas;8 testes unitários e CI completo. Não há autenticação de runtime ou gatilhos externos operacionais.

## Distribuição simultânea

| Equipe | Frentes | Entregas/atividade |
|---|---|---|
| Reservas/agenda | #90/#91/#88 | #369 LIVE e conciliação aplicada; ampliar E2E e versionar regressão remota |
| Aulas/E2E | #93/#94/#103 | #357/#364: vínculo e segundo encontro com checkpoint, escrita global bloqueada |
| Fila/notificações | #92/#96 | Receptor publicado via#366; assinatura por dono preparada na#375, OFF; dispatcher separado |
| Operação/Business | #95/#97/#98/#99 | #355 integrado; #361 preflight Business em revisão |
| PWA/design | #87/#100/#98/#99 | #359/#365 publicados; cadastro veículo/capacidade preparado na#377, OFF |
| Segurança | #89/#102/#88 | HIBP ON confirmado; probe#362 publicado; orientação weak_password preparada na#374 |
| Coordenação | Integração/ambientes | Revisão, CI combinado, merge, SHA LIVE e testes autenticados |

As equipes são agentes internos desta execução. Não declarar Claude Code externo acionado ou revisão Claude operacional: workflows Claude consultados foram skipped.

## Pendências para homologação integral

| Frente | Evidência desta rodada | Ainda obrigatório |
|---|---|---|
| #87 | CI e dois deploys LIVE, versão conferida | Atualização PWA instalado, ensaio de rollback compatível |
| #88 | Ledger10, mapping oficial e preservação de dados conferidos; regressão SQL transacional passou | Storage HTTP completo; recuperação real permanece decisão pré-lançamento registrada |
| #89 | Quatro sessões reais e perfis acessíveis | Upload/troca/documentos/negações entre contas e URL expirada |
| #90 | Conciliação aplicada; VNT-1017 de4h/2dias e VNT-1018 de2h confirmadas; matriz SQL de entradas passou | Ampliar níveis/durações e validação autenticada mobile/PC |
| #91 | UI rejeitou encontros sobrepostos; suites de concorrência existentes | Concorrência autenticada e agenda por instrutor real |
| #92 | Inbox atualizado e aceite reais | A→B→C offline com3 instrutores fictícios e executor identificado |
| #93 | VNT-1008 lida225/15; runner segundo encontro implementado | Executar runner revisado no horário permitido, preservar idempotência |
| #94 | Adiamento bilateral autenticado da VNT-1017 aprovado, sem mudar horas/preços; datas anteriores bloqueadas na UI | Cancelamento, expiração e fallback autenticados; regressões de conflito |
| #95 | Isolamento SQL integrado/LIVE | Multi-conversa/anexos/gestos/estado de conexão no navegador e aparelho |
| #96 | Avisos internos e receptor publicados; opt-in por dono/RLS preparados com gates OFF | Aplicar schema conciliado, VAPID, limites de abuso, remetente/retry/executor e aparelhos |
| #97 | Admin autenticado aprovou afiliado fictício | Decisões/documentos/preços/relatórios/fila/ocorrências completos |
| #98 | Cadastro/aprovação/selo/link/QR reais | Primeiro aluno elegível, atribuição até voucher e comissão simulada conciliada |
| #99 | Snapshot transporte preservado; cadastro de veículo e painel Admin preparados na#377, OFF | Aplicação conciliada do schema e E2E; preservar tarifa global e agenda atual |
| #100 | Ajustes publicados conferidos desktop | Mobile/Safari/PWA físico, foco/teclado/zoom e inventário restante |
| #102 | Gates/grants conferidos; #362 publicado; HIBP ON persistido e Advisors revisto | HTTP entre owners, retenção/termos, demais IDORs e controles |
| #103 | Quatro sessões e jornada reserva real parcial | Matriz inteira por perfil/dispositivo, revisão e execução E2E completa |

Total de homologação integral continua0/16. Isso não mede percentual de código implementado. Não inventar percentuais de desenvolvimento; cada frente só muda para homologada com seus critérios completos.

## Histórico do segundo lote de código

O receptor passivo #363, o probe somente leitura #362 e a mensagem de perfil aprovado #365 foram absorvidos pela#366, SHA d01c3f6, posteriormente confirmado LIVE e conferido no desktop. Receptor passivo não significa envio push disponível. Não ativar scheduler, financeiro ou3B.


## Validação combinada do segundo lote

CI 45920032955 do código eaf958a: success, 78 etapas, incluindo push, cinco testes do probe Storage, typecheck, lint, build e SQL isolado. Esta atualização documental registra o adiamento posterior da VNT-1017. O SHA final desse lote foi d01c3f6 (#366), confirmado LIVE e conferido no desktop; a produção posterior da#369 está registrada no início deste documento.
