# #91/#93 — conciliação após o guard de reservas

Base desta entrega: main d01c3f6 + pilha #369 (6c350989).
Origem de interrupção: #344 (ed0d884). Agenda v2 #339 (90c06b2) foi
inventariada, mas não incorporada.

| Item | Estado verificado |
|---|---|
| #339 CI de origem | 45665024676 e 45665011150 success; Claude QA skipped |
| #344 CI de origem | 45666538441 e 45666311847 success; Claude QA skipped |
| can_move_meeting | Interrupção usa assinatura atual; #339 a substitui sem mudar assinatura |
| Regras de cancelamento | Nenhuma mudança nova nesta conciliação |
| Agenda v2 | Política de cancelamento de retenções awaiting_payment ao reduzir disponibilidade continua pendente |
| Aplicação Supabase | Não realizada por este executor |
| Feature flag | NEXT_PUBLIC_VENTO_INTERRUPTION_FLOW_ENABLED=false por padrão |

## Escolha da entrega

A pilha de interrupção foi conciliada com o guard #369 e os testes atuais do
inbox, ciclo do poller, chat, push passivo e Storage. As novas rotinas de ensaio
têm banco próprio descartável. O roteiro operacional preexistente
scripts/rehearse-chain.sh conserva sua lista anterior: esta entrega não
inclui automaticamente a migration de interrupção naquele lote operacional.

A migration da #344 já revoga EXECUTE de authenticated no start_meeting;
não repetir a advertência antiga da #323 como se o grant ainda estivesse aberto.

## Permissões reais: somente leitura em 26/11/2026

| Função | MD5 prosrc | authenticated | anon | Dono/ACL |
|---|---|---|---|---|
| start_meeting(uuid,text) | 810cd1785b6ac568e60e276a9ca9833c | negado | negado | postgres; postgres/service_role EXECUTE |
| start_ordered_meeting(uuid,text) | 9a007a051d931cb19dc55728f2229041 | permitido | negado | postgres; postgres/authenticated/service_role EXECUTE |

Ambas SECURITY DEFINER e search_path vazio. Nenhum DDL remoto nesta leitura.

## Novas verificações

- scripts/test-meeting-interruption-upgrade.sh monta a base sem a migration
  de interrupção, aplica todas as migrations atuais incluindo a revogação P0 e
  o guard de entradas, cria dados sintéticos e só então aplica a interrupção.
  Compara fingerprints dos dados legados, preço/perfis/auditoria/notificações/
  competências, ACL/OIDs/assinaturas dos starters e corpos das RPCs de reserva.
  start_meeting permanece fechado; start_ordered_meeting e service_role
  conservam seus grants. As colunas de encontros históricos ficam neutras.
  Roda os testes reais de RPC de interrupção/autorização em ROLLBACK.
- scripts/test-meeting-interruption-reads.mjs executa o módulo de leituras com
  respostas simuladas: flag ausente/falsa/valores não reconhecidos não pedem
  colunas novas; flag true lê o estado estendido; coluna ausente usa a leitura
  legada; erros de permissão não viram sucesso; titularidade continua exigida.
  Isso não é RLS HTTP ou login de navegador.
- O teste das Server Actions agora também confirma que a flag desligada
  impede até a criação do cliente de banco.
- Typecheck e lint locais passaram. Builds locais com flag false e true
  passaram, usando chaves fictícias e sem chamadas autenticadas reais.
  O CI da conciliação deve ser conferido no SHA final.

## Pré-requisitos ainda reais

1. Revisão independente da pilha conciliada e CI completo do SHA final.
2. Para aplicar SQL: comparar as definições reais atuais dos starters, schema
   e dependências; snapshot antes/depois e conciliação individual. Não db push,
   não lote antigo e não reaplicar a migration se as colunas/constraints já existem.
3. Para ativar: migration necessária validada/aplicada, novo build com a flag
   explicitamente true e jornada autenticada Aluno/Instrutor em desktop/mobile,
   com início ordenado, interrupção, continuidade e evolução.
4. A flag controla o app/Server Actions; aplicar a migration cria RPCs novas
   acessíveis ao instrutor autenticado com checagem de papel/dono. Não assumir
   que só a flag pública bloqueia chamadas diretas de RPC após aplicar SQL.
5. #339 exige resolver a política de retenções antes de integrá-la. Não foi
   inventada nenhuma regra de cancelamento/remarcação para remover essa pendência.

Checkout, operações financeiras, scheduler e Protege 3B não são ativados.
Esta entrega não é homologação integral de #91 ou #93.
