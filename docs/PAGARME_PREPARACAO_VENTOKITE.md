# Preparação do checkout Pagar.me — issue #101

O módulo `src/lib/pagarme-split-preview.mjs` é uma prévia offline de divisão em centavos. Não cria pedido, não chama a Pagar.me, não persiste dados, não processa webhook e não libera repasses. O checkout existente permanece em modo de validação. Execute `node scripts/test-pagarme-split-preview.mjs` para conferir as invariantes locais.

## Direção técnica

- Criar pedidos no servidor a partir do snapshot autorizado e imutável da reserva; jamais aceitar preço, comissão ou recebedor financeiro do navegador. Split `flat` usa centavos e deve somar o total.
- Na API V5, o split e os recebedores devem ser enviados na autorização. O split depende da modalidade PSP/contrato. A documentação diferencia `card_token` para Gateway e recomenda `card_id` para PSP. Confirmar a modalidade e o fluxo seguro de cartão antes de implementá-lo.
- A reserva de Business pertence à empresa; acerto da empresa com instrutor vinculado é manual fora da plataforma. Não presumir que o instrutor vinculado seja recebedor da transação. Afiliado só participa quando aplicável e autorizado; valores e vínculo devem estar congelados.
- A prévia exige decisão explícita para responsabilidade por chargeback e taxas. Ela não valida se as opções combinadas são aceitas pelo contrato; isso depende de homologação com Pagar.me.
- Não assumir retenção ou liberação após aula: validar com Pagar.me disponibilidade contratual por método, prazo, disputa e repasses. O silêncio de participante não comprova aula no Protege.
- Projetar persistência idempotente de tentativa, eventos e decisões sob lock, consulta ao provedor para resultados incertos, conciliação, estornos parciais e chargebacks. Uma resposta perdida não autoriza criar uma nova cobrança automaticamente. Nunca guardar cartão/CVV ou segredos em logs.
- Verificar documentação atual de autenticação de webhook e implementar validação da origem antes de mudanças de estado; não reutilizar a assinatura Mercado Pago existente para Pagar.me.

## Próximos portões

1. Confirmar conta Pagar.me própria do VentoKite, PSP/split, recebedores e credenciais de teste em cofre; não usar conta ou banco da Turiva sem decisão expressa.
2. Definir política de taxas, responsabilidade, reembolso, retenção e repasse com o contrato aplicável. Confirmar cartão, Pix e boleto por modalidade.
3. Desenhar ledger/RLS, vínculo transacional entre reserva e pagamento, fila/webhooks e migração com backup e restauração testados.
4. Implementar adaptador server-side desativado por padrão e testes de falhas, duplicidade, concorrência, pagamentos atrasados e estornos; depois testar sandbox oficial.
5. Homologar fluxos autenticados, reconciliação e operação por perfil antes de qualquer ativação de cobrança real.

Referências oficiais: https://docs.pagar.me/reference/split-1 ; https://docs.pagar.me/reference/pix-2 ; https://docs.pagar.me/reference/criar-pedido-2 ; https://docs.pagar.me/docs/o-que-%C3%A9 .
