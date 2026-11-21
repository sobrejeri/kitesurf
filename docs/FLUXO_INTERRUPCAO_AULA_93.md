# #93 — Interrupção excepcional por aula (decisão 21/11/2026)

## Regra aprovada
- A unidade contratada e concluída é a **aula/encontro**, não minutos de crédito. Aula realizada pode terminar antes da duração prevista sem gerar saldo.
- Ao finalizar, o instrutor escolhe **Concluída normalmente** ou **Interrompida**.
- Interrompida: registrar motivo, minutos efetivamente ministrados e minutos restantes (0 < restantes <= duração prevista). A aula não é duplicada na evolução.
- O aluno vê: **“Aula interrompida. Entre em contato com seu instrutor pelo chat para combinar a continuidade.”** Link abre a conversa da reserva.
- Somente o instrutor responsável agenda a continuidade do **mesmo encontro**, para outra data/horário, com checagem de conflitos. Acordo é feito entre aluno e instrutor; a plataforma registra o agendamento, sem nova cobrança.
- Aula retomada registra conclusão e preserva trilha de auditoria, sem gerar segunda aula ou cobrar outra vez.
- **Não** criar créditos automáticos quando a aula normal dura menos do que o previsto.
- Não permitir ao aluno pedir reposição ou renunciar a “saldo de horas”; descontinuar gradualmente `request_balance_meeting`, `respond_balance_meeting`, `close_booking_balance` sem excluir histórico nem quebrar reservas legadas.
- Manter contratos financeiros congelados, modo sem checkout, RLS por aluno/instrutor, idempotência e preservação de dados.

## Plano de implementação e critérios de aceite
1. Inventariar o esquema atual de `booking_meetings`, RPC de conclusão e as rotas do instrutor; comparar migrations existentes e dados legados.
2. Migration **aditiva** para motivo, duração registrada, minutos restantes e vínculo da retomada ao mesmo encontro; política de RLS e auditoria; testar com transações ROLLBACK antes de aplicar.
3. Server Action de finalização exige decisão explícita e só permite reagendamento pelo instrutor atribuído; não aceitar `student_id`/instrutor vindos do cliente; validar datas futuras e conflitos.
4. UI instrutor: modal/caixa “A aula foi interrompida?”, motivo, minutos restantes calculados, confirmação, lista de pendências e calendário de continuidade.
5. UI aluno: aviso contextual e link ao chat da reserva; remover ações de saldo/renúncia.
6. Evolução: uma aula conta uma única vez, somente quando definitivamente concluída; interrupção não duplica aula.
7. Regressão: normal de 45/60 sem crédito; interrupção 30/60 com retomada 30; acesso cruzado bloqueado; conflito bloqueado; double submit idempotente; reservas antigas preservadas.
8. CI, PR, deploy Render LIVE e E2E com sessões autenticadas Aluno/Instrutor. Nenhuma cobrança real.

## Observação de migração
A PR #321 já está em produção e exige confirmação para renunciar saldo; ela será substituída junto com o fluxo antigo, **não** considerada homologação da nova regra. Não desligar RPCs ou remover colunas antes de compatibilizar os registros históricos.

## Status
Decisão registrada e implementação planejada. Ainda **não implementado nem homologado**.

