## 41 — VentoKite Protege: bloqueio das funções de escrita antes da homologação

**Arquivo:** `20261110000041_vento_protege_block_mutation_rpcs.sql`.
**Objetivo:** a flag visual `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED` não impede chamadas diretas à API. Enquanto os testes autenticados no app e Storage não estiverem aprovados, revogar `EXECUTE` de `authenticated` em quatro RPCs: envio de manifestação, avaliação Admin, preparação e confirmação de evidência. Não revoga leitura de histórico sob RLS e não altera reservas, aulas, pagamentos ou arquivos existentes.

A migração inclui verificação de que não há uploads não confirmados antes de bloquear confirmação. Reverter a trava futuramente exige uma **nova migração**, com `GRANT EXECUTE` autorizados depois da homologação, e só então ativar o flag da interface no Render. Os testes do CI concedem EXECUTE **apenas dentro da própria transação ROLLBACK**, sem abrir o banco real.

**Ordem:** 39 (aplicada) → 40 (aplicada) → 41 (gate de backend, verificar histórico real de aplicação). Migrações 01–38 continuam sem baseline no Supabase.

---

## Registro da aplicação em produção — 09/11/2026 (horário de Fortaleza)

As migrations **39 e 40 foram aplicadas com sucesso** no Supabase do projeto kitesurf (`qadkqjfmmnxvovyyhqxw`), após aprovação expressa, verificação de compatibilidade e testes SQL isolados. O histórico formal criado pelo Supabase associa os scripts a estas versões:

| Arquivo versionado no GitHub | Versão real no Supabase | Nome registrado |
|---|---|---|
| `20261109000039_vento_protege_statements.sql` | `20261110001348` | `vento_protege_39_statements_evidence` |
| `20261109000040_protection_incident_participant_snapshot.sql` | `20261110001427` | `vento_protege_40_incident_instructor_snapshot` |

**Validações após aplicação:** `lesson_protection_statements`, `lesson_protection_reviews` e `lesson_protection_evidence` criadas com RLS; bucket `vento-protection-evidence` privado e limitado a 5 MB; RPCs novas presentes; trigger de snapshot `capture_protection_incident_participant` ativo; SELECT de `booking_incidents` restrito a Admin, aluno, autor e instrutor historicamente atribuído. Permissão `anon` de SELECT em depoimentos e EXECUTE da RPC de submissão: negada. `authenticated` não pode inserir depoimentos diretamente.

**Preservação dos dados:** antes e depois: **5 reservas, 6 encontros, 0 ocorrências**. As tabelas financeiras e operações de pagamentos não foram alteradas. Formulários 3B permanecem **desativados por padrão** até testes autenticados de ponta a ponta e ativação explícita da flag.

**Atenção — histórico antigo não foi reconciliado:** o histórico formal do Supabase agora contém **somente essas duas entradas**, não os scripts 01–38 (objetos antigos já existem). Não rodar `supabase db push`, `db reset`, migrations 01–38 ou propostas conflitantes de 38 sem comparar o esquema e estabelecer o baseline. Os cabeçalhos "PREPARED ONLY" mantidos nos arquivos SQL são comentários históricos do momento de preparação, não representam o estado atual.

---

# VentoKite — Catálogo de migrações e identificação do SQL

