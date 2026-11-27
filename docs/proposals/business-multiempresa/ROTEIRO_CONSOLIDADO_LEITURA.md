# Business — verificação consolidada das fases 1 a 7

A ponta usada é `1b318eb47a564742279fe96887d1d615b77d28d1` da PR #297, que inclui as correções #293. Este roteiro verifica a instalação; ele não aplica migrations, publica loja, cria usuários ou movimenta dinheiro.

## Antes de qualquer aplicação

1. Identifique o projeto e confirme que é o destino isolado autorizado. Não instalar a pilha no Turiva nem no Kitesurf ativo.
2. Fixe o SHA da pilha revisada. Não use a soma das primeiras PRs sem as correções de convites, agenda e cupom da #293.
3. Guarde o snapshot de contagens de perfis/reservas, catálogo, ledger e fingerprints das funções. Ledger e objetos precisam ser conciliados antes de executar DDL; presença de função não prova migration aplicada.
4. Confirme no Auth que a confirmação de e-mail está habilitada. O SQL verifica o helper `auth_email` e seu filtro de e-mail confirmado; ele não consegue provar configuração do provedor ou login real.
5. Confirme backup/recuperação conforme decisão do responsável. Este roteiro não exporta nem restaura backup.

## Executar o verificador

Arquivo: `docs/proposals/business-multiempresa/VERIFICACAO_consolidada_somente_leitura.sql`.

É SQL puro, executável no editor SQL ou por psql. Ele abre uma transação REPEATABLE READ READ ONLY, consulta catálogos/contagens e termina com ROLLBACK. Não chama nenhuma RPC da aplicação, nem as funções públicas que criam ou cancelam pedidos.

Para conferir as sete fases já instaladas:

```bash
psql "$BUSINESS_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f docs/proposals/business-multiempresa/VERIFICACAO_consolidada_somente_leitura.sql
```

Para conferir uma etapa intermediária, use a mesma conexão:

```bash
psql "$BUSINESS_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "SET vento.business.expected_phase = '3'" \
  -f docs/proposals/business-multiempresa/VERIFICACAO_consolidada_somente_leitura.sql
```

No editor SQL, execute `SET vento.business.expected_phase = '3';` antes do arquivo. Valores aceitos: 1 a 7; sem configuração usa 7. Execute fora de outra transação.

O verificador recusa tabela/função/trigger ausente, RLS desligada, escrita direta por cliente, leitura anônima, grants de função inesperados (incluindo PUBLIC), modo DEFINER/INVOKER divergente, search_path ausente e bucket de fechamento público ou incompleto. A saída PASS informa o número de objetos efetivamente conferidos. A lista possui 45 tabelas, 114 funções distintas e 27 gatilhos no conjunto das sete fases. Não exige tabelas vazias: também serve após a criação de dados fictícios.

Se falhar, guarde mensagem e SHA e interrompa a próxima fase. Não use reversões destrutivas ou reaplique a pilha inteira para contornar divergência. Os arquivos antigos de verificação por fase continuam úteis para revisão detalhada; seus exemplos de RPC que geram erro esperado não são parte deste verificador automatizado.

## Critérios por fase

| Fase | Estrutura a conferir | Critério funcional adicional |
|---|---|---|
| 1 — empresas/equipe | 13 tabelas; permissões; convites; auditoria e taxas imutáveis | Login com e-mail confirmado, aceite/recusa pelo destinatário; isolamento empresa/unidade; instrutor independente preservado |
| 2 — serviços/agenda | 6 tabelas; preço versionado; agenda digital considerando reservas presenciais | Horários concorrentes sem duplicação; concluir só após o fim contratado; buffer preservado |
| 3 — estoque/aluguel | 7 tabelas; movimentos; equipamento/manutenção | Duas sessões não vendem/alugam o mesmo saldo/equipamento; devolução e manutenção auditadas |
| 4 — caixa | 4 tabelas; bucket privado PDF/XLSX; políticas SELECT/INSERT | Abrir, movimentar, conferir e fechar; arquivo real via Storage HTTP; impressão 58/80 mm; exportações corretas |
| 5 — loja/afiliados | 11 tabelas; pedido sem estado paid; cupom e comissão congelados | Rateio em centavos, cancelamento/estorno proporcional; afiliado não recebe nome/telefone do cliente |
| 6 — financeiro externo | 4 tabelas; lançamentos e acertos auditados | Conciliar registros externos; isolamento de funcionário/unidade; nenhum repasse online implícito |
| 7 — vitrine pública | 6 RPCs anônimas e nenhuma tabela pública; núcleo interno restrito | Token errado/alheio recusado, preço calculado no banco, limites de abuso e concorrência; publicar somente por ação autorizada |

## Evidências que ainda são necessárias

PASS de catálogo não equivale a homologação. Execute as suítes comportamentais por fase e as corridas de caixa/estoque/cupom/financeiro/pedidos públicos no PostgreSQL descartável. Depois, no destino isolado, valide Auth, RLS via HTTP, Storage real e telas de cada papel. As telas Business demonstrativas precisam estar ligadas às RPCs antes de marcar um fluxo como funcional.

Registre por entrega: fase, SHA, CI, projeto, snapshot antes/depois, resultado do verificador, cenário autenticado, arquivos gerados e pendências. Não declare restore real, deploy ou gateway funcionando com base apenas no CI.

## Validação automatizada deste roteiro

`scripts/test-db.sh` executa o verificador ao final das suítes da ponta #297. O teste usa PostgreSQL descartável do CI e valida o SQL contra os objetos reais dessas migrations. Não houve execução local nesta sessão porque o executor não possui PostgreSQL/Docker; consulte o CI da PR para o resultado efetivo.
