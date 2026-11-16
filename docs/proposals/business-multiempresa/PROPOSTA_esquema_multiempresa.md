# VentoKite Business: proposta de esquema multiempresa (para revisão)

**Situação:** decisões 1 a 9 aprovadas pelo responsável em 15/11/2026 (a 7, e-mail confirmado no Supabase, segue **a confirmar**). O SQL foi promovido para `supabase/migrations/20261115120000_business_company_core.sql` em PR draft e **não foi aplicado em nenhum projeto Supabase**. A reversão está em `REVERSAO_fase1.sql`. O SQL está em `PROPOSTA_fase1_empresa_equipe_instrutores.sql` e foi validado num PostgreSQL descartável (ver "Como foi validado").

Hoje todo o módulo Business é demonstrativo (`src/lib/business/demo.ts`). Este documento propõe o banco que o torna real, **em fases**, começando pelas telas dos blocos 1, 2 e 3 (empresa, equipe e instrutores). As regras já existem em funções puras testadas (`rules.ts`, `company.ts`, `instructors.ts`…), então trocar o demonstrativo pelo banco não muda as telas.

## O que não muda

- Dinheiro em centavos inteiros; percentuais em pontos-base; datas no fuso de Fortaleza.
- Toda escrita por função `SECURITY DEFINER` que confere papel e dono; as tabelas não dão INSERT, UPDATE nem DELETE ao cliente.
- RLS em todas as tabelas. Ler por id não é permissão.
- Administrador da plataforma nunca nasce de cadastro, convite ou vínculo.
- Auditoria append-only. App só com `NEXT_PUBLIC_*`; nada de `service_role`.
- Migration aplicada não se edita: a fase 1 seria a próxima migration (número a definir na hora de aplicar).
- Não toca em reservas, preços, filas, pagamentos, checkout, migrations 39–42 nem no Protege 3B.

## Decisões que preciso de você

Cada uma tem a minha recomendação. Se concordar com todas, basta dizer "aprovado".

1. **Como alguém entra no Business.** Recomendo **vínculo (`company_members`), sem novo papel global**. A conta continua aluno, instrutor ou afiliado; ter acesso ao Business vem de ser dono ou membro ativo de uma empresa. Assim não mexemos no enum `app_role` e nunca existe caminho para "virar admin".
2. **Aprovação.** A empresa nasce **pendente** e só opera depois que o Admin (com segundo fator) aprova, com motivo, registrado na auditoria. Recomendo manter, igual ao que fazemos com instrutores e afiliados (CNPJ conferido na aprovação).
3. **Proprietário.** É `companies.owner_id`, definido só na criação. O cargo "Proprietário" **não existe como valor atribuível** (o enum `company_role` só tem gerente, financeiro e atendente), então convite ou vínculo não conseguem criá-lo nem por engano. Troca de proprietário fica fora desta fase e seria um fluxo do Admin.
4. **Cargos.** Fase 1 usa os quatro cargos iniciais (as permissões saem de uma tabela somente leitura) mais exceções por pessoa e unidade. **Cargos personalizados** (a tela "Cargos" já tem o formulário) ficam para uma fase seguinte. Recomendo adiar para não crescer a superfície de segurança agora.
5. **Quem pode conceder permissão.** Quem tem `perm.edit` numa unidade pode conceder permissões **não sensíveis** nessa unidade (inclusive a si mesmo, sem ganho real, pois só vale o que o cargo já permitiria ou o que é comum). **Permissões sensíveis só o Proprietário concede.** Se preferir que só o Proprietário conceda qualquer coisa, é uma linha a mudar.
6. **Leitura pela administração.** O Admin com segundo fator **lê** as tabelas das empresas (suporte, auditoria) e nunca escreve nelas, a não ser pela aprovação da empresa. Recomendo manter. Alternativa: nenhuma leitura de dados de empresa pelo Admin.
7. **Convite por e-mail.** O convidado responde pela própria conta. O banco exige que o e-mail da conta esteja confirmado e seja igual ao do convite (minúsculas) para o convidado consultar, aceitar ou recusar. O roteiro também verifica a opção **Confirm email** na configuração do projeto Supabase.
8. **Expiração de convites.** Convite vence em 14 dias; a função de aceite já recusa vencidos. Marcar como "expirado" no banco exige uma rotina agendada, a mesma pendência do `pg_cron` que já está na lista (solicitações de troca e de saldo). Recomendo decidir as duas juntas.
9. **Instrutor e escola.** O vínculo do instrutor com a escola é uma tabela própria; **suspender ali não altera `instructors.status`** nem outras escolas (testado). A fila única do VentoKite continua global.

