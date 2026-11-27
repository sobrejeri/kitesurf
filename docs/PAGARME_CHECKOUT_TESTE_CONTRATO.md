# Checkout por API Pagar.me em ambiente de teste

Preparação offline para pedidos Pix e cartão de crédito pela API V5 com divisão em valores inteiros. Não cria pedidos, não acessa a Pagar.me, não confirma reservas nem faz repasses. A integração ainda não está pronta para uso.

Somente `sk_test_` é aceita no contrato. A referência de autenticação informa o mesmo endpoint de pedidos para produção e teste, com ambiente identificado pela chave. Confirmar com a Pagar.me o endpoint específico da conta antes de habilitar transporte. Chaves reais não são aceitas por este contrato. A chave nunca deve sair do servidor.

Reserva, preço, cliente, recebedores e responsabilidades de taxas devem vir de snapshot autorizado e imutável no servidor. A soma do split precisa corresponder ao valor do pedido. Os exemplos não são decisões de comissão ou taxas. Conta e recebedores de teste precisam ser do VentoKite; não usar os da Turiva sem decisão explícita. O pagamento externo de escola a instrutor permanece manual e separado.

Cartão: apenas `card_id` tokenizado é aceito no contrato; o VentoKite não deve receber número, CVV ou validade. A documentação recomenda `card_id` para cliente PSP, enquanto `card_token` na criação do pedido é para clientes Gateway. Confirmar modalidade e fluxo de tokenização da conta antes de implementar os campos de cartão.

Pix: o contrato prepara prazo de 30 minutos; o simulador oficial informa que não funciona com Split. Confirmar como homologar Pix com split sem dinheiro real com o Pagar.me. Resposta imediata, retorno do navegador ou QR Code não provam pagamento.

Faltam persistência isolada de tentativas, idempotência e concorrência, tratamento de resposta incerta, conciliação com o provedor, autenticação de eventos, estornos e testes autenticados. A conciliação offline incluída na PR não é webhook nem prova de pagamento.

A proposta de tabela `pagarme_test_attempts` não expõe escrita a usuários e não altera reservas. O índice impede novas tentativas para reservas com resultado pendente, desconhecido, aprovado ou reembolsado. Antes de ligar qualquer escrita ou transporte é necessário isolar o banco de testes ou provar que as reservas e recebedores são exclusivamente de teste; este esquema sozinho não distingue uma reserva real de uma fictícia. O estado de teste não é prova de transação no Pagar.me.

O módulo de transporte preparado é exclusivo do servidor e exige transporte injetado explicitamente; nenhuma rota o chama. Usa chave de teste, correlação de reserva/cliente/valor e a chave idempotente da tentativa persistida. Falha de rede, resposta não reconhecida ou erro HTTP produz resultado desconhecido sem repetição automática. Mesmo uma observação de pedido pago ainda exige conciliação e persistência antes de qualquer efeito. Os testes usam somente respostas simuladas.

Referências: https://docs.pagar.me/reference/criar-pedido-2 ; https://docs.pagar.me/reference/pix-2 ; https://docs.pagar.me/reference/split-1 ; https://docs.pagar.me/docs/simulador-pix ; https://docs.pagar.me/reference/autentica%C3%A7%C3%A3o-2
