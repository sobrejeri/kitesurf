# #90 — Backup lógico, restauração local e rollback de `create_booking` (24/11/2026)

**Nada daqui altera o banco remoto.** Exportar e capturar são somente leitura; restaurar e ensaiar acontecem num PostgreSQL local descartável, por socket Unix. Sem infraestrutura nova, sem custo. Nunca em Turiva. Dump, credenciais e o script de rollback **não vão ao GitHub** nem ao repositório (os scripts recusam).

Escopo da aplicação (revisão do ChatGPT, comentário 7130203474): **somente** `20261116160000` → `20261116170000` → `20261124080301`. Não reaplicar 01–38, preservar 39–42, Protege 3B fechado.

## 0. Antes de tudo
- O backup **físico** gerenciado de 24/11/2026 05:06:44 UTC existe, mas só se restaura pelo painel do Supabase (e, sem PITR, em um projeto novo, que pode custar). Por isso este procedimento usa um **backup lógico** (`pg_dump`) próprio, que se restaura localmente.
- Quem executa: pessoa autorizada, com acesso ao banco, numa máquina com PostgreSQL 15+ (de preferência a mesma versão principal do servidor; o `manifest.txt` registra as duas), usuário **não-root** e `LANG=C.UTF-8`.
- Conexão por variáveis do libpq: `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` (ou `~/.pgpass`). Use a conexão direta ou o pooler em modo sessão (5432). Não coloque senha em URL nem em histórico.

## 1. Exportar o backup lógico (somente leitura)
```bash
export PGHOST=<host do projeto Kitesurf> PGPORT=5432 PGUSER=postgres.<ref> PGDATABASE=postgres   # PGPASSWORD via ~/.pgpass
OUT_DIR="$HOME/backups/kitesurf-$(date -u +%Y%m%dT%H%M%SZ)" \
CONFIRM_READONLY_EXPORT=sim EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw \
bash scripts/ops/90-export-logical-backup.sh
```
O script recusa: sem `CONFIRM_READONLY_EXPORT=sim`; host/usuário sem a referência `qadkqjfmmnxvovyyhqxw` (portanto a Turiva); `OUT_DIR` existente ou dentro de um repositório; sessão que não esteja `read_only`. Gera, com permissão 700: `public.dump` (schema `public`, dados, funções, políticas, permissões), `auth_user_ids.csv` (**só ids**, sem e-mail nem hash de senha), `fingerprints.txt`, `sha256.txt`, `manifest.txt` (data/hora UTC, versões, tamanho, SHA-256).
**Não cobre** os arquivos do Storage nem o conteúdo de `auth` além dos ids. Se isso importar para o ensaio, é uma etapa à parte.
Registrar no GitHub só: data/hora UTC, tamanho e SHA-256 do `public.dump` (do `manifest.txt`).

## 2. Restaurar localmente e conferir
```bash
BACKUP_DIR="$HOME/backups/kitesurf-<carimbo>" RESTORE_DIR="$HOME/restore-90" KEEP_RUNNING=1 \
bash scripts/ops/90-restore-local.sh
```
Confere o SHA-256 (recusa dump alterado), sobe um cluster só por socket, cria o stub do Supabase, carrega os ids, restaura o schema `public` e **compara** reservas, encontros, pedidos, ofertas, versões de preço, funções (corpo, defaults, definer, search_path, ACL), políticas, gatilhos e tabelas com RLS. Só diz PASS se tudo for idêntico à origem. Com `KEEP_RUNNING=1` o clone fica no ar para o passo 4. Para encerrar: `pg_ctl -D "$HOME/restore-90" -m fast stop && rm -rf "$HOME/restore-90"`.

## 3. Capturar o rollback exato (antes de aplicar qualquer coisa)
```bash
OUT_FILE="$HOME/backups/rollback_90.sql" CONFIRM_READONLY_EXPORT=sim EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw \
bash scripts/ops/90-capture-rollback.sh
```
Lê o estado **atual** e gera um script de rollback que, numa transação, remove o gatilho `request_00_distinct_civil_days` e a função `guard_request_distinct_civil_days()`, apaga as assinaturas atuais de `create_booking` e recria as **originais** com `pg_get_functiondef` (nomes de parâmetros, **DEFAULTs**, corpo, `SECURITY DEFINER`, `search_path`), restaura **dono, ACL (um GRANT por papel, após zerar) e comentário**, remove do ledger só as versões que não estavam registradas, e termina **conferindo** cada assinatura contra os valores gravados na captura. Qualquer diferença levanta exceção e **nada é aplicado**.
Isto cobre os dois riscos da `20261116170000`: ela faz `DROP` da assinatura de 6 argumentos (zerando ACL e dono) e a recria sem os 2 defaults que o projeto real tem hoje.

