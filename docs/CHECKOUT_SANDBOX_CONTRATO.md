# VentoKite — contrato offline de checkout (sem dinheiro real)

Primeira etapa isolada: `src/lib/checkout-sandbox.ts` calcula centavos inteiros e split com valores fornecidos exclusivamente pelo backend; valida transições de status e identificadores de eventos. `scripts/test-checkout-sandbox.mjs` cobre cenários básicos e rejeições. **Não é um gateway, nem endpoint de cobrança.**

## Próximos bloqueios obrigatórios
1. Escolher o PSP e documentar os contratos oficiais de Pix, cartão, split, retenção, reembolso e chargeback.
2. Criar armazenamento de tentativas e eventos com RLS, índice único de idempotência, transações e trilha de auditoria, em migration revisada; não aplicar migrações antigas em produção.
3. Implementar assinatura de webhook e validação contra API oficial, com proteção a replay e concorrência.
4. Implementar criação de checkout com preço recalculado no servidor, vínculo de propriedade e confirmação exclusivamente por evento confiável.
5. Exercitar cenários de falha em sandbox oficial, sem movimentar dinheiro real.
6. Não autorizar repasse automático por silêncio; Protege exige decisão auditada.

Checkout real permanece desligado (`VALIDATION_WITHOUT_CHECKOUT = true`). E2E autenticado de aula ainda não homologado. Nenhuma credencial deve ser armazenada no Git.
