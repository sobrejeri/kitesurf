# #99 — cadastro do veículo de apoio

Cada instrutor pode cadastrar um único veículo descritivo: tipo, identificação por marca/modelo/cor (sem solicitar placa ou documento) e capacidade de 1 a 20 passageiros, excluindo o motorista. A capacidade é informação cadastral nesta etapa.

A tarifa continua sendo a global publicada pelo Admin; o veículo acompanha a agenda do instrutor. Esta alteração não cria tarifa individual, frota compartilhada ou agenda de veículo. Também não muda `has_support_vehicle`, seleção da fila, elegibilidade, quantidade de alunos por pedido, cálculo de transporte, comissões ou snapshots de reservas.

## Liberação

A flag `NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED` vem **false**. Desligada, a interface não lê a tabela e a ação recusa a gravação antes de criar cliente do banco. Se a flag estiver ligada e o schema não existir, aparece mensagem temporária sem formulário e sem instrução de instalar migrations dentro do fluxo do usuário.

Antes de ligar a flag em um build: revisar a migration `20261127010004_instructor_support_vehicle_profile.sql` (criada pela CLI), conciliar com o schema real, testar em isolamento e aplicar separadamente no projeto autorizado. Esta PR não aplica DDL remoto nem modifica configuração do Render.

## Permissões e testes

`instructor_support_vehicles` tem PK no instrutor, RLS e somente SELECT para authenticated. O dono com papel instrutor lê apenas seu cadastro; Admin pode ler para supervisão. Não há escrita direta ao cliente. A RPC `save_my_support_vehicle` deriva o dono de Auth, exige o papel instrutor inclusive quando `require_role` aceitaria Admin e audita cada gravação. Não aceita dono, preço, disponibilidade ou elegibilidade como parâmetros. Um lock por dono serializa primeiro cadastro e atualizações para manter o histórico anterior/posterior da auditoria.

O teste SQL transacional cobre criação/atualização sem duplicata, validação, leitura cruzada, escrita direta negada, papéis não autorizados, identidade ausente, auditoria e preservação integral de instrutores/preços/reservas. O teste JS executa a ação e o painel reais com dependências simuladas, incluindo flag desligada, campos forjados e schema ausente.

## Consulta operacional no Admin

Admin → Transporte inclui um painel somente de leitura, com a mesma flag desligada por padrão. Quando habilitado em um build autorizado, exige Admin com segundo fator antes de criar o cliente Supabase RLS. Consulta apenas vínculo com o instrutor, tipo, identificação descritiva e capacidade. Não seleciona placa, documentos, contatos, nomes ou outros dados pessoais do motorista; o link abre o perfil administrativo já existente.

O painel lista até 500 cadastros e avisa quando atinge esse limite. Também mostra cadastros cujo dono ainda não marcou a opção legada de oferecer transporte: cadastro descritivo e elegibilidade continuam independentes. Métricas, lista de instrutores elegíveis, tarifa global, reservas e agenda já existentes permanecem calculadas como antes. Capacidade é metadado para consulta; não equivale a contagem de vagas, bloqueio de assentos ou uma reserva de veículo.

Flag desligada não faz consulta adicional. Erro de schema/permissão/conexão mostra mensagem segura sem detalhes internos; os controles e informações antigos de transporte continuam disponíveis. Nenhuma grant, policy ou migration nova foi adicionada para esta leitura.

Ainda pendente para homologação #99: aplicação e conferência do schema real, cadastro e consulta Admin autenticados no navegador com a flag habilitada em ambiente autorizado, capacidade no fluxo completo de contratação conforme regra a definir e instruções de embarque compartilhadas. Os testes simulados não comprovam esses cenários nem disponibilidade física do veículo.