## O que a fase 1 cria

Tabelas (todas com RLS, só leitura para o cliente): `companies`, `company_units`, `company_members`, `company_member_units`, `company_member_overrides`, `company_invitations`, `company_invitation_units`, `company_instructor_links`, `company_instructor_units`, `company_instructor_rates`, `company_audit_logs`, mais o catálogo `company_permissions` e `company_role_permissions`.

Funções de escrita (únicas portas): `create_company`, `admin_set_company_status`, `create_unit`, `update_unit`, `invite_staff`, `invite_instructor`, `accept_company_invitation`, `decline_company_invitation`, `set_member_unit_role`, `set_member_override`, `set_instructor_link_status`, `set_instructor_rate`.

Funções internas sem EXECUTE para o cliente: `company_audit`, `require_company_permission`.

### Mapa das telas atuais para o banco

| Tela (demonstrativa) | Banco |
|---|---|
| Cadastro de empresa (1) | `create_company` (CNPJ numérico e alfanumérico validado; pendente) |
| Perfil e configurações (2) | leitura de `companies`; troca de CNPJ/proprietário só pelo Admin |
| Unidades (4–6) | `create_unit`, `update_unit`; desativar só o Proprietário |
| Seleção de cidade e unidade (7), visão consolidada (8) | `company_unit_ids()`: cada pessoa só enxerga as unidades em que está ligada |
| Funcionários, convite, perfil, vínculos (9–11, 14) | `invite_staff`, `accept_company_invitation`, `set_member_unit_role` |
| Matriz e exceções (12–13) | catálogo + `company_member_overrides` via `set_member_override` |
| Auditoria (15) | `company_audit_logs`, lida só com `perm.edit` (ou Admin) |
| Instrutores, convidar, aceitar/recusar (16–18) | `invite_instructor`, `accept/decline_company_invitation` |
| Comissão individual (20) | `set_instructor_rate`: versão nova a partir de hoje, índice único por dia, trigger impede UPDATE/DELETE |
| Suspensão de vínculo | `set_instructor_link_status` (só o vínculo) |

## Garantias testadas

O teste (`PROPOSTA_fase1.test.sql`, 15 cenários mais checagens de catálogo) cobre, entre outras:

- Empresa de outra escola não vê unidades, equipe, convites, vínculos, comissões nem auditoria, e não consegue alterar nada.
- Atendente vê só a unidade em que trabalha; o mesmo gerente é atendente em outra unidade e perde as permissões lá.
- Convite não concede Proprietário, não aceita unidade de outra empresa, não duplica pendente, só o convidado responde, e o Admin da plataforma não entra em empresa.
- Permissão sensível só o Proprietário concede; exceção por unidade não vaza para outra.
- Comissão: segunda alteração no mesmo dia recusada, faixa 10% a 90%, versões nunca editadas nem apagadas.
- Cliente sem INSERT/UPDATE/DELETE; `anon` sem leitura; auditoria não pode ser forjada, editada nem apagada (nem por superusuário); a auditoria nunca guarda CNPJ.
- Toda tabela nova tem RLS e toda função definer tem `search_path` fixo.
- Admin sem segundo fator não aprova nem lê.

## Como foi validado

```bash
runuser -u nobody -- env PG_BIN=/usr/lib/postgresql/16/bin bash docs/proposals/business-multiempresa/rodar-teste.sh
```

Aplica **todas** as migrations reais num PostgreSQL descartável, depois o rascunho, depois o teste. Também fiz **teste de mutação**: enfraqueci de propósito quatro regras (visibilidade de unidades, suspensão que também pausa o instrutor, auditoria sem trigger, permissão sensível sem dono) e o teste falhou em cada uma; com o original, passa.

## Fases seguintes (esboço, sem SQL ainda)

Cada fase repete o padrão obrigatório: coluna `company_id` (e `unit_id` quando for da unidade), política que cruza com `company_unit_ids()`, escrita só por função, teste de isolamento entre empresas e teste de mutação.

2. **Serviços e preços por unidade; reservas presenciais.** Versões de preço por unidade (nova versão, nunca edição); reserva com valores congelados e calculados no banco; divisão por subtração (comissão uma vez, líquido por diferença, com CHECK de soma); conflito de agenda único por instrutor entre unidades e empresas.
   *Disponibilidade unificada sem vazar dados:* uma função definer devolve a outra empresa apenas intervalos "ocupado" (início e fim), nunca cliente, serviço ou unidade.
