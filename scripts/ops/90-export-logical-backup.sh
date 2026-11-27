#!/usr/bin/env bash
# #90 — Exporta o BACKUP LÓGICO do Supabase Kitesurf para uma pasta LOCAL, somente leitura.
# Quem roda: pessoa autorizada, com acesso ao banco. O dump e as credenciais NUNCA vão para o GitHub nem para dentro do repositório.
#
# Conexão: variáveis padrão do libpq (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD ou ~/.pgpass). Nada de URL com senha na linha de comando.
#   Use a conexão direta ou o pooler em modo sessão (porta 5432). Não use o pooler em modo transação (6543) para pg_dump.
# Exige: CONFIRM_READONLY_EXPORT=sim, EXPECTED_PROJECT_REF=qadkqjfmmnxvovyyhqxw (host direto ou pooler/usuário exatos; recusa outro projeto),
#        OUT_DIR=<pasta nova, fora de qualquer repositório git>.
# O que sai: public.dump (formato custom, schema public com dados e permissões), auth_user_ids.csv (SÓ ids, sem e-mail nem hash de senha), manifest.txt.
# Não inclui: Storage (arquivos), o schema auth além dos ids, segredos. Ver docs/PROCEDIMENTO_BACKUP_RESTAURACAO_ROLLBACK_90.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${OUT_DIR:?defina OUT_DIR (pasta nova, fora do repositório)}"
[ "${CONFIRM_READONLY_EXPORT:-}" = "sim" ] || { echo "Defina CONFIRM_READONLY_EXPORT=sim (esta rotina só lê o banco)." >&2; exit 2; }
source "$ROOT/scripts/ops/90-source-guard.sh"
guard_kitesurf_source
REF="$EXPECTED_PROJECT_REF"
case "$(cd "$(dirname "$OUT_DIR")" 2>/dev/null && pwd)/$(basename "$OUT_DIR")" in "$ROOT"/*) echo "OUT_DIR dentro do repositório: recusado (o dump não pode ser commitado)." >&2; exit 2;; esac
if git -C "$(dirname "$OUT_DIR")" rev-parse --git-dir >/dev/null 2>&1; then echo "OUT_DIR está dentro de um repositório git: recusado." >&2; exit 2; fi
[ ! -e "$OUT_DIR" ] || { echo "OUT_DIR já existe: use uma pasta nova (nunca sobrescreve backup)." >&2; exit 2; }
umask 077; mkdir -p "$OUT_DIR"
export PGOPTIONS="-c default_transaction_read_only=on"
PSQL=(psql -X -v ON_ERROR_STOP=1 -q -At)

"${PSQL[@]}" -c "select 'read_only='||current_setting('transaction_read_only')" | grep -q 'read_only=on' || { echo "A sessão não está somente leitura." >&2; exit 1; }
{
  echo "exportado_em_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "servidor=$("${PSQL[@]}" -c 'show server_version')"
  echo "cliente_pg_dump=$(pg_dump --version)"
  echo "projeto_ref=$REF"
} > "$OUT_DIR/manifest.txt"
pg_dump -Fc -n public --no-owner --serializable-deferrable -f "$OUT_DIR/public.dump"
"${PSQL[@]}" -c "\copy (select id from auth.users order by id) to '$OUT_DIR/auth_user_ids.csv' csv"
"${PSQL[@]}" -f "$ROOT/scripts/ops/90-fingerprints.sql" > "$OUT_DIR/fingerprints.txt"
( cd "$OUT_DIR" && sha256sum public.dump auth_user_ids.csv fingerprints.txt > sha256.txt )
{ echo "tamanho_dump_bytes=$(wc -c < "$OUT_DIR/public.dump")"; cat "$OUT_DIR/sha256.txt"; } >> "$OUT_DIR/manifest.txt"
echo "OK: backup lógico em $OUT_DIR (não envie ao GitHub)."; cat "$OUT_DIR/manifest.txt"