## Inventário técnico verificado no Supabase Kitesurf (21/11/2026)
- Tabela `public.booking_meetings`: `id`, `booking_id`, `position`, `starts_at`, `minutes`, `status`, `done_minutes`, `note`, `started_at`, `recorded_at`. **Não existem** colunas específicas de interrupção, motivo ou continuidade.
- `record_meeting_with_skills(meeting_id, done_minutes, practiced_steps, mastered_steps)` é SECURITY DEFINER, exige instrutor atribuído e encontro `in_progress`; chama `record_meeting` e registra habilidades/auditoria. Modificar esse contrato sem verificar a RPC interna poderia duplicar progresso ou finalizar prematuramente a reserva.
- Permanecem as RPCs antigas `request_balance_meeting`, `respond_balance_meeting` e `close_booking_balance`; também há `request_meeting_change`/`respond_meeting_change`, que não devem ser reutilizadas sem conferir as regras de titularidade e prazo.
- Na página do Aluno `src/app/aluno/(app)/reserva/[id]/page.tsx`, o saldo é derivado de `bookingBalanceMinutes` e mostrado por `BalanceMeetingPanel`; remover o componente só após o novo aviso de interrupção estar funcional.
- **Decisão técnica:** modelar a continuidade como estado explícito do encontro original, não como novo encontro com `position` adicional. Conservar `done_minutes` e `meeting_skill_progress` como histórico, e impedir a conclusão duplicada.
- **Próxima alteração segura:** inspecionar `record_meeting`, triggers de `bookings`, enum `meeting_status`, regras de calendário e rotas do Instrutor; só então propor migration aditiva e teste em transação. Nenhum DDL aplicado nesta etapa.

## Confirmação da causa-raiz (21/11/2026)
A definição REAL de `public.record_meeting(uuid, integer, text)` foi inspecionada. Ela muda `booking_meetings.status` para `done`, registra `done_minutes` e só muda `bookings.status` para `completed` quando **não há encontros ativos E** `sum(done_minutes) >= total_hours * 60`. Portanto uma aula normal de 45/60 deixa reserva confirmada, embora encontro esteja concluído. Essa é a causa-raiz do saldo artificial.

`record_meeting_with_skills` chama `record_meeting`; a correção deve preservar a validação de competências e impedir dupla contabilização. Enum atual `meeting_status`: `scheduled`, `in_progress`, `done`, `cancelled`. Contagem de referência do projeto de testes: 10 scheduled, 7 done, 1 cancelled; não atualizar dados legados automaticamente.

**Gate para implementação:** implementar operação transacional de interrupção/retomada com estado inequívoco, motivo, duração e autorização por instrutor. Mudar a conclusão para contar encontros contratados concluídos, sem condicionar ao total de minutos, mas somente após tratar as interrupções. Testar reservas com múltiplos encontros, skills, conflitos e legado em ROLLBACK antes de aplicar DDL. A migração ainda não foi aplicada e nenhuma reserva foi alterada.

## Inventário complementar — contrato da aplicação
- `src/app/actions/instructor.ts` contém `recordMeeting` e `recordMeetingWithSkills`; a segunda valida seis etapas de aprendizagem e chama `record_meeting_with_skills`. A action de início chama `start_ordered_meeting`, deliberadamente sem fallback para `start_meeting`; preservar essa proteção.
- `src/app/instrutor/(app)/aula/page.tsx` renderiza aulas por abas Próximas/Em aula/Concluídas e ainda mostra `InstructorBalanceRequests` com pedidos iniciados pelo aluno. Remover esse painel apenas quando a continuidade por instrutor estiver operacional.
- `can_move_meeting` já verifica janela de trabalho, folgas e conflitos de instrutor; contudo, sua consulta considera **qualquer encontro não cancelado**, inclusive `done`, e duração `m.minutes`. Ao reagendar o mesmo encontro é necessário validar a duração restante e evitar reservar o horário antigo indevidamente.
- `start_meeting` exige encontro `scheduled` e código de presença; a action de produção usa `start_ordered_meeting` (regras de sequência). A retomada deverá ter uma transição compatível e não abrir caminho para burlar a confirmação de presença.
- A tabela `booking_meetings` não possui triggers próprios no projeto inspecionado. A evolução por skills e a conclusão da reserva são controladas por RPCs; qualquer mudança de estado deve preservar esse comportamento.

### Estratégia de liberação em duas fases (sem quebra)
**Fase A:** introduzir campos e RPCs novos de interrupção e retomada, protegidos por autorização e validação transacional; adicionar telas sob feature flag desligada; testar fixtures sem persistir. **Fase B:** ligar telas e novo fluxo simultaneamente, ajustar conclusão por encontro e retirar solicitações de saldo antigas do usuário; conservar histórico e rotas legadas com bloqueio controlado, depois validar sessões reais e publicar. Não ativar Fase B antes da A.
