# #99 — cadastro do veículo de apoio

Cada instrutor pode cadastrar um único veículo descritivo: tipo, identificação por marca/modelo/cor (sem solicitar placa ou documento) e capacidade de 1 a 20 passageiros, excluindo o motorista. A capacidade é informação cadastral nesta etapa.

A tarifa continua sendo a global publicada pelo Admin; o veículo acompanha a agenda do instrutor. Esta alteração não cria tarifa individual, frota compartilhada ou agenda de veículo. Também não muda `has_support_vehicle`, seleção da fila, elegibilidade, quantidade de alunos por pedido, cálculo de transporte, comissões ou snapshots de reservas.

## Liberação

A flag `NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED` vem **false**. Desligada, a interface não lê a tabela e a ação recusa a gravação antes de criar cliente do banco. Se a flag estiver ligada e o schema não existir, aparece mensagem temporária sem formulário e sem instrução de instalar migrations dentro do fluxo do usuário.

Antes de ligar a flag em um build: revisar a migration `20261127010004_instructor_support_vehicle_profile.sql` (criada pela CLI), conciliar com o schema real, testar em isolamento e aplicar separadamente no projeto autorizado. Esta PR não aplica DDL remoto nem modifica configuração do Render.

### Verificação repetível, somente leitura

Os arquivos abaixo são SQL puro (`BEGIN READ ONLY`), compatível com SQL Editor, conector ou psql. Executar no Kitesurf autorizado, nunca no Turiva.

1. `supabase/reconciliation/99_support_vehicle_preflight.sql`: somente antes da DDL. Confere destino ausente, dependências, PK UUID e ACL dos helpers; destino existente exige conciliação e causa erro. Conferir separadamente o ledger e os corpos dos helpers, inclusive MFA do Admin.
2. `supabase/reconciliation/99_support_vehicle_snapshot.sql`: guardar o JSON antes e depois da DDL, e novamente após o teste de metadados. Com outras gravações pausadas nessa janela curta, os três resultados devem ser iguais. Engloba dez tabelas anteriores (preços, elegibilidade, reservas/encontros, fila e agenda) e hash de definições/ACL/donos de todas as funções públicas anteriores. Só retorna contagens/hashes, sem linhas ou valores privados. Não é o mesmo algoritmo de snapshots usados em outras rodadas e não substitui backup.
3. Aplicar somente a migration revisada, de forma separada; estes scripts não fazem DDL. Não reaplicar histórico antigo nem reaplicar destino existente.
4. `supabase/reconciliation/99_support_vehicle_postflight.sql`: conferir RLS, PK/FK/checks, leitura owner/Admin, ausência de escrita cliente e RPC com assinatura/ACL/search_path revisados. Revisar no JSON as expressões de policy/checks contra o arquivo aprovado. O esperado logo após DDL é zero veículos/auditorias novas; após um save autorizado, os contadores podem crescer e os dados anteriores continuam com o mesmo snapshot.
5. Conferir o ledger e a leitura via cliente autenticado. Se o catálogo está correto mas a API acusa schema cache antigo, investigar/atualizar o cache antes de habilitar o build. A flag pública depende de novo build/deploy; validar o SHA LIVE e o cadastro/consulta nos dois perfis com contas fictícias. Nenhuma flag push é necessária.

Em caso de diferença inesperada, parar a habilitação e investigar; os scripts não desfazem dados, não removem locks, não corrigem ACL automaticamente e não executam RPC mutante. Testes SQL simulados não equivalem a login ou autorização HTTP real.

## Permissões e testes

`instructor_support_vehicles` tem PK no instrutor, RLS e somente SELECT para authenticated. O dono com papel instrutor lê apenas seu cadastro; Admin pode ler para supervisão. Não há escrita direta ao cliente. A RPC `save_my_support_vehicle` deriva o dono de Auth, exige o papel instrutor inclusive quando `require_role` aceitaria Admin e audita cada gravação. Não aceita dono, preço, disponibilidade ou elegibilidade como parâmetros. Um lock por dono serializa primeiro cadastro e atualizações para manter o histórico anterior/posterior da auditoria.

O teste SQL transacional cobre criação/atualização sem duplicata, validação, leitura cruzada, escrita direta negada, papéis não autorizados, identidade ausente, auditoria e preservação integral de instrutores/preços/reservas. O teste JS executa a ação e o painel reais com dependências simuladas, incluindo flag desligada, campos forjados e schema ausente.

## Consulta operacional no Admin

Admin → Transporte inclui um painel somente de leitura, com a mesma flag desligada por padrão. Quando habilitado em um build autorizado, exige Admin com segundo fator antes de criar o cliente Supabase RLS. Consulta apenas vínculo com o instrutor, tipo, identificação descritiva e capacidade. Não seleciona placa, documentos, contatos, nomes ou outros dados pessoais do motorista; o link abre o perfil administrativo já existente.

O painel lista até 500 cadastros e avisa quando atinge esse limite. Também mostra cadastros cujo dono ainda não marcou a opção legada de oferecer transporte: cadastro descritivo e elegibilidade continuam independentes. Métricas, lista de instrutores elegíveis, tarifa global, reservas e agenda já existentes permanecem calculadas como antes. Capacidade é metadado para consulta; não equivale a contagem de vagas, bloqueio de assentos ou uma reserva de veículo.

Flag desligada não faz consulta adicional. Erro de schema/permissão/conexão mostra mensagem segura sem detalhes internos; os controles e informações antigos de transporte continuam disponíveis. Nenhuma grant, policy ou migration nova foi adicionada para esta leitura.

Ainda pendente para homologação #99: aplicação e conferência do schema real, cadastro e consulta Admin autenticados no navegador com a flag habilitada em ambiente autorizado, capacidade no fluxo completo de contratação conforme regra a definir e instruções de embarque compartilhadas. Os testes simulados não comprovam esses cenários nem disponibilidade física do veículo.
