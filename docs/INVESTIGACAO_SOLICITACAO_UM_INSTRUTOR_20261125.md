# Por que a solicitação pode não aparecer quando há um instrutor só (#92) — investigação de 25/11/2026

Somente leitura do código, testes em banco descartável e uma correção de interface. Nada foi aplicado em Supabase.

## Caminho da solicitação
`create_instructor_request` → grava a solicitação (6 min de vida) → `advance_instructor_offer` escolhe **um** candidato e cria a oferta (**2 min** de vida) → o instrutor vê a oferta em `/instrutor/solicitacao` (só `status = 'offered'` e dentro do prazo, lendo também a solicitação por RLS) → aceita ou a oferta expira → a fila avança para o próximo.

## Causas, com evidência
| # | Causa | Evidência | Situação |
|---|---|---|---|
| 1 | **A caixa do instrutor não se atualizava sozinha.** A oferta só aparecia se ele recarregasse a tela dentro dos 2 min. Com um instrutor só não há "próximo da fila": a solicitação expira sem ser vista. Bate com o que se vê no projeto real (buscas e ofertas vencidas com 1 instrutor). | `src/app/instrutor/(app)/solicitacao/page.tsx` não tinha atualização; só o aluno tinha (`RequestPoller`). | **CORRIGIDA**: `InstructorOfferPoller` (10 s, só com a aba visível). Teste `scripts/test-instructor-offer-visibility.mjs` (no CI). |
| 2 | **Reoferta ao mesmo instrutor não existe.** Quem já teve oferta naquela solicitação (expirada ou recusada) não recebe de novo. Com um instrutor só, depois dos 2 min a solicitação segue `searching` sem oferta visível até vencer. | `supabase/tests/92a…` bloco X. | **Comportamento da fila A→B→C, não alterado.** Decisão de produto pendente (ver abaixo). |
| 3 | **Instrutor ocupado ou travado no instante da busca.** Outra oferta aberta no mesmo horário (`v_busy`) ou a linha dele travada por outra transação (`FOR UPDATE SKIP LOCKED`) faz a solicitação nascer **sem oferta**. Ela só ganha oferta quando alguém "atualiza a busca" (o `RequestPoller` do aluno, a cada 10 s, ou o worker, que está desligado). | `92a` bloco B e `scripts/test-single-instructor-request-lock.sh` (a criação não espera, não duplica, sem deadlock; atualizar a busca cria a oferta). | Reproduzida e **documentada**; se o aluno fecha o app antes, a solicitação expira sem oferta. A cura definitiva é o worker agendado (decisão de ativação). |
| 4 | **Elegibilidade.** Status diferente de `approved`, sem vínculo com a praia, idioma com grafia diferente, pedido com transporte e instrutor sem veículo, dia/horário fora da **agenda salva** (o padrão da tela de turnos salva só seg–sáb, 08–17), bloqueio, ou aula já marcada no horário. Nenhum desses gera aviso ao aluno além de "buscando". | `92a` bloco E (cada requisito sozinho tira a oferta e, restaurado, ela volta). | Reproduzida; mensagem ao instrutor na tela vazia agora explica os requisitos. |
| 5 | **RLS da leitura da solicitação.** A política antiga comparava `request_id` com o **id da oferta** e escondia os detalhes. A migration 33 a corrige. | `92a` bloco V (instrutor com a oferta lê oferta + solicitação; outro instrutor e outro aluno não leem). A tela já avisa "os detalhes não puderam ser carregados" quando a política não é a corrigida. | No repositório está correta. **Conferir no banco real** com `docs/CONSULTA_SOLICITACAO_UM_INSTRUTOR.sql` (Q4), porque as migrations 01–38 foram aplicadas à mão. |
| 6 | **Expiração.** Oferta 2 min, solicitação 6 min, nada agendado no projeto real: ofertas `offered` vencidas ficam acumuladas. | `92a` bloco X. | Informativo; o job de expiração segue fechado e não agendado. |

## O que foi corrigido
- `src/components/instructor/offer-poller.tsx` e uso em `/instrutor/solicitacao`: atualiza a cada 10 s com a aba visível, sem empilhar chamadas e sem tocar no banco (só `router.refresh()`).
- Texto da tela vazia lista o que faz uma solicitação chegar (praia, idioma, transporte, horário e agenda).

## O que NÃO foi alterado e por quê
- `advance_instructor_offer` (reoferta, `SKIP LOCKED`, preferido): é o núcleo A→B→C e há uma decisão pendente sobre a versão do instrutor preferido. Reoferecer ao mesmo instrutor **depois de expirar sem resposta** (só quando não há outro candidato e a solicitação ainda vive) é uma mudança de política que precisa da sua aprovação; os testes `92a` (X) e o de trava documentam o comportamento atual e falham de propósito se ele mudar.
- Nenhuma migration, nenhum agendador, nenhum dado.

## Como conferir no projeto de teste (somente leitura)
`docs/CONSULTA_SOLICITACAO_UM_INSTRUTOR.sql`: elegíveis por praia, idiomas, agenda salva, **Q4 (política corrigida)**, estado das solicitações e ofertas, e quantas expiraram sem nenhuma oferta.
