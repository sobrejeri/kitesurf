# Vento — instalação das migrations pendentes

> **Confirme um backup e prefira homologação antes de executar qualquer SQL em produção.**
> Execute as migrations no **Supabase SQL Editor**, usando a ordem numérica.
> Não rode novamente um arquivo que já foi aplicado. Os SQLs não são migrações
> totalmente idempotentes. Não execute os arquivos `supabase/tests/*.sql` em produção.

## 1. Verificar o banco primeiro

Abra [00_verificar_instalacao.sql](./00_verificar_instalacao.sql) e execute o SELECT
no SQL Editor. Ele indica se cada marco principal foi detectado.
A detecção não substitui conferir o histórico das migrações, mas ajuda a
distinguir uma instalação nova de uma instalação parcial.

**Contexto conhecido:** 01–03 já parecem instaladas no Vento existente.
A migração **05** foi confirmada pelo usuário anteriormente.
Não temos confirmação da **04** nem da **06–19** no Supabase de produção.

## 2. Verificar ou instalar os pré-requisitos

- **04** — [20261031000004_support_vehicle.sql](../migrations/20261031000004_support_vehicle.sql):
  use apenas se a verificação indicar que o suporte a veículo não foi instalado.
- **05** — [20261101000005_instructor_profile.sql](../migrations/20261101000005_instructor_profile.sql):
  já informada como executada; não rode novamente sem confirmar a ausência.

A instalação das 06–19 depende da estrutura criada pela 04 e pela 05.

## 3. Instalar 06–19, na ordem

**Se nenhuma das 06–19 foi executada**, use o
[SQL consolidado 06–19](./VENTO_MIGRACOES_06_A_19_TRANSACAO_UNICA.sql).
O arquivo executa todas dentro de **uma única transação**; erro no meio
provoca rollback das mudanças desse pacote.

**Se alguma já foi executada**, NÃO use o consolidado.
Compare a verificação com o histórico e execute somente os arquivos
faltantes, individualmente e em ordem:

- **06** — [20261101000006_student_avatar.sql](../migrations/20261101000006_student_avatar.sql)
- **07** — [20261101000007_instructor_schedules.sql](../migrations/20261101000007_instructor_schedules.sql)
- **08** — [20261101000008_booking_messages.sql](../migrations/20261101000008_booking_messages.sql)
- **09** — [20261101000009_test_checkout.sql](../migrations/20261101000009_test_checkout.sql)
- **10** — [20261101000010_first_paid_referral.sql](../migrations/20261101000010_first_paid_referral.sql)
- **11** — [20261101000011_instructor_offers.sql](../migrations/20261101000011_instructor_offers.sql)
- **12** — [20261101000012_instructor_ratings.sql](../migrations/20261101000012_instructor_ratings.sql)
- **13** — [20261101000013_preferred_instructor.sql](../migrations/20261101000013_preferred_instructor.sql)
- **14** — [20261101000014_date_suggestions.sql](../migrations/20261101000014_date_suggestions.sql)
- **15** — [20261101000015_lesson_incidents.sql](../migrations/20261101000015_lesson_incidents.sql)
- **16** — [20261101000016_in_app_notifications.sql](../migrations/20261101000016_in_app_notifications.sql)
- **17** — [20261101000017_instructor_documents.sql](../migrations/20261101000017_instructor_documents.sql)
- **18** — [20261101000018_approval_document_gate.sql](../migrations/20261101000018_approval_document_gate.sql)
- **19** — [20261101000019_meeting_points.sql](../migrations/20261101000019_meeting_points.sql)

## 4. Verificar novamente

Execute [00_verificar_instalacao.sql](./00_verificar_instalacao.sql)
depois da instalação. Confira as permissões e o funcionamento
das quatro contas: Aluno, Instrutor, Pousada e Admin.
A confirmação do SQL não garante que o deploy do Render esteja na versão correta.

## Importante sobre o checkout

A migration 09 cria apenas **simulação** de PIX/cartão.
Nenhum pagamento ou repasse real será habilitado por este pacote.

## Atenção ao rastreamento

Se você executa via SQL Editor, o Supabase pode não registrar automaticamente
esses arquivos em `supabase_migrations.schema_migrations`. Guarde a data,
o nome e o resultado de cada SQL executado para evitar duplicações.
