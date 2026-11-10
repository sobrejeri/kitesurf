> **Estado da implantação — 09/11/2026:** migrations 39 (Supabase versão `20261110001348`) e 40 (versão `20261110001427`) **aplicadas com sucesso** ao banco de produção. Tabelas, RLS, RPCs, bucket privado e trigger validados após aplicação. Os registros existentes permaneceram preservados (5 reservas, 6 encontros, 0 incidentes). **O painel de manifestações 3B continua desativado por padrão**, aguardando homologação autenticada no app. Pagamentos, repasses, checkout e saldo não foram alterados. A reconciliação das migrações antigas 01–38 e a política de retenção ainda estão pendentes. Notas abaixo descrevendo "não aplicada" são histórico das etapas anteriores, não o estado atual.

# VentoKite Protege — política de encontro sem comprovação

**Status:** especificação e simulador de prazos **em desenvolvimento**, sem autorização para repasse ou estorno automáticos. Issue [#109](https://github.com/sobrejeri/kitesurf/issues/109). Atualizado em 09/11/2026.

## Situação que exige abertura de ocorrência

Um encontro com horário de término vencido sem registro de presença válido e/ou sem informação confiável dos minutos prestados **não é automaticamente uma aula realizada**. A reserva permanece no estado transacional verdadeiro; a interface pode exibir **Aguardando registro**. A abertura e o encerramento da ocorrência não devem falsificar a duração da aula.

O PIN/QR precisa ser validado **na hora apropriada**; não se admite digitar o código cinco dias depois como se houvesse confirmação retroativa. Falha de internet, perda de celular e outras situações excepcionais exigem evidências alternativas e registro pelo Admin. Mesmo um check-in verdadeiro não comprova, sozinho, todas as horas contratadas.

## Prazos e relógio

- **Marco inicial T0:** término previsto de cada encontro, em data/hora com fuso. Guardar instante em UTC; exibir ao usuário em `America/Fortaleza`.
- **Até T0 + 24h:** coletar registro, justificativas e confirmação de realização. A partir de 24h, avisar explicitamente a parte que ainda não respondeu.
- **Até T0 + 120h (cinco dias corridos de 24h):** janela interna para manifestação, lembretes de 48h/96h e evidências. Uma contestação mantém o caso sujeito a revisão mesmo dentro da janela.
- **Após T0 + 120h (início da análise no sexto dia):** encaminhar ocorrências não resolvidas para o Admin; pode pedir elementos extras. Esse prazo **não elimina direitos legais** de contestação ou restituição após o quinto dia.
- O agendamento de notificações e a transição de fases precisam rodar **no servidor** (cron/job persistente, retries e idempotência), inclusive sem login e sem PWA aberto. `pg_cron` ainda não está configurado no projeto.

## Matriz de decisões — nunca pela ausência de resposta

| Respostas/evidências | Encaminhamento recomendado |
|---|---|
| QR/PIN validado + minutos efetivamente registrados + concordância das partes | Registrar realização; módulo financeiro separado define liberação contratual |
| Ambas as partes declaram realização, mas não houve QR/PIN | Conferir provas alternativas, após validação concluir; não liberar só pelas declarações |
| Aluno afirma não ter havido aula, instrutor confirma realização | **Contestado** e revisão de evidências, sem pagamento automático |
| Instrutor não compareceu e aluno relata ausência | Contatar instrutor; após análise, oferecer nova data ou reembolso cabível |
| Instrutor alega falta do aluno com evidência consistente | Analisar política de falta aceita na contratação e direitos do consumidor |
| Aluno silencia, instrutor afirma realização | **Revisão**; silêncio do aluno não equivale a prova |
| Instrutor silencia, aluno afirma ausência | **Revisão**; silêncio do instrutor aumenta a urgência, mas não substitui verificação |
| Ambos silenciam e não há prova suficiente | Manter como não resolvido e escalar ao Admin; nunca liberar por decurso de prazo |
| Vento, clima ou segurança impediram aula | Priorizar remarcação sem penalidade indevida; documentar causa |
| Parcialmente realizado (ex.: 90/120 minutos) | Registrar somente os 90 minutos prestados; saldo 30 entra na lógica da Migration 38 |
| Falta de internet impossibilitou QR/PIN | Evidências alternativas, com validação e trilha de auditoria; sem check-in retroativo |

## Estados de produto

`aguardando_registro` → `coletando_manifestacoes` → `divergencia` / `concordancia_a_conferir` → `analise_admin` → decisão fundamentada: `reagendamento`, `reembolso`, `repasse_aprovado` ou `encerrado_sem_movimentacao`.

*Estes são estados propostos para a futura tabela de ocorrências.* **Não devem ser gravados em `bookings.status` ou `booking_meetings.status`** nem usados como comprovante de execução. A fase do simulador TypeScript (`src/lib/lesson-protection-policy.ts`) é auxiliar e não altera o banco.

## Dinheiro e saldo — regras de segurança

1. O valor envolvido é **do encontro ou dos minutos contestados**, não se deve bloquear automaticamente todas as outras aulas.
2. Gateway **Pagar.me** e contrato precisam permitir a retenção/gestão do repasse antes de qualquer ativação real. Um split já efetivado não significa que a plataforma possa fazer escrow ou revertê-lo. O checkout permanece **desativado para testes**.
3. **Nunca liberar pagamento porque o aluno não respondeu**, nem reembolsar porque o instrutor silenciou; são sinais que exigem revisão.
4. Nenhum minuto pode ter simultaneamente um **crédito de reposição** e um **reembolso**. Decisão financeira requer uma transação idempotente e auditoria, vinculada ao encontro/ocorrência.
5. Em testes de `is_test=true`, todos os valores são apenas referências; **nenhuma movimentação de dinheiro**.

## Segurança de dados

- Somente aluno, instrutor atribuído e Admin podem ver a ocorrência, conforme etapa e necessidade. Pousada/afiliado não terá acesso às justificativas.
- Evidências anexadas em Storage **privado**, acesso por permissão/RLS e URLs assinadas, com limites de tamanho, tipos e retenção.
- Registros de quem decidiu, quando, qual evidência e se a parte recebeu ciência. Evitar dados sensíveis desnecessários, geolocalização compulsória ou exposição de documentos aos demais usuários.
- A decisão financeira requer revisão jurídica dos termos, da proteção do consumidor e política de ausência/cancelamento.

## Sequência de implantação segura

- [x] Documentar regras e cenários.
- [x] Implementar **avaliador puro** de prazos e respostas + testes sem efeitos colaterais.
- [ ] Aprovar textos de termos/ausência e matriz de decisões com responsável e orientação jurídica.
- [ ] Desenhar migration **nova e versionada** (não reutilizar 38), policies RLS e ações de gravação em ambiente isolado.
- [ ] Implementar coleta estruturada de manifestações e anexos em Aluno/Instrutor (a RPC antiga de ocorrências já recebe descrição; ainda não equivale ao fluxo de manifestações de ambas as partes).
- [ ] Implementar painel Admin, auditoria, contestação e revisão.
- [ ] Implementar job confiável e testar sem navegação online.
- [ ] Homologar conciliação com a Migration 38, com testes de race condition e de cobrança duplicada.
- [ ] Confirmar gateway e modelo financeiro real antes de liberar repasses/estornos.
- [ ] Validar no iPhone/PC com contas e aulas de teste.

**Não executamos SQL remoto, não abrimos ocorrências reais e não autorizamos pagamentos nesta etapa.**


## Etapa 2 — Monitor de encontros sem registro (interface / sem DDL)

- [x] Páginas existentes `/aluno/ocorrencias`, `/instrutor/ocorrencias` e `/admin/ocorrencias` reutilizadas. O fluxo de relato simples por `report_lesson_incident` e revisão textual do Admin por `review_lesson_incident` **já existia** desde a migração 15.
- [x] Painel somente leitura lista encontros `booking.status=confirmed` e `meeting.status=scheduled` cujo término agendado já passou, sem presumir culpa, presença ou serviço prestado.
- [x] Fases informativas: **Aguardando registro** (primeiras 24h), **Prazo de manifestação** (24h–120h) e **Análise necessária** (a partir de 120h). Os prazos são por encontro e exibidos no horário de Fortaleza.
- [x] Área Admin busca também encontros vencidos **sem relatos** (amostra limitada aos primeiros 100 encontros dos últimos 45 dias para não carregar histórico ilimitado). Esse painel não abre ocorrência nem notifica automaticamente os envolvidos.
- [x] Testes de fronteira e exclusão de estados `done`, `cancelled`, `in_progress`, reservas não confirmadas e datas inválidas.
- [ ] Implementar abertura automática da ocorrência e coleta de declarações específicas, com RLS e auditoria, após uma migração futura e backup planejado.
- [ ] Implementar job persistente de lembretes e mudança de estado no servidor, sem depender de acesso ao aplicativo.
- [ ] Exibir identificação e versões das duas partes, anexos privados e processo formal de contestação.
- [ ] Integrar eventual retenção ao provedor financeiro só após confirmação do suporte real do gateway e validação jurídica.

**Limitação de segurança:** o painel **não** comprova que houve ausência. Um encontro pode estar sem registro e ter ocorrido. O valor **não está de fato retido** apenas porque o painel recomenda atenção, e nenhum crédito ou pagamento é alterado por essa interface.

## Etapa 3A — acompanhamento contextual de relatos (sem alteração do schema)

- [x] Relacionar, no monitor, os relatos **já visíveis por RLS** a cada encontro vencido; aluno/instrutor podem identificar o próprio relato no histórico consultado.
- [x] Mostrar código da reserva no histórico de ocorrências e facilitar o acesso do Admin aos relatos disponíveis.
- [x] Testar agrupamento sem permitir que IDs maliciosos afetem objetos JS.
- [ ] Registrar uma manifestação bilateral estruturada **por participante**, com versão, horários, réplica e contestação persistentes.
- [ ] Receber anexos/evidências privados, com regras de acesso e retenção, mediante migração versionada futura.
- [ ] Configurar notificação por job persistente e fila auditável de decisões fundamentadas.

**Limite essencial:** a consulta de incidentes é limitada aos 100 registros recentes e pode ser
restrita por RLS. O aplicativo só afirma quando **encontra** um relato; nunca conclui que
a outra parte ficou em silêncio porque não encontrou registro. A fase 3A não é
um sistema formal de duas manifestações e não executa SQL remoto, alteração
financeira, abertura automática de incidente, liberação de repasse ou reembolso.

## Etapa 3B — manifestações estruturadas e provas (código preparado, NÃO ativado)

- [x] Migração **39 proposta** com declarações por encontro/autor, versões append-only e funções de autorização no servidor.
- [x] Avaliações administrativas **somente descritivas**, versionadas e auditadas; não criam estorno, crédito, liberação ou check-in.
- [x] Provas com bucket privado, tipagem restrita (JPEG/PNG/WebP/PDF), limite de 5 MB, no máximo seis por declaração; leitura de arquivos restrita ao autor da prova e Admin.
- [x] Interface de linha do tempo Aluno/Instrutor/Admin e envio de arquivo, **inteiramente protegidos** por `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED`. Esta flag fica `false` por padrão.
- [x] Testes da lógica no Node e validações SQL em PostgreSQL temporário; sem executar SQL remoto.
- [ ] Auditar migration 39 e políticas de Storage com schema Supabase real em ambiente de homologação; decidir procedimento de recuperação e obter autorização explícita para alteração.
- [ ] Aplicar migração autorizada, verificar RLS/Storage e habilitar flag somente depois; validar com contas reais e capturas iPhone/desktop.
- [ ] Integração posterior de notificações 24h/120h e mecanismos financeiros conforme gateway, contrato e direitos.
- [ ] Definir política de retenção, limpeza de arquivos pendentes e resposta a evidências sensíveis.

**Atenção:** isto é implementação versionada **desligada**, não funcionalidade publicada para clientes. As telas anteriores de ocorrências permanecem em funcionamento. A análise Admin não executa dinheiro, o prazo interno de cinco dias não elimina direitos legais e silêncio nunca autoriza repasse.

## Etapa 3B — revisão de privacidade anterior à ativação (09/11/2026)

- [x] Políticas de depoimentos refinadas para impedir que a troca de instrutor revele sua declaração anterior ao novo profissional. O autor original mantém acesso ao próprio registro; o aluno mantém histórico da própria reserva e o Admin pode auditar.
- [x] Leitura de arquivos de prova somente após confirmação do upload; arquivos pendentes permanecem sem download, mesmo que haja metadados.
- [x] Acesso ao bucket mediado por função em `protection_private`, schema não exposto à Data API, com permissões explícitas e `search_path=''`.
- [x] Preparação de arquivos serializada por encontro, prevenindo a corrida de envios simultâneos. Limites: 6 por declaração, 20 por encontro/autor, 5 tentativas em 10 minutos. Preparações não confirmadas deixam de contar no limite de 6/20 após 30 minutos, mas continuam sendo auditáveis.
- [x] Confirmação de upload repetido não falha quando já foi validado, mesmo após 15 minutos.
- [ ] Limpeza de arquivos órfãos/pendentes deve usar **API do Storage**, não exclusão direta de `storage.objects`.
- [ ] Política de retenção e privacidade das provas deve ser validada antes da ativação real.
- [ ] Resolver histórico de casos cujo encontro mudou para `done` ou `cancelled`; o monitor atual é apenas de horários vencidos sem registro.
- [ ] Verificar em ambiente de homologação real se as permissões de Storage e funções PostgREST correspondem ao esperado; o stub SQL não emula todo o serviço Supabase.

**Ponto de controle:** a migração 39 ainda não foi aplicada no ambiente real, e a flag de ativação permanece desligada. Estes ajustes são alterações no arquivo versionado e testes temporários de CI, sem repasses financeiros.

## Etapa 3C — histórico independente e retenção conservadora (código, não ativado)

- [x] A interface de manifestações 3B consulta casos recentes a partir das manifestações e ocorrências que o usuário **já consegue ler sob RLS**, independentemente do monitor de aulas `scheduled` e reservas `confirmed`. Isso preserva a visualização de casos após status `done`, `completed` ou `cancelled`.
- [x] Distinção visual entre **acompanhamento** (prazo de aula sem registro) e **histórico** (caso com registro anterior); não cria ocorrência nem altera status ou repasse ao abrir.
- [x] Formulário só aparece para o aluno da reserva ou instrutor atualmente designado, após o término previsto e em reserva `confirmed/completed`. O servidor e a RPC mantêm a autorização final.
- [x] Instrutor substituído pode ver suas próprias manifestações ainda visíveis por RLS, mesmo sem acesso ao booking atual; nomes, datas e outras informações protegidas não são inferidas.
- [x] Limitação explícita: a descoberta usa os **100 relatos estruturados mais recentes visíveis**, os **100 incidentes legados mais recentes** (consulta de origem) e os encontros monitorados. Exibe no máximo 120 casos nesta consulta. Não encontrar caso nessa página não significa ausência no banco; busca/paginação de histórico completa permanece pendente.
- [x] Classificador puro e testes para **revisão manual** de upload não confirmado; nenhuma ação automática de exclusão foi implementada.
- [ ] Aprovar formalmente prazo de retenção com orientação jurídica e regras aplicáveis a incidentes de segurança, disputa e dados pessoais. O valor de 30 dias usado em exemplos de teste **não é política aprovada**.
- [ ] Construir processo administrativo separado com auditoria, dupla verificação e base legal para eventual expurgo. Jamais remover de `storage.objects` por SQL: só via API oficial de Storage. Metadata persistente exige política de tratamento e rastreio específicos.
- [ ] Implementar paginação/busca de casos antigos por número da reserva e homologação com papéis reais antes de considerar histórico completo.
- [ ] Revalidar Storage, RLS e versão da migração 39 em homologação autorizada antes de ligar `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED`.

O código continua **desligado em produção** e nenhuma migração remota, pagamento, estorno, check-in ou exclusão de evidência foi executada nesta etapa.

## Etapa 3D — pesquisa por reserva e paginação por fonte (09/11/2026)

- [x] Componente `ProtectionCaseArchive` integrado às três áreas de Ocorrências; consulta **ocorrências legadas** paginadas mesmo sem a migração 39, mantendo o monitor de horários vencidos independente.
- [x] Busca por **código exato da reserva** com validação estrita de 3–40 caracteres alfanuméricos, hífen ou sublinhado. A busca ocorre pela tabela `bookings` com RLS e aplica o ID retornado como filtro nas consultas seguintes. Código sem permissão e código inexistente recebem a mesma mensagem, sem revelar registros de terceiros.
- [x] Paginação independente de 20 registros por página em ocorrências legadas e manifestações 3B (quando habilitadas), ordenação estável por `created_at DESC, id DESC` e navegação com parâmetros preservados.
- [x] O relatório legado já permite a análise administrativa de registros antigos. O histórico de manifestações é carregado apenas quando `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED` estiver ativado após migração e validação.
- [x] O arquivo de testes checa validação dos filtros, navegação independente, limites de páginas e rejeição de parâmetros duplicados/maliciosos.
- [ ] Validar as telas com sessões reais no iPhone e desktop e revisar paginação de volumes grandes. Limite operacional: páginas 1–1000 (até 20.000 registros por fonte); paginação por cursor pode substituir `offset` em escala.
- [ ] **Instrutor substituído:** por privacidade, a busca por código exige ainda acesso RLS à reserva; manifestações próprias podem aparecer na listagem geral sob RLS. Um canal administrativo específico deverá suportar consultas históricas desse perfil sem liberar informações da reserva atual.
- [ ] A consulta de provas assinadas no arquivo limita visualização a até 40 links por página, sob autorização de Storage; existência de arquivos extras não pode ser negada com base nessa lista.
- [ ] Política formal de retenção das provas e limpeza revisada continua pendente; nenhum arquivo é apagado por esta etapa.

**Escopo de segurança:** sem aplicação de SQL em produção, sem alteração financeira, presença, checkout ou PIN. Código 3B permanece desativado por padrão.