3. **Estoque e aluguéis.** Razão de movimentações (saldo é soma, nunca negativo, por CHECK ou trigger); transferência como duas linhas na mesma transação; equipamento com situação derivada.
4. **Caixa e fechamento.** Sessões, movimentos e fechamentos; arquivos Excel/PDF em bucket privado do Storage com política por empresa; Pix e cartão só como registro externo.
5. **Lojinha e afiliados da empresa.** Pedidos e cupons sem pagamento simulado; percentual de afiliado versionado (já com `rateAt` testado); comissão nunca "paga".
6. **Financeiro.** Lançamentos, a pagar/receber e pagamentos externos aos instrutores, com confirmação de recebimento pelo instrutor (precisa da tela do instrutor, hoje pendente).

## Plano para aplicar (quando você aprovar)

1. Você aprova as decisões 1 a 9.
2. Eu movo o SQL para `supabase/migrations` com o próximo número e rodo `scripts/test-db.sh` completo (e o teste de catálogo).
3. Abro PR de migration separado do front, em draft, sem aplicar.
4. Você revisa e cola o SQL no editor do Supabase (como nas migrations 47 e 48), **primeiro num projeto de teste**.
5. Só depois a primeira tela (Unidades) troca `demo.ts` pela consulta, atrás de uma flag, mantendo o aviso de demonstração nas outras.

**Reversão** da fase 1 (antes de haver dados): apagar as funções e tabelas na ordem inversa da criação e os tipos `company_*`. Depois de haver dados, a reversão exige exportar antes; não recomendo reverter com dados reais.

## Limites desta proposta

- É só banco. Não há tela real ligada, e e-mails de convite não são enviados (falta o envio).
- Políticas chamam funções por linha; para volumes grandes valem índices e medição. Com a escala atual não é problema, e eu mediria antes da fase 2.
- Não resolve pagamento de comissões, impressão térmica nem armazenamento de comprovantes: continuam decisões suas.
- Não foi aplicada em projeto Supabase real; a validação é em PostgreSQL local com o mesmo stub usado nos testes do repositório.


## Fase 2 (serviços, preços e reservas presenciais): decisões novas

Migration: `supabase/migrations/20261115130000_business_services_bookings.sql`, testes em `supabase/tests/99zzzzzzzzzzzzzz_business_services_bookings.test.sql`, reversão em `REVERSAO_fase2.sql`.

**O que cria:** serviços (duração, capacidade), preços em **versões** por unidade (nova linha, nunca edição), serviço por unidade (dias, local, instrutores), pacotes e reservas presenciais com **valor congelado**, mais as funções de escrita e a consulta de "ocupado".

**Decisões que preciso de você (recomendo aprovar as três):**

10. **Agenda única de verdade.** O fluxo digital e o presencial reservam o horário e o buffer do mesmo instrutor em todas as unidades e empresas. A aula presencial só pode ser concluída a partir do fim contratado. A conclusão mantém o bloqueio pelo buffer, e o cancelamento libera o horário. O teste de agenda compartilhada cobre a janela em curso e os limites do buffer.
11. **Outra empresa só vê "ocupado".** `instructor_busy_intervals` devolve apenas início e fim, de qualquer origem, e só para quem tem vínculo ativo com o instrutor. A recusa de agenda usa sempre a mesma mensagem, que não revela de quem é o horário (testado, inclusive com mutação).
12. **Reserva presencial não cobra nada.** Registra o atendimento com preço, comissão e repasse congelados (comissão calculada uma vez, repasse por subtração, CHECK de soma); o recebimento continua fora do VentoKite, como já está nas telas.

**Garantias testadas:** valores saem do banco (cliente só escolhe unidade, serviço, instrutor e horário); preço ou comissão novos valem só para reservas novas; conflito entre unidades, entre empresas e com o fluxo digital; horário semanal, bloqueios, dias do serviço e horário da unidade; remarcar mantém os valores, cancelar exige motivo e libera o horário; reserva encerrada não muda; isolamento total entre empresas. Seis mutações deliberadas foram detectadas.

**Limites:** o instrutor ainda não lê as próprias reservas presenciais (precisa de uma consulta sem o telefone do cliente, fica para a tela do instrutor); pacote não tem venda nem saldo ainda (fase de lojinha); duração em múltiplos de 15 minutos, enquanto o fluxo digital trabalha em horas.