## 4. Ensaiar a cadeia no clone restaurado (nunca no remoto)
```bash
Q="psql -h $HOME/restore-90 -p 54790 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$Q -At -f scripts/ops/90-fingerprints.sql > antes.txt
# capture também o rollback no clone (ensaio): PGHOST=$HOME/restore-90 PGPORT=54790 PGUSER=postgres ALLOW_LOCAL_SOURCE=1 \
#   OUT_FILE=$HOME/rollback_clone.sql CONFIRM_READONLY_EXPORT=sim EXPECTED_PROJECT_REF=x bash scripts/ops/90-capture-rollback.sh
for f in 20261116160000_create_booking_legacy_safe_delegate 20261116170000_create_booking_six_args_no_defaults 20261124080301_guard_request_distinct_civil_days; do
  $Q -1 -f supabase/migrations/$f.sql || break
done
$Q -f supabase/reconciliation/90_request_distinct_civil_days.test.sql
$Q -At -f scripts/ops/90-fingerprints.sql > depois.txt; diff antes.txt depois.txt   # só 'functions' pode mudar
```
Esperado: `functions` e `triggers` mudam (create_booking e o gatilho novo); reservas, encontros, pedidos, ofertas e preços **idênticos**. Rodar também D1–D7 (`docs/CONSULTA_DERIVA_ANTES_DE_APLICAR.sql`) e `scenarios` de reservas de 2h e 4h. Depois, **executar o rollback no clone** e conferir que as impressões digitais voltam a ser iguais às de `antes.txt`.

## 5. Só depois, e só com aprovação por escrito
Aplicar no remoto, um arquivo por vez (`-1`), na ordem acima, em janela de baixo uso. Não use `supabase db push`. Verificar: 2 assinaturas de `create_booking`, ACLs, gatilho presente, impressões digitais de dados iguais, uma chamada de 2 encontros no mesmo dia rejeitada. Em falha: `psql -f rollback_90.sql`; só se houver dano de dados, restaurar o backup provado.

## O que o ensaio automático prova (`scripts/test-90-ops.sh`, roda no `test-db.sh`)
Exportação, restauração com SHA-256 e impressões digitais idênticas; dump adulterado recusado; recusas de origem local sem permissão, sem confirmação, saída dentro do repositório e host de outro projeto; captura → cadeia → rollback devolve assinaturas, defaults (2 e 1), corpo, definer, search_path, dono, ACL e comentário idênticos; rollback adulterado aborta sem mudar nada; ledger e gatilho restaurados; reaplicar depois do rollback reproduz o mesmo estado. Em fixture: **não substitui** o ensaio sobre o backup real.

## Limites conhecidos
- O ensaio usa um stub do Supabase (papéis `anon`, `authenticated`, `service_role`, `auth.uid()`); extensões, Storage, `auth` completo e Realtime não são reproduzidos.
- A ACL real pode ter papéis que não existem no clone (`supabase_admin`, etc.): o rollback zera e reaplica apenas papéis que existem; confira `proacl` no passo 3 contra o remoto.
- Hashes brutos do D1 divergem de propósito em seis funções (comentários e histórico); o D7 normalizado já as reconheceu. Isto não autoriza aplicar nada além das três migrations.

### Validação de origem antes de exportar ou capturar rollback

As duas rotinas usam `90-source-guard.sh`: a referência precisa ser exatamente a do Kitesurf, o banco deve ser `postgres`, o host direto deve corresponder ao projeto, ou o pooler Supabase deve usar `postgres.<referência>`. Conexões remotas usam porta de sessão 5432. `PGHOSTADDR`, `PGSERVICE`, `PGSERVICEFILE` e URLs em `PGDATABASE` são recusados para impedir que parâmetros alternativos desviem a conexão. Uma origem local exige `ALLOW_LOCAL_SOURCE=1` e continua restrita a `PGDATABASE=postgres`.

`bash scripts/test-90-source-guard.sh` valida essas recusas sem acessar banco ou rede. Esse teste não comprova que existe backup nem que um backup real foi restaurado; o ensaio em PostgreSQL descartável continua separado da homologação de recuperação do Supabase.

### Preservação no ensaio de rollback

O ensaio captura antes da aplicação a contagem e uma impressão digital determinística de todas as colunas de reservas e encontros. Depois do rollback compara com essa captura anterior; uma alteração de conteúdo com a mesma quantidade de linhas também é detectada. `scripts/test-90-booking-preservation.sh` verifica esse comportamento em cluster Unix descartável, sem exportar dados remotos. Isso valida o mecanismo de comparação, não substitui executar o ensaio completo nem restaurar um backup real.

Achado ainda aberto: `pg_dump`, a captura dos IDs de Auth e as impressões digitais da exportação são executados em transações separadas. Escritas concorrentes na origem podem produzir artefatos de instantes diferentes e uma divergência de restauração. Este procedimento ainda exige uma estratégia de snapshot consistente testada antes de declarar a exportação homologada sob concorrência; esta alteração não modifica o mecanismo de exportação.
