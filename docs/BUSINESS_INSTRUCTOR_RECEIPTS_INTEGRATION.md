# Homologação de recebimentos e comprovantes do instrutor

Esta branch reúne a confirmação de recebimentos da PR #392, o armazenamento e download privados da PR #394 e o limite do corpo multipart da PR #397. A lista do instrutor usa o componente de download com a sessão da área `instrutor`, depois de verificar titularidade e vínculo da escola.

As opções `NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED` e `NEXT_PUBLIC_VENTO_BUSINESS_RECEIPTS_ENABLED` permanecem desligadas por padrão. A primeira libera a lista e a confirmação; o link só aparece quando ambas estão ativas. Estas flags não substituem RLS e autorização de cada requisição. O link não garante que a escola já enviou um arquivo; a rota verifica novamente a autorização e a existência do comprovante.

Testes locais usam dados simulados e cobrem flags desligadas, titularidade divergente, escola divergente e URL com sessão `instrutor`; os testes da rota verificam a sessão efetiva e o acesso antes do download. Não há ativação, migração remota ou transferência de dinheiro nesta integração.

Antes de publicar: revisar as dependências do Business, instalar e homologar a base em ambiente adequado, validar contas autenticadas e o Storage real, concluir a área da escola e o procedimento de correção de comprovante. A confirmação de recebimento externo não equivale a pagamento ou repasse pela plataforma.
