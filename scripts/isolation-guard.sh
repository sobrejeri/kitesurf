#!/usr/bin/env bash
# Guarda de ISOLAMENTO de destino (#93, revisão independente de 23/11): decide se uma DATABASE_URL pode receber o ensaio de migrations.
# Só confere a URL e o DNS (nenhuma conexão). A segunda camada é a MARCA DENTRO DO BANCO (scripts/mark-isolated-db.sh), conferida por rehearse-chain.sh.
# Recusa (exit 2) quando:
#   1. a URL contém, em qualquer parte (usuário, host, banco, parâmetros; inclusive codificada com %XX ou em outra caixa), o ref do projeto real;
#   2. o host é gerenciado pelo Supabase (*.supabase.co, *.supabase.com, pooler) e ISOLATED_PROJECT_REF não foi informado, é igual ao ref real,
#      ou não aparece no host/usuário da URL (um alias ou outro projeto não passa por "isolado" só porque a string é diferente);
#   3. o host resolve para algum endereço do host do projeto real (alias de DNS, CNAME, IP direto).
# Aceita (exit 0): socket local/localhost/127.0.0.1/::1 e hosts Supabase com ref EXPLÍCITO diferente do real.
# Variáveis: REAL_PROJECT_REF (padrão qadkqjfmmnxvovyyhqxw), REAL_PROJECT_HOST (padrão db.<ref>.supabase.co), ISOLATED_PROJECT_REF,
#            ISOLATION_RESOLVER (comando que recebe um host e imprime IPs; padrão `getent ahosts`; existe para teste).
# Uso: scripts/isolation-guard.sh "$DATABASE_URL"
set -uo pipefail
URL="${1:-}"
REAL_REF="${REAL_PROJECT_REF:-qadkqjfmmnxvovyyhqxw}"
REAL_HOST="${REAL_PROJECT_HOST:-db.${REAL_REF}.supabase.co}"
RESOLVER="${ISOLATION_RESOLVER:-getent ahosts}"
refuse() { echo "RECUSADO (isolamento): $1" >&2; exit 2; }
[ -n "$URL" ] || refuse "DATABASE_URL vazia"

# decodifica %XX (3 voltas, sem python: o runner do CI não tem) e normaliza a caixa antes de procurar o ref real
pct_decode() { local v="$1" k; for k in 1 2 3; do v="$(printf '%b' "${v//%/\\x}")"; done; printf '%s' "$v"; }
decoded="$(pct_decode "$URL" | tr 'A-Z' 'a-z')"
case "$decoded" in *"$(echo "$REAL_REF" | tr 'A-Z' 'a-z')"*) refuse "a URL contém o ref do projeto real ($REAL_REF) em alguma parte";; esac

# host e usuário: postgresql://user:pass@HOST:port/db  ou  postgresql:///db?host=HOST&port=...
authority="$(printf '%s' "$URL" | sed -E 's#^[A-Za-z][A-Za-z0-9+.-]*://([^/?]*).*#\1#')"
case "$URL" in *://*) ;; *) authority="";; esac
userinfo=""; hostport="$authority"
case "$authority" in *@*) userinfo="${authority%@*}"; hostport="${authority##*@}";; esac
user="$(pct_decode "${userinfo%%:*}" | tr 'A-Z' 'a-z')"
host="$(printf '%s' "$hostport" | sed -E 's#^\[([^]]*)\].*#\1#; t; s#:[0-9]*$##')"
if [ -z "$host" ]; then   # forma por socket: ?host=...
  q="${URL#*\?}"; [ "$q" = "$URL" ] && q=""
  host="$(printf '%s' "$q" | tr '&' '\n' | sed -n 's/^host=//p' | head -1)"
  host="$(pct_decode "$host")"
fi
host="$(printf '%s' "$host" | tr 'A-Z' 'a-z')"
is_local=0
case "$host" in ''|localhost|127.0.0.1|::1|/*) is_local=1;; esac
case "$host" in *.supabase.co|*.supabase.com|*pooler*) is_local=0; managed=1;; *) managed=0;; esac

if [ "$managed" = 1 ]; then
  iso="$(echo "${ISOLATED_PROJECT_REF:-}" | tr 'A-Z' 'a-z')"
  [ -n "$iso" ] || refuse "host gerenciado pelo Supabase ($host): informe ISOLATED_PROJECT_REF com o ref do projeto ISOLADO"
  [ "$iso" != "$(echo "$REAL_REF" | tr 'A-Z' 'a-z')" ] || refuse "ISOLATED_PROJECT_REF é o ref do projeto real"
  case "$host $user" in *"$iso"*) ;; *) refuse "o ref informado ($iso) não aparece no host nem no usuário da URL: pode ser alias ou outro projeto";; esac
fi

# alias de DNS / IP direto: o destino não pode coincidir com o endereço do projeto real
if [ "$is_local" = 0 ] && [ -n "$host" ]; then
  mine="$($RESOLVER "$host" 2>/dev/null | awk '{print $1}' | sort -u)"
  real="$($RESOLVER "$REAL_HOST" 2>/dev/null | awk '{print $1}' | sort -u)"
  if [ -n "$mine" ] && [ -n "$real" ] && [ -n "$(comm -12 <(echo "$mine") <(echo "$real"))" ]; then
    refuse "o host $host resolve para o mesmo endereço do projeto real ($REAL_HOST): é um alias"
  fi
  if [ "$managed" = 0 ] && [ -z "$mine" ]; then refuse "o host $host não resolve e não é local: não dá para provar que é isolado"; fi
fi
echo "ok: destino aceito pela guarda de isolamento (host: ${host:-socket local})"
