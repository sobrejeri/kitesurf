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
