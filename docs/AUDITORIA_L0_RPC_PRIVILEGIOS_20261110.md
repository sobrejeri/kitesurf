# L0 — triagem read-only de EXECUTE e SECURITY DEFINER (10/11/2026)

Projeto conferido: Supabase **kitesurf** `qadkqjfmmnxvovyyhqxw`, não Turiva. Coleta por Security Advisors e consulta de catálogo `pg_proc`/ `has_function_privilege`; **nenhum DDL, dado ou pagamento alterado**.

## Evidência real

- Advisors: `function_search_path_mutable` **4**; `anon_security_definer_function_executable` **8**; `authenticated_security_definer_function_executable` **87**; alerta de senhas vazadas ainda requer verificação de configuração.
- Oito funções SECURITY DEFINER com `EXECUTE` efetivo para `anon`: `is_admin()`, `notify_booking_message()`, `notify_confirmed_booking()`, `notify_lesson_incident()`, `notify_offer_transition()`, `quote_preview(integer)`, `quote_table()`, `quote_table_by_level()`.
- `notify_*` são candidatas a funções de trigger: antes de revogar, verificar `pg_trigger`, definições, chamadas de app e implicações de autorização; `is_admin()` precisa revisão de corpo/retorno para evitar exposição indevida. As três `quote_*` podem ser catálogo público intencional; não revogar sem confirmar UX e contratos.
- Quatro funções sem `search_path` fixo: `bookings_snapshot_frozen`, `touch_updated_at`, `reject_change`, `reject_test_payment`. Não são SECURITY DEFINER na consulta; `reject_test_payment` ainda possui EXECUTE por `anon` e `authenticated`, exigindo triagem específica.
- Migrations reais registradas: 39 `20261110001348`, 40 `20261110001427`, 41 `20261110003527`, 42 `20261110012944`. Manter trava 41 e não aplicar 01–38 em lote.

## Próxima correção segura (P0/P1, ainda não aplicada)

1. Ler `pg_get_functiondef`, dependências `pg_trigger`, chamadas reais do frontend e grants exatos para cada uma das oito funções, diferenciando trigger-only de API pública intencional.
2. Escrever migration **nova**, mínima e reversível para revogar EXECUTE de `anon` nas funções comprovadamente internas, sem tocar nas três `quote_*` sem validação. Testar em PostgreSQL isolado via `scripts/test-db.sh` com asserções de privilégios e comportamento.
3. Confirmar que a revogação não quebra notificações disparadas por trigger nem o catálogo público; só então propor aplicação em produção com ledger conferido e testes de sessão negativa por papel.
4. Revisar separadamente as 87 RPCs autenticadas por autorização owner/role, priorizando IDOR e efeitos colaterais; número de avisos não equivale a 87 vulnerabilidades.

**Estado:** auditoria parcial com evidência SQL; **não** homologação de segurança ou E2E. Checkout/Protege 3B fechados, nenhum usuário real modificado.
