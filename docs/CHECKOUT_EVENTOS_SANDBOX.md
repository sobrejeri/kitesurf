# VentoKite — eventos de checkout offline

`src/lib/checkout-event-replay.ts` é um **simulador puro**: rejeita transições regressivas, registra IDs de eventos já processados e ignora repetição do mesmo evento. Os testes cobrem pendente → aprovado → reembolsado, duplicação, evento atrasado e identificador inválido.

**Não é um webhook nem mecanismo financeiro em produção.** A lista de IDs em memória não substitui índice UNIQUE no PostgreSQL, transação atômica, autenticação de eventos, comparação com a API oficial, ownership da reserva, trilha de auditoria, nem conciliação. Não enviar dados de cartão para o aplicativo. Checkout real e repasses seguem OFF. Próxima etapa exige confirmar contrato oficial do gateway e projetar tabela de tentativas/eventos com migração revisada, sem aplicar DDL em produção.
