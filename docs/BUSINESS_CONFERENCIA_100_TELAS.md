# Business: conferência das 100 telas (15/11/2026)

Conferência número por número da lista do prompt mestre contra as rotas em `src/app/admin/business/`. Todas as rotas são prefixadas por `/admin/business`. Tudo é **demonstrativo** (dados em `src/lib/business/demo.ts`; nada grava e nenhum pagamento é real).

**Resultado:** nenhuma das 100 telas está faltando. **84** têm página própria e **16** ficaram juntas com outra tela, sempre com a função presente. Os números das telas juntas: 7, 23, 32, 33, 50, 51, 52, 53, 59, 91, 92, 93, 94, 95, 96, 98.

Esta conferência é de existência e função. Não prova que o comportamento é completo: nenhuma tela está ligada ao banco, e a verificação em navegador cobriu o que cada bloco declarou (ver os PRs).

| Nº | Tela | Situação | Rota | Observação |
|---|---|---|---|---|
| 1 | Cadastro de empresa | Tela própria | `/empresa/cadastro` |  |
| 2 | Perfil e configurações da empresa | Tela própria | `/empresa` |  |
| 3 | Dashboard empresarial | Tela própria | `/` |  |
| 4 | Cadastro de unidades | Tela própria | `/unidades/nova` |  |
| 5 | Listagem de unidades | Tela própria | `/unidades` |  |
| 6 | Detalhes e configurações de cada unidade | Tela própria | `/unidades/[id]` |  |
| 7 | Seleção de cidade e unidade | Junto com outra tela | `seletor no cabeçalho de todas as telas` | cidade e unidade na URL, sem página própria |
| 8 | Visão consolidada da empresa | Tela própria | `/consolidado` |  |
| 9 | Listagem de funcionários | Tela própria | `/funcionarios` |  |
| 10 | Cadastro e convite de funcionários | Tela própria | `/funcionarios/convidar` |  |
| 11 | Perfil do funcionário | Tela própria | `/funcionarios/[id]` |  |
| 12 | Configuração de cargos | Tela própria | `/cargos` |  |
| 13 | Matriz de permissões | Tela própria | `/permissoes` |  |
| 14 | Vínculos entre funcionários e unidades | Tela própria | `/funcionarios/vinculos` |  |
| 15 | Histórico de ações e auditoria | Tela própria | `/auditoria` |  |
| 16 | Instrutores vinculados | Tela própria | `/instrutores` |  |
| 17 | Convidar instrutor | Tela própria | `/instrutores/convidar` |  |
| 18 | Aceitar ou recusar vínculo | Tela própria | `/instrutores/vinculo` |  |
| 19 | Perfil profissional do instrutor | Tela própria | `/instrutores/[id]` |  |
| 20 | Configurar comissão individual | Tela própria | `/instrutores/[id]/comissao` |  |
| 21 | Disponibilidade e horários | Tela própria | `/instrutores/disponibilidade` |  |
| 22 | Agenda geral da empresa | Tela própria | `/agenda` |  |
| 23 | Agenda por unidade | Junto com outra tela | `/agenda` | mesma página, com o filtro de unidade |
| 24 | Distribuição de aulas | Tela própria | `/instrutores/distribuicao` |  |
| 25 | Fila interna de instrutores | Tela própria | `/instrutores/fila` |  |
| 26 | Histórico de aulas | Tela própria | `/instrutores/historico` |  |
| 27 | Relatório de desempenho | Tela própria | `/instrutores/desempenho` |  |
| 28 | Catálogo de serviços | Tela própria | `/servicos` |  |
| 29 | Cadastro de serviço | Tela própria | `/servicos/novo` |  |
| 30 | Configuração de serviço por unidade | Tela própria | `/servicos/[id]` |  |
| 31 | Preços por cidade e unidade | Tela própria | `/precos` |  |
| 32 | Duração e capacidade | Junto com outra tela | `/servicos/novo e /servicos/[id]` | duração e capacidade são campos do cadastro e do detalhe do serviço |
| 33 | Disponibilidade | Junto com outra tela | `/servicos/[id]` | dias da semana e instrutores por unidade ficam na configuração do serviço |
| 34 | Pacotes e promoções | Tela própria | `/pacotes` |  |
| 35 | Dashboard da lojinha | Tela própria | `/lojinha` |  |
| 36 | Personalização da loja | Tela própria | `/lojinha/personalizar` |  |
| 37 | Página pública da escola | Tela própria | `/lojinha/vitrine` |  |
| 38 | Catálogo público | Tela própria | `/lojinha/vitrine/catalogo` |  |
| 39 | Detalhes de aulas e serviços | Tela própria | `/lojinha/vitrine/aulas/[id]` |  |
| 40 | Detalhes de produtos | Tela própria | `/lojinha/vitrine/produtos/[id]` |  |
| 41 | Aluguel de equipamentos | Tela própria | `/lojinha/vitrine/alugueis` |  |
| 42 | Carrinho | Tela própria | `/lojinha/vitrine/carrinho` |  |
| 43 | Resumo do pedido | Tela própria | `/lojinha/vitrine/resumo` |  |
| 44 | Pedidos recebidos | Tela própria | `/lojinha/pedidos` |  |
| 45 | Detalhes do pedido | Tela própria | `/lojinha/pedidos/[id]` |  |
| 46 | Cupons e promoções | Tela própria | `/lojinha/cupons` |  |
| 47 | Dashboard do caixa | Tela própria | `/caixa` |  |
| 48 | Abertura de caixa | Tela própria | `/caixa/abrir` |  |
| 49 | Movimentações | Tela própria | `/caixa/movimentacoes` |  |
| 50 | Vendas presenciais | Junto com outra tela | `/caixa/movimentacoes/nova` | um formulário com o tipo "venda presencial" |
| 51 | Sangrias e suprimentos | Junto com outra tela | `/caixa/movimentacoes/nova` | o mesmo formulário, tipos "sangria" e "suprimento" |
| 52 | Despesas | Junto com outra tela | `/caixa/movimentacoes/nova` | o mesmo formulário, tipo "despesa" (a lista está em /caixa/movimentacoes) |
| 53 | Conferência de caixa | Junto com outra tela | `/caixa/fechar` | conferência e fechamento na mesma página |
| 54 | Fechamento | Tela própria | `/caixa/fechar` |  |
| 55 | Histórico de fechamentos | Tela própria | `/caixa/fechamentos` |  |
| 56 | Detalhes do fechamento | Tela própria | `/caixa/fechamentos/[id]` |  |
| 57 | Configurações de caixa | Tela própria | `/caixa/configuracoes` |  |
| 58 | Central de relatórios | Tela própria | `/relatorios` |  |
| 59 | Configuração de impressora térmica | Junto com outra tela | `/caixa/configuracoes` | impressora e largura do papel ficam nas configurações do caixa |
| 60 | Prévia de impressão | Tela própria | `/caixa/comprovantes` |  |
| 61 | Dashboard financeiro | Tela própria | `/financeiro` |  |
| 62 | Receitas | Tela própria | `/financeiro/receitas` |  |
| 63 | Despesas | Tela própria | `/financeiro/despesas` |  |
| 64 | Contas a receber | Tela própria | `/financeiro/receber` |  |
| 65 | Contas a pagar | Tela própria | `/financeiro/pagar` |  |
| 66 | Comissões de instrutores | Tela própria | `/financeiro/comissoes` |  |
| 67 | Pagamentos externos | Tela própria | `/financeiro/pagamentos` |  |
| 68 | Fechamento financeiro por período | Tela própria | `/financeiro/fechamento` |  |
| 69 | Relatórios por funcionário | Tela própria | `/financeiro/relatorios/funcionarios` |  |
| 70 | Relatórios por unidade | Tela própria | `/financeiro/relatorios/unidades` |  |
| 71 | Relatório consolidado da empresa | Tela própria | `/financeiro/relatorios/consolidado` |  |
| 72 | Histórico de comprovantes | Tela própria | `/financeiro/comprovantes` |  |
| 73 | Central de afiliados da empresa | Tela própria | `/afiliados` |  |
| 74 | Campanhas disponíveis | Tela própria | `/afiliados/campanhas` |  |
| 75 | Seleção de produtos e serviços para divulgação | Tela própria | `/afiliados/selecao` |  |
| 76 | Configuração de comissões | Tela própria | `/afiliados/comissoes` |  |
| 77 | Solicitações de afiliação | Tela própria | `/afiliados/solicitacoes` |  |
| 78 | Afiliados vinculados | Tela própria | `/afiliados/vinculados` |  |
| 79 | Relatórios de vendas atribuídas | Tela própria | `/afiliados/relatorios` |  |
| 80 | Histórico de comissões | Tela própria | `/afiliados/historico` |  |
| 81 | Dashboard de estoque | Tela própria | `/estoque` |  |
| 82 | Cadastro de produtos | Tela própria | `/estoque/produtos/novo` |  |
| 83 | Cadastro de equipamentos | Tela própria | `/estoque/equipamentos/novo` |  |
| 84 | Estoque por unidade | Tela própria | `/estoque/unidades` |  |
| 85 | Movimentações | Tela própria | `/estoque/movimentacoes` |  |
| 86 | Transferência entre unidades | Tela própria | `/estoque/transferencias` |  |
| 87 | Aluguéis ativos | Tela própria | `/estoque/alugueis` |  |
| 88 | Devoluções | Tela própria | `/estoque/devolucoes` |  |
| 89 | Manutenção de equipamentos | Tela própria | `/estoque/manutencao` |  |
| 90 | Histórico e relatórios | Tela própria | `/estoque/relatorios` |  |
| 91 | Criar reserva manual | Junto com outra tela | `/reservas/nova` | assistente numa só página |
| 92 | Selecionar unidade | Junto com outra tela | `/reservas/nova` | campo "unidade" do assistente |
| 93 | Selecionar serviço | Junto com outra tela | `/reservas/nova` | campo "serviço" do assistente |
| 94 | Selecionar instrutor | Junto com outra tela | `/reservas/nova` | campo "instrutor" do assistente |
| 95 | Selecionar data e duração | Junto com outra tela | `/reservas/nova` | campos "dia" e "horário" do assistente (a duração vem do serviço) |
| 96 | Confirmar reserva | Junto com outra tela | `/reservas/nova` | botão de confirmar do mesmo assistente |
| 97 | Detalhes da reserva | Tela própria | `/reservas/[id]` |  |
| 98 | Alteração e cancelamento | Junto com outra tela | `/reservas/[id] e /reservas/nova?alterar` | alterar data e horário e cancelar com motivo |
| 99 | Histórico de reservas externas | Tela própria | `/reservas` |  |
| 100 | Comprovante da reserva | Tela própria | `/reservas/[id]/comprovante` |  |

## Fora da lista de 100, mas pedido no mesmo prompt e ainda não feito
- Tela do instrutor para confirmar o recebimento de pagamento externo.
- Envio de comprovantes (anexo) e impressão térmica direta (hoje só a prévia do papel).
- Página pública real da escola (hoje é só a prévia dentro do Admin).
- Pagamento integrado de comissões (depende da função financeira homologada).
