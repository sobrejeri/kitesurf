#!/usr/bin/env bash
# "Migration aplicada não se edita" (AGENTS.md; pedido de 23/11 de não modificar as migrations 39–42): confere que cada migration listada em
# supabase/migrations.applied.sha256 continua EXATAMENTE como foi registrada. Editar um arquivo listado faz o CI falhar; migrations novas não precisam constar.
# Para registrar uma migration que passou a estar aplicada no Supabase real (ledger): scripts/check-migrations-immutable.sh --add <arquivo.sql>  (só depois de conferida contra o ledger).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAN="$ROOT/supabase/migrations.applied.sha256"
if [ "${1:-}" = "--add" ]; then
  f="${2:?arquivo}"; base="$(basename "$f")"
  grep -q " $base\$" "$MAN" 2>/dev/null && { echo "já registrada: $base" >&2; exit 1; }
  (cd "$ROOT/supabase/migrations" && sha256sum "$base") >> "$MAN"; echo "registrada: $base"; exit 0
fi
[ -f "$MAN" ] || { echo "FALTA $MAN" >&2; exit 2; }
fail=0; n=0
while read -r hash name; do
  [ -n "$hash" ] || continue; n=$((n + 1))
  file="$ROOT/supabase/migrations/$name"
  if [ ! -f "$file" ]; then echo "FALHOU: migration aplicada sumiu do repositório: $name" >&2; fail=1; continue; fi
  got="$(sha256sum "$file" | cut -d' ' -f1)"
  if [ "$got" != "$hash" ]; then echo "FALHOU: migration APLICADA foi editada: $name (registrada $hash, atual $got). Crie a próxima migration em vez de editar." >&2; fail=1; fi
done < "$MAN"
[ "$fail" = 0 ] || exit 1
# as migrations 39 a 42 do histórico real têm de estar no manifesto
for v in 20261109000039 20261109000040 20261110000041 20261110000042; do
  grep -q " ${v}_" "$MAN" || { echo "FALHOU: a migration $v (39–42) precisa constar no manifesto" >&2; exit 1; }
done
echo "PASS: $n migrations aplicadas intactas (inclui 39–42 e os 3 hotfixes de 23/11)"
