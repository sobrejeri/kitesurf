# Valores por nível

A migração `20261104000036_level_hourly_prices.sql` acrescenta valores independentes para Iniciante, Intermediário e Avançado em Admin → Regras da operação.

- Não altera reservas nem versões de preço existentes. Até uma nova publicação, os três níveis usam o valor vigente.
- O administrador informa os três valores, comissão global, transporte e motivo. Cada publicação cria uma versão auditada. Uma sessão com preços desatualizados precisa recarregar antes de publicar.
- Explorar e Monte sua aula consultam a tabela de estimativas calculada pelo banco e selecionam a linha do nível escolhido.
- O banco calcula o preço de cada nova reserva a partir do nível contratado e da versão vinculada à busca. Isso também funciona no aceite do instrutor, com indicação de pousada e comissão individual.
- O transporte continua separado e vai integralmente ao instrutor.
- Atualizar a avaliação do aluno não recalcula o preço de aulas já contratadas.
- Checkout continua desativado.

Instalação: aplique a migração 36 uma vez no SQL Editor do Supabase. As migrações 34 e 35 permanecem necessárias para as funcionalidades anteriores. Antes da 36, o app mantém o preço comum e bloqueia a publicação por nível, indicando a atualização pendente.

Validação local: TypeScript, ESLint, build e scripts JavaScript passaram. As 36 migrações e 31 arquivos de testes SQL passaram em PostgreSQL isolado via PGlite; os testes incluem publicação somente por administrador, dados inválidos, sessão desatualizada, estimativas públicas, reserva direta nos três níveis, aceite com versão anterior, transporte, comissões e imutabilidade. A aplicação em produção depende da execução da migração no Supabase pelo proprietário.

Ajuste de layout desktop: seletor de nível em lista, data compacta, distribuição dos campos de busca, botão em uma linha e faixa separada para a estimativa. Os controles por nível no celular continuam disponíveis.
