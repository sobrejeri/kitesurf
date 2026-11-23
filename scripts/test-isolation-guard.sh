#!/usr/bin/env bash
# Tabela de decisão da guarda de isolamento (scripts/isolation-guard.sh): recusas e aceites, com DNS FALSO (nenhuma rede, nenhum banco).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
# resolvedor falso: o host real e o alias apontam para o mesmo IP; o isolado para outro
cat > "$tmp/resolver" <<'R'
#!/usr/bin/env bash
case "$1" in
  db.qadkqjfmmnxvovyyhqxw.supabase.co|alias-do-real.example.com|10.0.0.5) echo "10.0.0.5 STREAM $1";;
  db.isolado123abc.supabase.co) echo "10.0.0.9 STREAM $1";;
  db.isolado123abc.supabase.co.alias.example.com) echo "10.0.0.5 STREAM $1";;
  outro.example.com) echo "10.0.0.7 STREAM $1";;
  *) ;;
esac
R
chmod +x "$tmp/resolver"
run() { ISOLATION_RESOLVER="$tmp/resolver" "$@"; }
want() { # $1=esperado(0|2) $2=descrição $3=URL  [$4=ISOLATED_PROJECT_REF]
  set +e; out="$(ISOLATED_PROJECT_REF="${4:-}" ISOLATION_RESOLVER="$tmp/resolver" bash "$ROOT/scripts/isolation-guard.sh" "$3" 2>&1)"; rc=$?; set -e
  [ "$rc" -eq "$1" ] || { echo "FALHOU: $2 (esperado $1, obteve $rc): $out" >&2; exit 1; }
}
# ---- recusas (exit 2) ----
want 2 "URL vazia" ""
want 2 "ref real no host" "postgresql://postgres:x@db.qadkqjfmmnxvovyyhqxw.supabase.co:5432/postgres" isolado123abc
want 2 "ref real em maiúsculas" "postgresql://postgres:x@db.QADKQJFMMNXVOVYYHQXW.supabase.co:5432/postgres" isolado123abc
want 2 "ref real codificado com %XX" "postgresql://postgres:x@db.%71adkqjfmmnxvovyyhqxw.supabase.co:5432/postgres" isolado123abc
want 2 "ref real no usuário do pooler" "postgresql://postgres.qadkqjfmmnxvovyyhqxw:x@aws-0-sa.pooler.supabase.com:6543/postgres" isolado123abc
want 2 "ref real num parâmetro" "postgresql://postgres:x@localhost:5432/postgres?options=project%3Dqadkqjfmmnxvovyyhqxw"
want 2 "host Supabase sem ISOLATED_PROJECT_REF" "postgresql://postgres:x@db.isolado123abc.supabase.co:5432/postgres"
want 2 "ISOLATED_PROJECT_REF igual ao real" "postgresql://postgres:x@db.isolado123abc.supabase.co:5432/postgres" qadkqjfmmnxvovyyhqxw
want 2 "ref informado não aparece no host/usuário (alias de outro projeto)" "postgresql://postgres:x@db.isolado123abc.supabase.co:5432/postgres" outroref999
want 2 "alias de DNS que resolve para o host real" "postgresql://postgres:x@alias-do-real.example.com:5432/postgres"
want 2 "IP direto do host real" "postgresql://postgres:x@10.0.0.5:5432/postgres"
want 2 "host Supabase isolado cujo DNS aponta ao real" "postgresql://postgres:x@db.isolado123abc.supabase.co.alias.example.com:5432/postgres"
want 2 "host remoto que não resolve" "postgresql://postgres:x@nao-existe.example.com:5432/postgres"
# ---- aceites (exit 0) ----
want 0 "socket local" "postgresql:///postgres?host=/tmp/pgsock&port=5432&user=postgres"
want 0 "localhost" "postgresql://postgres:x@localhost:5432/postgres"
want 0 "127.0.0.1" "postgresql://postgres:x@127.0.0.1:5432/postgres"
want 0 "projeto Supabase isolado com ref explícito" "postgresql://postgres:x@db.isolado123abc.supabase.co:5432/postgres" isolado123abc
want 0 "pooler do projeto isolado (ref no usuário)" "postgresql://postgres.isolado123abc:x@aws-0-sa.pooler.supabase.com:6543/postgres" isolado123abc
want 0 "host remoto próprio que resolve para outro IP" "postgresql://postgres:x@outro.example.com:5432/postgres"
echo "PASS: guarda de isolamento: 12 recusas (ref real em qualquer forma, host Supabase sem ref, alias de DNS, IP direto, host que não resolve) e 6 aceites"
