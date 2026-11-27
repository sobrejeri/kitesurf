# Idempotência de pedidos públicos da escola

Proposta para o próximo incremento da vitrine. Ainda não implementada: não há migration, RPC nova ou ativação nesta entrega. A guarda de interface da PR #401 bloqueia cliques sobrepostos, mas não resolve repetição após recarga, perda de resposta ou chamadas diretas à API.

## Comportamento atual

A RPC `create_public_order` gera um token novo e um pedido novo em cada chamada aceita. A trava por telefone serializa o limite de pedidos; ela permite pedidos repetidos até atingir esse limite. O token atual autoriza leitura e cancelamento; só o hash fica no banco. Não existe chave de tentativa de criação.

## Identidade da tentativa e segredo de acesso

Antes do primeiro envio, o navegador deve gerar e persistir na sessão dois valores independentes com APIs criptográficas: um identificador de tentativa e um segredo de acesso de pelo menos 256 bits. A chave de tentativa jamais autoriza leitura, cancelamento ou recuperação de conteúdo. Não usar telefone, número do pedido, horário, contador, `Math.random` ou o próprio identificador de tentativa como segredo.

O segredo será a capacidade do pedido. O navegador o envia na criação; o banco guarda somente seu hash na linha do pedido e no vínculo da tentativa. Na repetição, o cliente reapresenta o mesmo segredo; depois da conferência, a resposta pode devolvê-lo sem armazenar o valor em claro. Isso preserva a possibilidade de recuperar o link após uma resposta perdida.

Persistir ambos antes do envio, separados por escola e tentativa. Manter os valores em caso de falha de rede; limpar após navegação bem-sucedida ou encerramento explicitamente conhecido. Não colocá-los em telemetria, logs, mensagem de erro ou chave de cache pública. O token de acesso pode aparecer apenas no link privado de acompanhamento existente, com as proteções de privacidade já adotadas.

## Invariantes de banco

- Uma tabela restrita liga escola, hash da tentativa, hash do segredo, identidade autenticada original (ou visitante), fingerprint do pedido e `order_id`. Não armazenar nome/telefone adicionais, segredo em claro ou dados de cartão nessa tabela.
- Índice único em `(company_id, request_hash)` é a autoridade contra duplicidade. Tabela com RLS e sem SELECT/INSERT/UPDATE/DELETE para anon ou authenticated; acesso apenas pela RPC verificada.
- Repetição só retorna o pedido quando escola, segredo, identidade e fingerprint correspondem à primeira tentativa. Chave conhecida sozinha não revela sequer o número do pedido.
- O fingerprint é produzido no servidor com versão explícita e JSON canônico das escolhas efetivas: escola resolvida, nome normalizado, telefone normalizado, itens e quantidades, cupom, afiliado efetivo e identidade original. Não aceitar hash calculado pelo navegador.
- Mudança de payload sob a mesma tentativa é conflito genérico, sem criar outro pedido. A identificação de afiliado/cupom é congelada na primeira tentativa; não recalcular silenciosamente durante replay se o cookie ou sessão mudou.
- Autenticação posterior não transfere pedido visitante a uma conta. Se a identidade mudou, o replay de criação falha; o acompanhamento pelo segredo original continua seguindo a autorização já existente, sem reatribuir o proprietário.
- Pedidos repetidos devolvem o número e o total congelados originalmente; preços novos não alteram o pedido já criado. Split, cupom, preço e comissão continuam calculados exclusivamente por `company_place_order`.

## Transação e limites

A RPC nova deve validar formato, localizar a escola e travar a tentativa antes de decidir entre replay e criação. O vínculo idempotente e a criação de pedido devem ocorrer na mesma transação, com ordem de locks estável e índice único como defesa adicional. A função interna existente continua sendo o único núcleo de criação e cálculo.

Replay válido consulta o vínculo antes dos limites de criação e não consome novamente quota, cupom, estoque ou número de pedido. Uma tentativa nova continua sujeita aos limites atuais por telefone/escola. Retornos inválidos não revelam se a tentativa existe. Não manter transação aberta durante chamada a provedor; esta idempotência trata o pedido da vitrine e é independente da idempotência do futuro checkout.

## Expiração e retenção

Proposta inicial: janela de recuperação de 24 horas, sujeita à duração e retenção dos pedidos. Ao expirar, a mesma chave deve falhar de forma genérica; nunca apagar o vínculo e recriar automaticamente um pedido com a chave antiga. Manter tombstone sem dados adicionais enquanto o pedido ou sua retenção exigirem prevenção de replay. Uma nova tentativa precisa ser uma decisão explícita após conferir o resultado anterior. O vencimento da janela não é cancelamento do pedido nem prova de ausência de pagamento.

## Testes obrigatórios antes de integração

1. Oito conexões com a mesma escola, tentativa, segredo, identidade e payload produzem um pedido, um uso de cupom e uma resposta equivalente; os totais conservam o snapshot.
2. Uma resposta perdida seguida de replay retorna o mesmo pedido e link privado; nenhum token em claro aparece em tabelas, auditoria ou logs.
3. Mesma chave com itens, quantidade, telefone, cupom, afiliado, escola ou identidade divergentes falha sem alterar o pedido original.
4. Chave correta com segredo ausente ou errado, chave adivinhada, visitante diferente e conta diferente recebem erro genérico sem número, total ou indicação de existência.
5. Replay legítimo funciona mesmo após o limite de pedidos novos ser atingido; nova tentativa continua sujeita a quota. Falha do núcleo de criação reverte o vínculo, sem deixar tentativa presa nem permitir criação parcial.
6. Alteração de preço/cupom após a primeira criação não recalcula replay. Troca de login não reatribui o pedido. TTL vencido/tombstone não permite recriação com a mesma chave.
7. Envios por UI, retorno de sessão, falha de storage do navegador e duas abas exercitam a mesma regra. Não enviar se os identificadores não puderem ser preservados para recuperar um resultado incerto; explicar a falha antes de qualquer escrita.
8. Anon/authenticated não consultam a tabela diretamente; RPCs internas continuam revogadas. Não mudar o fluxo de token de leitura/cancelamento de pedidos antigos.

A implementação exige migration nova e versão de RPC explícita, revisão de RLS/token e testes em banco descartável antes de qualquer DDL remoto. A API antiga deve ter uma estratégia de compatibilidade e desativação documentada; manter a rota antiga pública permite criação sem chave, portanto a garantia de idempotência só cobre chamadas à versão nova até sua retirada.