## Fase 3 (estoque, equipamentos, aluguéis e manutenção)

Migration: `supabase/migrations/20261115140000_business_stock_rentals.sql`, teste `supabase/tests/99zzzzzzzzzzzzzzz_business_stock_rentals.test.sql`, `scripts/test-business-stock-race.sh` (concorrência real), `REVERSAO_fase3.sql` e `VERIFICACAO_fase3_somente_leitura.sql`. Depende das fases 1 e 2. **Não altera nenhuma função nem tabela anterior**: só cria objetos e acrescenta 3 permissões ao catálogo.

**Decisões novas (recomendo aprovar):**

13. **Permissões de estoque.** `stock.view` (gerente, financeiro, atendente), `stock.edit` (gerente, atendente: vender, receber, transferir, alugar, devolver, abrir e fechar manutenção) e `stock.adjust` (só gerente e Proprietário; **sensível**: ajustar contagem, criar produto ou equipamento, definir tarifa, aposentar). Ajuste de contagem é a forma de esconder perda, por isso fica sensível. A matriz de permissões das telas precisa ganhar essas 3 linhas quando as telas forem ligadas.
14. **Saldo por razão com trava.** O saldo fica numa tabela mantida por gatilho com `CHECK (qty >= 0)`; duas movimentações simultâneas se enfileiram na linha e a que deixaria o estoque negativo é recusada. Provado com 30 vendas simultâneas de 1 unidade contra saldo 10: exatamente 10 vendem.
15. **Tarifa de aluguel por empresa e tipo, em versões**, como o preço de serviço: nova linha a partir de hoje, nunca edição; o aluguel congela hora vigente × horas. Hoje a tela usa uma tarifa fixa por tipo, que passaria a ser configurável.

**Garantias testadas:** estoque nunca negativo e igual à soma do razão (razão append-only); transferência = duas linhas com o mesmo id, total conservado e atômica (recusada não move nada), inclusive transferências opostas (ordem de travas fixa); equipamento com situação **derivada** (aposentado > em manutenção > alugado > disponível); um aluguel ativo por equipamento (índice único); aluguel com preço congelado e devolução que só preenche o retorno, uma vez; devolução pior exige descrição e `ruim` abre manutenção; uma manutenção aberta por equipamento; não se aluga item aposentado, em manutenção ou já alugado; não se aposenta item alugado; isolamento total entre empresas e por unidade; cliente sem escrita direta. Nove mutações deliberadas detectadas, mais a corrida real.

**Limites:** venda de produto no caixa (ligar a movimentação `sale` ao movimento de caixa) é da fase do caixa; aluguel não registra pagamento (continua fora do VentoKite); produto não tem edição de preço (o preço do produto muda numa fase de catálogo da lojinha); a tela atual de equipamento mostra um histórico que será lido do razão, aluguéis e chamados.


## Fase 4 (caixa e fechamento)

Migration: `supabase/migrations/20261115150000_business_cash.sql`, teste `supabase/tests/99zzzzzzzzzzzzzzzz_business_cash.test.sql`, `scripts/test-business-cash-race.sh` (concorrência real), `REVERSAO_fase4.sql` e `VERIFICACAO_fase4_somente_leitura.sql`. Depende das fases 1 a 3. **Não altera nenhuma função nem tabela anterior**: cria tabelas, funções, um bucket privado (`vento-business-closings`) e duas políticas de Storage.

**Decisões novas (recomendo aprovar):**

16. **Venda só com origem do banco.** Uma venda no caixa vem de um produto (preço × quantidade, com a saída do estoque na mesma transação), de uma reserva presencial ou de um aluguel (valores congelados). **Não existe venda de valor livre.** Suprimento, sangria e despesa são dinheiro físico contado, por isso o operador informa o valor. Impacto na tela atual: "Venda presencial" com valor digitado vira "escolha o que está sendo pago".
17. **Só dinheiro entra na gaveta.** O esperado é troco inicial + vendas em dinheiro + suprimentos − sangrias − despesas. Pix e cartão ficam registrados como recebidos fora do VentoKite (conta ou maquininha da escola) e nunca são cobrados aqui. A gaveta não fica negativa: sangria ou despesa maior que o dinheiro esperado é recusada.
18. **Quem fecha.** Só quem tem `cash.close` (financeiro e Proprietário, como na matriz atual); o gerente não fecha por padrão, mas pode receber a exceção na unidade. Diferença entre contado e esperado exige motivo (8+ caracteres). Fechado não muda, e nenhum movimento entra depois (provado com concorrência real).
19. **Modos de fechamento por unidade.** Diário: um caixa por dia na unidade; turno: vários por dia; manual: sem regra extra. Sempre um caixa aberto por vez na unidade.
20. **Arquivos do fechamento.** O app gera o Excel e o PDF (como hoje, sem dependência nova), envia ao bucket privado no caminho `<empresa>/<caixa>/fechamento.xlsx|pdf` e registra com SHA-256 e tamanho. Só envia quem fecha, depois de fechado, uma vez por tipo; lê quem fecha ou quem vê relatórios financeiros na unidade; ninguém altera nem apaga (não há política de UPDATE ou DELETE). A impressão térmica continua sendo prévia: não há impressão direta.

