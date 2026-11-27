# #90 — evidências após aplicar o guard de entradas

Em 26/11/2026 (Fortaleza), o executor root registrou no projeto Kitesurf
`qadkqjfmmnxvovyyhqxw`:

- Aplicação individual da migration oficial de validação, SHA-256
  `f648e135e815751acf07b229811d0edd2c39a9976b02cb48e850acde09b0bfcc`,
  com COMMIT confirmado. Ledger passou a dez migrations.
- Fingerprint de dados antes/depois da aplicação:
  `9eb991e354fe4a1176ebe8fc6c099e53`, idêntico. Naquele snapshot,
  14 reservas, 20 encontros, 19 solicitações e 18 ofertas foram preservados.
- Corpo da delegada legada permaneceu
  `290345b195f7406d07feaf15770cdf89`; owner, ACL e defaults preservados.
- Release #369, commit `03dff66eb40380a468f55e883716175aa8f44484`,
  Render `dep-dc4dm5rrjlhs73fnspp0` LIVE e /api/version conferido.

## Verificação negativa remota executada pelo root

Arquivo repetível:
`supabase/reconciliation/90_request_input_guard.remote-readonly.sql`.

O root executou o arquivo integral no projeto correto e informou PASS nas
60 chamadas inválidas às quatro assinaturas RPC, com claims do aluno de
teste e ROLE authenticated. Asserções de ACL, service_role, modos
DEFINER/INVOKER, helpers privados e start_meeting revogado passaram.
A transação foi READ ONLY, REPEATABLE READ e encerrada com ROLLBACK.
O arquivo não contém DDL e impede escritas/avanço de sequences mesmo
se uma recusa futura ocorrer tarde demais.

A seleção do aluno exige exatamente um perfil student; se a fixture mudar,
o arquivo para em vez de escolher uma conta arbitrária. Não flexibilizar esse
preflight silenciosamente.

## Jornada válida real após a migration

O root percorreu a interface real: aluno criou a solicitação
`7e0a1172-3d71-419f-9b1a-b7ca6f853a02`; instrutor aceitou; aluno confirmou
sem cobrança a reserva VNT-1018
(`a0341ae9-88e1-44b9-b7b5-fa729b284592`).

Horário: 08/12/2026 às 09h de Fortaleza, duração 2h/120min.
Snapshot contratual: 60000 centavos; soma das partes: 60000 centavos.
Não foi uma cobrança nem integração financeira.

Essas evidências comprovam a validação negativa no banco e uma jornada válida
pós-migration. Não encerram a frente integralmente: conservar os critérios
restantes de responsividade/dispositivos, demais durações/níveis e segurança.
O root identificou separadamente a lacuna de cancelamento futuro da #94;
não confundir relato de ocorrência com cancelamento de reserva.
