# Checkout Pagar.me em ambiente de teste

Esta etapa prepara somente o contrato offline para um link de pagamento com cartão, documentado na API V5. Não cria pedidos, não acessa a Pagar.me, não faz cobrança, não persiste estados e não altera reservas ou repasses. A integração ainda não está pronta para uso.

A criação de um link precisa usar a chave `sk_test_` somente no servidor e o endpoint de teste documentado para paymentlinks. Credenciais reais são recusadas pelo contrato. O valor e a reserva devem vir de um snapshot autorizado e imutável no servidor, nunca do navegador. `order_code` é uma correlação e não substitui idempotência ou validação de propriedade. Um link ou retorno do navegador não confirma pagamento.

Antes da conexão real ao sandbox, implementar persistência isolada para tentativas de teste, proteção de concorrência e duplicidade, reconciliação de respostas incertas, verificação autenticada dos eventos e vínculo seguro com a reserva. Não reutilizar uma credencial da Turiva sem decisão explícita. Não guardar nem coletar dados de cartão no VentoKite. Ativar somente em ambiente segregado, com transações e usuários de teste claramente identificados.

O contrato prepara cartão em uma parcela. Pix e boleto exigem configurações específicas. A documentação do Pagar.me informa que o split em links de pagamento se aplica a cartão de crédito ou carteiras digitais, não a Pix ou boleto; confirmar a modalidade e a integração antes de definir repasses. Pagamentos externos de escola a instrutor continuam sendo registros separados e manuais.

Referências: https://docs.pagar.me/reference/criar-link ; https://docs.pagar.me/reference/checkout-link ; https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2