**Garantias testadas:** um caixa aberto por unidade (índice único e trava da unidade: 10 aberturas simultâneas abrem 1); movimento só em caixa aberto da mesma unidade; fechamento trava o caixa e calcula o esperado com todos os movimentos aceitos (suprimentos disputando o fechamento nunca ficaram fora do esperado); venda de produto sem estoque é recusada sem deixar movimento de caixa; reserva e aluguel recebidos uma vez; reserva cancelada ou de outra unidade recusada; movimentos e caixas fechados imutáveis; arquivos privados e imutáveis; isolamento entre empresas e por unidade. Dez mutações no teste de banco e duas na corrida, todas detectadas.

**Limites:** a geração dos arquivos e o envio ao bucket ficam na tela (servidor com a sessão do usuário), a ligar quando o caixa real for conectado; não há estorno de venda (um estorno será um movimento próprio, numa fase seguinte, sem apagar nada); comprovante térmico segue como prévia.


## Fase 5 (lojinha e afiliados da empresa)

Migration: `supabase/migrations/20261115160000_business_shop_affiliates.sql`, teste `supabase/tests/99zzzzzzzzzzzzzzzzz_business_shop_affiliates.test.sql`, `scripts/test-business-coupon-race.sh` (concorrência real), `REVERSAO_fase5.sql` e `VERIFICACAO_fase5_somente_leitura.sql`. Depende das fases 1 a 4. **Não altera nenhuma função nem tabela anterior.**

**Decisões novas (recomendo aprovar):**

21. **Pedido é pedido, não pagamento, e quem registra é a equipe.** Nesta fase o pedido é criado por quem tem `shop.edit` na unidade (balcão, WhatsApp, Instagram, link de afiliado atendido pela escola). **Não há página pública nem cliente anônimo criando pedido**: abrir a vitrine ao público é uma decisão separada (expõe catálogo e criação de pedido a quem não tem conta) e ficaria numa fase própria. O pedido confere a disponibilidade na hora, mas **não reserva estoque nem agenda**: a escola atende pelos fluxos de reserva, caixa e aluguel.
22. **Cupom.** Percentual (1% a 50%) ou fixo; validade, limite de usos, valor mínimo e unidades cobertas. O desconto é calculado uma vez sobre os itens cobertos e repartido por item. O último item recebe o resto até o seu valor, e os itens anteriores absorvem eventual excedente. Pedido cancelado não devolve o uso do cupom.
23. **Afiliado da empresa é o afiliado da plataforma.** Só um afiliado aprovado no VentoKite pede afiliação; a escola aprova ou recusa (recusar exige motivo). O código de divulgação é o código que o afiliado já tem. Suspender o vínculo na escola não altera o afiliado na plataforma nem as vendas já atribuídas.
24. **Comissão de afiliado.** Percentual padrão e por serviço ou produto, em versões (0,5% a 30%); o percentual vigente fica congelado em cada item do pedido, calculado sobre o valor líquido do item (depois do cupom). Estados: prevista (antes da entrega), a pagar (entregue), cancelada, estornada. **Não existe "paga"**: o pagamento integrado continua desligado. Estorno registrado pela escola reduz a comissão na proporção.
25. **Permissões.** `shop.view`, `shop.edit`, `shop.manage` (sensível: cupons, configuração, estorno), `affil.view`, `affil.manage` (sensível: aprovar, suspender, percentuais, campanhas).

