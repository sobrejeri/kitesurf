# #88/#90 — migration de entradas: candidata, não aplicada remotamente

Arquivo: `supabase/migrations/20261127004852_validate_request_and_booking_input.sql`.
Gerado por `supabase migration new validate_request_and_booking_input` com CLI 2.122.1.
O arquivo CLI baixado do release oficial teve SHA-256
`3e54b98e5ead7be0a3b0753526833d4cc9a55304e4d57da0d72f1efc342738ea`.

## Baselines revisados em 26/11/2026

Somente leitura de `pg_proc` no projeto Kitesurf `qadkqjfmmnxvovyyhqxw`;
nenhum DDL remoto. Os quatro corpos reais e os do replay foram comparados
por tokens SQL, preservando literais; são idênticos. As diferenças de MD5
nas solicitações vêm da formatação.

| Assinatura abreviada | MD5 real de prosrc | MD5 replay | Defaults | Modo |
|---|---|---|---:|---|
| create_booking (6) | de6a7dbe9b6f248302a1a3f609f73a78 | mesmo | 0 | DEFINER |
| create_booking (5) | 290345b195f7406d07feaf15770cdf89 | mesmo | 1 | INVOKER |
| create_instructor_request (6) | df9cac2742faa9d85a8fa642ae0ec973 | 14ef3d895388922d70c1d6b8a4011d94 | 2 | DEFINER |
| create_instructor_request_with_preference (7) | 23129c2ae7fe5769c240019620fd62f6 | 83caadaf0eaf8eb7f2dd56eb0c852043 | 0 | DEFINER |

Dono real: postgres; search_path vazio. ACL real exata: postgres,
authenticated e service_role com EXECUTE concedido por postgres, sem grant
option e sem PUBLIC/anon. O stub sem service_role aceita somente postgres
e authenticated. Se service_role existir, seu grant é obrigatório. Nenhum
grant é recriado: a migration confere e preserva a ACL original integralmente.

As dependências existentes permanecem: require_role, current_price_version,
advance_instructor_offer, instructor_can_attend e as duas guardas de
instructor_requests (agenda do aluno e dia civil). A nova validação roda
depois da declaração require_role e antes de cálculos, varreduras e inserts.

## Aplicação futura

Não executar db push sobre o ledger divergente nem reaplicar migrações antigas.
A versão remota 20261124114433 já equivale às três conciliações de overloads/dia
civil; esta candidata pressupõe esse estado, sem reaplicá-lo. As propostas
`90_*input*.proposed.sql` são históricas e não devem ser instaladas junto com
a migration oficial.

A migration é uma transação, com lock_timeout de 3s e statement_timeout de
30s. Recusa corpos/metadados/ACL desconhecidos e helpers já existentes.
Não altera dados. Faz CREATE OR REPLACE apenas das três canônicas, insere uma
única chamada de validação por corpo, preserva a delegada e confere OID,
dono, ACL, defaults, modos, tipos, nomes dos argumentos e configurações no
postflight. Falha em qualquer etapa desfaz todo o DDL da transação.

Antes de aplicar remotamente: revisão independente, CI do SHA exato,
preflight novo sobre o projeto correto e confirmação das evidências de
recuperação autorizadas pelo responsável. Depois: confirmar ledger,
assinaturas/permissões, fingerprints dos dados e jornada autenticada.
Não declarar restore de backup real por causa destes testes sintéticos.
Sem ativação de checkout ou Protege 3B.

## Validação reproduzível isolada

`scripts/test-request-input-migration.sh` cria um PostgreSQL descartável e
percorre o replay do repositório e a fixture das definições observadas. Em ambos,
compara hashes de dados e metadados antes/depois, preservando service_role, OIDs
e defaults, e roda 132 chamadas (60 inválidas, 48 reservas válidas e 24 níveis
inelegíveis). Também injeta seis divergências: corpo, ACL, quantidade e valor dos defaults,
service_role revogado e helper preexistente. Cada recusa deve preservar dados
e catálogo, sem helper parcial.

`scripts/test-db.sh` passa a instalar a migration no replay normal, antes das
fixtures; roda a regressão direta e o ensaio adicional. O teste de montagem
89f aceita a mensagem antecipada 22023 de data/horas, mantendo a expectativa
antiga no ensaio do baseline histórico.

Isso não substitui teste de login, RLS HTTP, dispositivo físico ou restauração
de backup hospedado.


Defaults são comparados por pg_get_expr e quantidade, incluindo os valores esperados NULL/false; a representação interna pg_node_tree pode conter posições de origem que mudam no PostgreSQL 16 ao recriar a mesma função. O postflight mantém os valores efetivos e informa quais invariantes divergem em caso de falha.
