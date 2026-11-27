# Business — primeiro bloco de dados reais

Este bloco é filho da PR #297, HEAD-base `80352e8137a25c51f970ab5fda84022dc32e9c0e`. Não publica nem aplica a pilha. A flag `NEXT_PUBLIC_VENTO_BUSINESS_CORE_ENABLED=false` é o padrão de build.

## Rotas e autenticação

- `/aluno/empresa`, `/instrutor/empresa` e `/afiliado/empresa`: usam a sessão já isolada de cada app. O papel do app não concede propriedade nem vínculo com empresa.
- `/admin/empresas`: supervisão somente com Admin e AAL2, tanto na página quanto no DAL e na RLS existente.
- `/admin/business`: continua sendo a demonstração anterior, sem transformar seus formulários/constantes em autorização real.

O DAL usa o cliente Supabase autenticado/RLS da área atual; não usa service_role ou metadados editáveis do usuário. Proprietário é derivado exclusivamente de `companies.owner_id`. Membro depende de `company_members.user_id` e status ativo; unidades e cargos vêm dos vínculos desse membro na mesma empresa. O DTO não retorna CNPJ, contatos ou IDs de outras contas. Não cria cargo `owner` no enum; esse rótulo é derivado da propriedade.

As consultas de empresas aplicam owner ou IDs dos vínculos antes do limite; a RLS atual não libera tabelas de empresas públicas pela vitrine. Consultas de vínculos/unidades usam lotes de 100 IDs. Qualquer lote saturado (1.000 vínculos ou unidades), 201 empresas próprias/Admin ou mais de 200 empresas visíveis mantém o aviso de lista parcial, inclusive quando a filtragem defensiva elimina todas as linhas. Não há paginação completa nesta etapa.

Sem a flag, não há leitura adicional nem ação de cadastro. Com schema ausente ou leitura recusada, o fluxo fica indisponível, sem cair em dados demonstrativos e sem instrução técnica de instalar migrations na tela.

## Cadastro: o que é persistido

O formulário real contém somente razão social, nome fantasia e CNPJ, correspondentes aos três argumentos de `create_company`. O banco deriva o responsável da sessão e inicia a empresa em análise. A ação recusa campos extras, duplicados, dono/status/cargo forjados e contas Admin. Não aceita nem afirma salvar telefone, e-mail, cidade, termos, unidade ou dados bancários — esses campos continuam fora desta etapa.

Só retorna sucesso após ler de volta a empresa pelo ID retornado e pelo owner da sessão, conferindo os três valores. Resposta ambígua ou leitura divergente não gera sucesso nem retry automático; a pessoa deve consultar a lista antes de tentar novamente. Aprovação, criação de unidade, convites e permissões operacionais permanecem próximos blocos, com RPCs próprias e auditoria. Nenhum pagamento é disparado.

## Dependências e aplicação futura

Pilha: **este bloco → #297 (vitrine/fase 7) → #293 (correções de revisão) → #291 → #290 → #289 → #287 → #284 → #275**. A #293 corrige convites com e-mail confirmado, fim da reserva presencial e rateio do cupom; não usar versões anteriores dessas fases sem as correções.

| Fase | Migration oficial do repositório | Necessidade |
|---|---|---|
| 1 | `20261115120000_business_company_core.sql` | Empresas, unidades, membros e vínculos: necessária para este bloco |
| 2 | `20261115130000_business_services_bookings.sql` | Serviços/reservas presenciais; altera `instructor_can_attend`, exige conciliação do corpo real |
| 3 | `20261115140000_business_stock_rentals.sql` | Estoque, equipamentos e aluguel |
| 4 | `20261115150000_business_cash.sql` | Caixa e bucket privado de fechamentos |
| 5 | `20261115160000_business_shop_affiliates.sql` | Loja, cupons, pedidos e afiliados |
| 6 | `20261115170000_business_finance.sql` | Registros financeiros/acertos externos, sem transferências automáticas |
| 7 | `20261116100000_business_public_store.sql` | Vitrine e seis RPCs anônimas; necessária para as rotas públicas existentes na #297 |

Antes de considerar qualquer aplicação no Kitesurf real: conferir projeto, baseline/ledger e hashes, funções das migrations 47/48 (CPF/CNPJ e Admin AAL2), confirmação de e-mail, dependências e recuperação conforme decisão do responsável. A lista acima não é autorização para executar DDL e não prova compatibilidade com o schema gerenciado. Não aplicar no Turiva, não usar `db push` cego e não instalar fases em lote sobre histórico divergente.

O primeiro bloco poderia ser ensaiado com a fase 1 em destino isolado. Porém, a #297 contém também rotas públicas reais sem este gate de empresas: **não liberar a pilha inteira sobre um banco sem as fases necessárias à vitrine**. Sua integração em produção requer conciliação separada e testes autenticados; a flag deste bloco não protege todas as outras rotas da #297.

## Evidências e limites

`scripts/test-business-core-data.mjs` executa o DAL, a ação e o componente reais com mocks de RLS que devolvem inclusive linhas alheias: confirma defesa adicional de owner/membro/unidade, Admin AAL2, projeção mínima, flag/schema, campos forjados e ausência de sucesso sem persistência confirmada. São mocks, não Auth/HTTP real.

As suítes SQL da pilha e o preflight consolidado verificam os objetos e regras em PostgreSQL descartável. O preflight da fase 7 cobre 45 tabelas, 114 funções e 27 gatilhos, incluindo recusa de replica-only e search_path inseguro; não substitui a homologação real por papel, Storage e dispositivo. Nenhum schema remoto foi alterado nesta etapa.