> Criado em 09/11/2026 para a tarefa de auditoria [#88](https://github.com/sobrejeri/kitesurf/issues/88).
> **Documento de identificação, não é um script executável nem uma confirmação de que cada migração foi aplicada.**

## O que foi verificado

- Existem **37 arquivos SQL identificados e sequenciados** no GitHub (`supabase/migrations`, números 01–37).
- O projeto Supabase real `kitesurf` retornou **zero entradas** em `list_migrations`.
- A consulta de leitura `to_regclass('supabase_migrations.schema_migrations')` retornou **NULL**. Portanto, **não existe um histórico de migração gerenciado nessa base**. Não podemos concluir quais scripts foram executados a partir dos nomes dos arquivos.
- No banco real, há também objetos de **reposição de saldo de horas** (`public.balance_meeting_requests` e funções relacionadas), correspondentes em estrutura à proposta ainda aberta no **PR #37**; outra proposta de migração com a mesma sequência **38** está no **PR #39**. Nenhuma das duas migrações está presente na branch publicada.
- **Não renomear prefixos de versão nem executar novamente os SQLs 01–37 / 38** antes de reconciliar com um backup e a estrutura real do banco.

## Identificação legível das migrações

| Nº | Arquivo no GitHub | Identificação em português | Histórico no Supabase |
|---:|---|---|---|
| 01 | `20261030000001_core_schema.sql` | Estrutura base, usuários, reservas e permissões | Sem histórico registrado |
| 02 | `20261030000002_booking_functions.sql` | Funções principais de contratação e reservas | Sem histórico registrado |
| 03 | `20261031000003_managed_beaches.sql` | Praias e locais atendidos | Sem histórico registrado |
| 04 | `20261031000004_support_vehicle.sql` | Transporte de apoio | Sem histórico registrado |
| 05 | `20261101000005_instructor_profile.sql` | Perfil dos instrutores | Sem histórico registrado |
| 06 | `20261101000006_student_avatar.sql` | Fotos dos alunos | Sem histórico registrado |
| 07 | `20261101000007_instructor_schedules.sql` | Agenda e disponibilidade dos instrutores | Sem histórico registrado |
| 08 | `20261101000008_booking_messages.sql` | Mensagens por reserva | Sem histórico registrado |
| 09 | `20261101000009_test_checkout.sql` | Checkout para testes | Sem histórico registrado |
| 10 | `20261101000010_first_paid_referral.sql` | Comissão da primeira compra indicada | Sem histórico registrado |
| 11 | `20261101000011_instructor_offers.sql` | Fila e ofertas para instrutores | Sem histórico registrado |
| 12 | `20261101000012_instructor_ratings.sql` | Avaliações de instrutores | Sem histórico registrado |
| 13 | `20261101000013_preferred_instructor.sql` | Recontratação de instrutor preferido | Sem histórico registrado |
| 14 | `20261101000014_date_suggestions.sql` | Sugestões de alteração de data | Sem histórico registrado |
| 15 | `20261101000015_lesson_incidents.sql` | Ocorrências durante as aulas | Sem histórico registrado |
| 16 | `20261101000016_in_app_notifications.sql` | Notificações internas | Sem histórico registrado |
| 17 | `20261101000017_instructor_documents.sql` | Documentos de instrutores | Sem histórico registrado |
| 18 | `20261101000018_approval_document_gate.sql` | Aprovação vinculada aos documentos | Sem histórico registrado |
| 19 | `20261101000019_meeting_points.sql` | Pontos de encontro | Sem histórico registrado |
| 20 | `20261101000020_admin_test_lesson.sql` | Aulas de teste criadas pelo Admin | Sem histórico registrado |
| 21 | `20261101000021_instructor_profile_progress.sql` | Progresso do cadastro de instrutores | Sem histórico registrado |
| 22 | `20261101000022_partner_profile.sql` | Perfis de pousadas parceiras | Sem histórico registrado |
| 23 | `20261101000023_admin_profile_avatars.sql` | Avatares de perfis administrativos | Sem histórico registrado |
| 24 | `20261101000024_admin_commissions.sql` | Administração de comissões | Sem histórico registrado |
| 25 | `20261102000025_student_booking_instructor_avatar.sql` | Foto do instrutor nas reservas do aluno | Sem histórico registrado |
| 26 | `20261102000026_meeting_kite_progress.sql` | Evolução pedagógica dos encontros | Sem histórico registrado |
| 27 | `20261102000027_student_kite_levels.sql` | Níveis de kitesurf dos alunos | Sem histórico registrado |
| 28 | `20261102000028_booking_level_assessments.sql` | Avaliação de nível por reserva | Sem histórico registrado |
| 29 | `20261102000029_admin_test_multi_meetings.sql` | Aulas teste com múltiplos encontros | Sem histórico registrado |
| 30 | `20261102000030_meeting_change_approval.sql` | Aprovação de alterações de encontros | Sem histórico registrado |
| 31 | `20261102000031_preserve_bookings_on_change.sql` | Preservação de reservas após alteração | Sem histórico registrado |
| 32 | `20261103000032_student_request_schedule_guard.sql` | Bloqueios de agenda do aluno | Sem histórico registrado |
| 33 | `20261104000033_instructor_request_visibility.sql` | Visibilidade das solicitações para instrutores | Sem histórico registrado |
| 34 | `20261104000034_validation_workflows.sql` | Fluxos de validação | Sem histórico registrado |
| 35 | `20261104000035_student_schedule_expiry.sql` | Expiração de agendamentos do aluno | Sem histórico registrado |
| 36 | `20261104000036_level_hourly_prices.sql` | Valores por hora e por nível | Sem histórico registrado |
| 37 | `20261104000037_chat_presence_receipts_files.sql` | Presença, leitura e arquivos no chat | Sem histórico registrado |

## Alterações sem número rastreável

| Nome de auditoria proposto | Evidência no banco real | Situação |
|---|---|---|
| **38 — Reposição de saldo de horas (a conciliar)** | Tabela `balance_meeting_requests`; funções `booking_balance_minutes`, `request_balance_meeting`, `respond_balance_meeting` e `close_booking_balance` | **Schema presente, sem arquivo 38 integrado ou histórico de aplicação** |
| **38 — Versão alternativa de reposição (PR #39)** | Outra proposta concorrente com o mesmo número de migração | **Não executar/mesclar sem consolidar a regra com a proposta do PR #37** |

## O que esses nomes significam (e não significam)

1. O **prefixo numérico** é a identidade do arquivo de migração; o nome após o sublinhado facilita leitura e busca.
2. Este catálogo dá **nomes descritivos** às alterações, mas **não registra migrações retroativamente no Supabase**.
3. SQLs executados manualmente no **SQL Editor** podem ter sido salvos como consultas sem título. Renomear essas consultas no editor, quando existirem, **não altera** `schema_migrations` nem garante integridade do histórico.
4. O conector de banco disponível permite examinar tabelas, funções e migrações, mas **não oferece renomear consultas salvas no SQL Editor**. Essa ação permanece manual na interface; o catálogo é a referência para os títulos.
5. **Sem backup e comparação do schema**, não criar artificialmente entradas na tabela de migrações: isso poderia marcar como aplicada uma alteração que nunca ocorreu.

## Sequência segura para normalizar o histórico

- [ ] Obter backup restaurável de produção e verificar a possibilidade de restauração.
- [ ] Criar ou selecionar um ambiente de homologação isolado.
- [ ] Comparar objetos reais do Supabase com o conteúdo dos SQLs 01–37, identificando mudanças manuais e divergências.
- [ ] Confirmar o que foi executado da proposta de saldo 38 e consolidar uma versão única no GitHub.
- [ ] Com histórico técnico e revisão, estabelecer o *baseline* de migrações no ambiente de homologação, sem rodar scripts já aplicados.
- [ ] Documentar como sincronizar a produção sem perder dados; executar apenas após validação.

**Status geral desta identificação: nomes catalogados; migrações da produção ainda não conciliadas.**

## 39 — VentoKite Protege (APLICADA EM PRODUÇÃO)

- Arquivo no GitHub: `20261109000039_vento_protege_statements.sql`.
- Tabelas propostas: `lesson_protection_statements` (relatos versionados e imutáveis), `lesson_protection_reviews` (avaliação registrada por Admin) e `lesson_protection_evidence` (metadados privados).
- Bucket novo proposto `vento-protection-evidence` (privado, 5 MB, imagens/PDF).
- Funções propostas: `submit_lesson_protection_statement`, `review_lesson_protection_case`, `prepare_lesson_protection_evidence`, `confirm_lesson_protection_evidence`.
- **A migração 39 foi aplicada em 09/11/2026.** A interface ainda depende de `NEXT_PUBLIC_VENTO_PROTEGE_STATEMENTS_ENABLED=true`, flag que deverá permanecer desativada até reconciliação, testes de RLS e autorização de schema.
- Não modifica migração 38 nem altera dinheiro/presença/minutos.

### Auditoria de segurança incorporada à 39

O arquivo `20261109000039_vento_protege_statements.sql` foi reforçado com:
- Policy de leitura que protege as declarações do instrutor anterior após a mudança de atribuição.
- Helper de acesso Storage no schema privado `protection_private` com somente `USAGE`/EXECUTE para `authenticated`.
- Leitura de arquivo confirmada (sem baixar evidência em upload pendente).
- Limites serializados por encontro e janela de recuperação de tentativas falhas.
- Testes de segurança em PostgreSQL temporário, sem supor que a base real tenha histórico de aplicação de migrações.

**A 39 já foi aplicada e não deve ser reexecutada.** Antes de novas migrations, conciliar as versões 01–38.

### Etapa 3C — consulta histórica e política de evidências ainda não ativadas

A exibição de manifestações foi desacoplada do monitor de aulas `scheduled`. Nenhuma migration nova é necessária para esta melhoria de interface; a UI ainda aguarda homologação e ativação após a migração 39. Um classificador de retenção em modo **dry-run** permite sinalizar uploads incompletos à revisão manual sem excluir arquivo ou registro. O prazo de retenção real está pendente de aprovação jurídica/operacional. A API do Storage deverá ser usada em toda remoção aprovada; nunca excluir diretamente de `storage.objects`.

### Etapa 3D — histórico paginado sem nova migração

A consulta a `booking_incidents` agora tem paginação de 20 itens por vez e filtro por código de reserva com autorização RLS. Com a migration 39 instalada, `lesson_protection_statements` poderá usar navegação semelhante quando a flag 3B for ativada após homologação. **Esta etapa 3D não aplicou SQL; posteriormente as migrations 39/40 foram aplicadas separadamente em 09/11/2026. A flag segue desligada.**


## 40 — Incidentes: congelamento do instrutor na abertura (APLICADA EM PRODUÇÃO)

- Arquivo versionado: `20261109000040_protection_incident_participant_snapshot.sql`.
- Protege a tabela **já existente** `booking_incidents` contra leitura retroativa pelo instrutor substituto. Novos relatos terão o campo `instructor_at_report_id`, preenchido em trigger pelo banco no instante do registro.
- **Dados anteriores à aplicação permanecem com `instructor_at_report_id IS NULL`.** Nunca preencher automaticamente com o instrutor atual: isso inventaria participação histórica e poderia vazar dados privados. Esses relatos ficam visíveis ao autor, aluno da reserva e Admin até revisão apropriada.
- Aluno e Admin continuam enxergando o histórico; cada instrutor acessa somente ocorrências escritas durante sua própria atribuição ou diretamente por ele.
- O trigger impede reescrever autor, reserva, encontro ou instrutor histórico, sem impedir avaliação administrativa de status.
- A revisão **também ajustou o arquivo da migração 39 ainda não aplicada**: declarações congelam `instructor_at_statement_id`; avaliações administrativas só são visíveis a instrutores que já tinham registrado sua versão no momento daquela avaliação.
- Testes de autorização em `90_incident_assignment_privacy.test.sql` e expansão do teste 89 são executados somente no PostgreSQL efêmero do CI.

### Bloqueio obrigatório de aplicação

Na auditoria inicial de 09/11/2026, `supabase_migrations.schema_migrations` estava ausente apesar de existirem as tabelas antigas. Depois, as migrations 39/40 foram aplicadas por ferramentas oficiais e passaram a constar no histórico formal. **Não executar sequencialmente as migrations antigas 01–38**, que continuam sem baseline. As novas tabelas e o bucket privado já existem.

O procedimento correto é: homologação isolada, comparação de schema, política de recuperação acordada, aprovação explícita da implantação e validação de RLS com contas reais. Migração 39 foi aplicada e validada antes da 40; nenhuma delas executou pagamento, presença ou saldo.