**Garantias testadas:** preços só do catálogo (valores enviados no item são ignorados); divisão do desconto exata, inclusive com resto; cada unidade vê só os seus itens; limite de usos do cupom com 20 pedidos simultâneos (exatamente 5 passam); pedido e itens congelados; estorno não diminui; afiliado lê as próprias vendas **sem nome nem telefone do cliente** e não lê a tabela de pedidos; afiliado não se aprova nem a empresa escolhe por ele; isolamento entre empresas. Doze mutações no teste de banco e duas na corrida detectadas (duas delas só depois de eu reforçar os testes).

**Limites:** sem vitrine pública; sem ligação automática entre pedido entregue e venda no caixa (a escola registra a venda no caixa); pacotes ainda sem venda.


## Fase 6 (financeiro e pagamentos externos aos instrutores)

Migration: `supabase/migrations/20261115170000_business_finance.sql`, teste `supabase/tests/99zzzzzzzzzzzzzzzzzz_business_finance.test.sql`, `scripts/test-business-finance-race.sh` (concorrência real), `REVERSAO_fase6.sql` e `VERIFICACAO_fase6_somente_leitura.sql`. Depende das fases 1 a 5. **Não altera nenhuma função nem tabela anterior.** É a última fase do plano.

**Decisões novas (recomendo aprovar):**

26. **Pagamento ao instrutor é só registro.** A escola paga fora do VentoKite (Pix, TED ou dinheiro) e registra aqui valor, forma, referência e data. Nada é transferido nem repassado pela plataforma. O devido é a soma das comissões **congeladas** das reservas presenciais **concluídas**; um registro nunca passa do saldo (provado com 20 registros simultâneos).
27. **O instrutor confirma o recebimento** com a própria conta, uma vez. A escola não confirma por ele. Registro errado ainda não confirmado é **anulado com motivo** (fica no histórico e deixa de contar); confirmado não muda. Isso fecha, no banco, a pendência "tela do instrutor para confirmar recebimento": falta só a tela.
28. **Lançamentos append-only.** Receita e despesa manuais não são editadas nem apagadas; corrigir é estornar (lançamento inverso, uma vez, com motivo).
29. **Contas a receber e a pagar.** Baixas parciais que nunca passam do valor; conta com baixa não é cancelada; situação (paga, parcial, vencida, aberta, cancelada) é calculada.
30. **Quem mexe.** `finance.edit` (nova, sensível) só para o cargo Financeiro e o Proprietário; `finance.reports` (gerente e financeiro) continua só leitura. O resumo por período devolve só as unidades em que a pessoa vê relatórios.

**Garantias testadas:** pagamento nunca acima do devido (função e gatilho, inclusive por inserção direta); só aulas concluídas contam; só o instrutor confirma; outro instrutor não vê nem confirma; anulação libera o saldo sem apagar; lançamentos e baixas imutáveis; estorno uma vez; resumo por unidade conferido com os valores do caixa (fase 4), dos lançamentos e das comissões; atendente e instrutor não veem o financeiro da empresa; isolamento entre empresas. Treze mutações no teste de banco e duas na corrida, todas detectadas.

**Limites:** o resumo ainda não inclui a comissão de afiliados (ela é por pedido, não por unidade; aparece nas telas de afiliados); os relatórios em Excel e PDF continuam gerados pelo app a partir destas consultas; comprovante em anexo (arquivo) do pagamento ao instrutor não está nesta fase, só a referência em texto.

## Situação geral do banco do Business

| Fase | Migration | PR | Conteúdo |
|---|---|---|---|
| 1 | `20261115120000_business_company_core` | #275 | Empresas, unidades, equipe, convites, instrutores, auditoria |
| 2 | `20261115130000_business_services_bookings` | #284 | Serviços, preços, reservas presenciais, agenda única (muda `instructor_can_attend`) |
| 3 | `20261115140000_business_stock_rentals` | #287 | Estoque, equipamentos, aluguéis, manutenção |
| 4 | `20261115150000_business_cash` | #289 | Caixa, fechamento, arquivos privados |
| 5 | `20261115160000_business_shop_affiliates` | #290 | Lojinha, cupons, pedidos, afiliados |
| 6 | `20261115170000_business_finance` | (este) | Financeiro, pagamentos externos aos instrutores |

Todas **não aplicadas**, em PRs draft empilhados nessa ordem. Antes delas: **#283** (correção do duplo agendamento de instrutor, defeito já presente na produção). Para aplicar: `ROTEIRO_CHATGPT_APLICAR_E_TESTAR.md`, fase por fase, primeiro em projeto de teste. Pendências humanas: e-mail confirmado no Supabase (decisão 7), `pg_cron`, e a decisão de abrir ou não uma vitrine pública (decisão 21).
