# Testes reais: vitrine pública e pedidos (aluno/visitante)

Pré-requisito: projeto Supabase de TESTE com as fases 1 a 7 aplicadas (ver `docs/proposals/business-multiempresa/ROTEIRO_CHATGPT_APLICAR_E_TESTAR.md`) e a correção #283. Nunca produção.

## Preparar uma loja de teste
1. Crie uma empresa com unidade ativa, um serviço com preço vigente, um instrutor vinculado, um produto com estoque e uma tarifa de aluguel com equipamento (telas do Business ou SQL).
2. Publique como proprietário (ou gerente com `shop.manage`):
   `select public.set_store_public('<company_id>', 'escola-teste', true);` (executar com a sessão do proprietário).
3. Abra `/escola` e `/escola/escola-teste`.

## Roteiro (visitante, sem conta)
- [ ] `/escola` lista só lojas publicadas; despublicar some da lista.
- [ ] Loja mostra aulas, produtos e aluguel; estoque só "sem estoque" ou "adicionar"; instrutor só pelo primeiro nome.
- [ ] Escolher dia: horários livres aparecem; horário ocupado por outra reserva NÃO aparece.
- [ ] Montar carrinho (aula + produto + aluguel), enviar com nome e WhatsApp. Abre `/escola/pedido/<número>?t=<token>` com o total calculado pelo banco.
- [ ] Alterar o valor no navegador (DevTools) não muda o total.
- [ ] Abrir o pedido sem `?t=` ou com token errado: "Pedido não encontrado".
- [ ] Cancelar pelo link funciona enquanto "Recebido"; depois que a escola avança, não.
- [ ] 4º pedido na mesma hora com o mesmo telefone é recusado com mensagem amigável.
- [ ] Cupom como visitante é recusado; com conta e e-mail confirmado funciona.

## Roteiro (aluno logado)
- [ ] Início do aluno mostra "Ver escolas" e "Meus pedidos".
- [ ] Pedido feito logado aparece em `/aluno/pedidos` e abre sem token.
- [ ] Outro aluno não vê esse pedido.
- [ ] Conta admin não consegue fazer pedido.

## Do lado da escola (painel do Business)
- [ ] O pedido chega como "recebido" com origem vitrine; confirmar/cancelar pelas telas da equipe.
- [ ] Auditoria registra o cancelamento do cliente sem autor.

## Riscos conhecidos (ver decisões 31 a 35 da proposta)
Troca de telefone contorna o limite; teto de 300 pedidos em aberto pode ser enchido; sem limite por IP/captcha; pedido não reserva estoque nem horário. Não abrir ao público real sem WAF/limite por IP.

## Ainda não existe
Tela da escola para publicar/despublicar a loja (hoje, via `set_store_public`).
