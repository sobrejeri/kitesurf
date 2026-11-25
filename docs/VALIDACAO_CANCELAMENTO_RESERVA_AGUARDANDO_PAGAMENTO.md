# Cancelamento de reserva aguardando pagamento — validação (25/11/2026)

Escopo: retenção de 10 minutos (`bookings.status = 'awaiting_payment'`). **Só pagamentos de TESTE** (`test_payment_attempts`: `approved`, `pending`, `declined`); nenhuma cobrança real, nenhum dado real alterado, nenhuma migration aplicada.

## Quem cancela uma retenção hoje
1. **Varredura do `create_booking`** (qualquer aluno que reserva limpa as retenções vencidas de todos).
2. **Guarda de agenda do aluno** (gatilho em `instructor_requests`, migration 35): limpa as vencidas do próprio aluno.
3. **Reconciliação de agenda do instrutor** (PR #339, `reconcile_instructor_availability`): cancela a retenção que deixou de caber.
Nenhum desses caminhos gravava auditoria, e nenhum olhava o estado dos pagamentos.

## O que foi validado (`supabase/tests/95a_hold_cancellation.test.sql`)
| Requisito | Resultado |
|---|---|
| **Sem pagamento aprovado** | Aprovar confirma a reserva na mesma transação; portanto não existe retenção com aprovado. Nova **trava** no banco recusa (55000) cancelar retenção com tentativa aprovada (defesa em profundidade; não dispara no uso normal). |
| **Sem pagamento em processamento** | **Não é o comportamento atual:** a janela de 10 min vale mesmo com tentativa `pending`; a retenção é cancelada. Agora isso fica **registrado** na auditoria (`had_pending_payment = true`). **Decisão de produto pendente** (ver abaixo). |
| **Idempotência** | O cancelamento é uma transição única: varreduras repetidas e `UPDATE` sem mudança não auditam de novo (uma linha de auditoria por retenção). |
| **Auditoria** | `booking.hold_cancelled` em **todos** os caminhos (varredura do `create_booking`, guarda de agenda do aluno e reconciliação), com `held_minutes`, `had_pending_payment`, `had_approved_payment`. Antes: nenhuma. Sem a migration o teste falha (0 auditorias), o que prova o achado. |
| **Confirmação tardia** | Depois do cancelamento (ou fora da janela, mesmo sem varredura), `confirm_test_payment`, `confirm_validation_lesson` e `simulate_test_payment` (`approved` e `pending`) são recusadas com 55000, **sem** criar tentativa de pagamento, sem confirmar e sem reativar. Vale também para aprovação tardia de um pagamento que estava em processamento. |

## O que mudou
`supabase/migrations/20261125130000_audit_hold_cancellation.sql` (aditiva, **não aplicada**): gatilho `BEFORE UPDATE OF status` em `bookings` que audita a transição `awaiting_payment → cancelled` e recusa cancelar com pagamento aprovado. Nenhuma linha existente é alterada.

## Decisões pendentes (não decididas aqui)
- **Pagamento em processamento deve segurar a retenção?** Hoje não segura. Com cobrança real (PSP) um pagamento aprovado depois da janela exige regra de estorno/realocação; é desenho financeiro, fora desta fase e **não implementado**. A auditoria já distingue o caso para essa decisão.
- Confirmação tardia **nunca** reativa uma reserva cancelada (comportamento mantido).
