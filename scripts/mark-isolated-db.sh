#!/usr/bin/env bash
# Grava, NO BANCO ISOLADO, a marca que rehearse-chain.sh exige (segunda camada da guarda de isolamento). Rode UMA vez, por um humano, no clone/projeto isolado
# depois de restaurar o dump. Passa pela mesma guarda de URL: não marca o projeto real. O banco real nunca recebe a marca por este fluxo.
# Uso: DATABASE_URL='...isolado...' ISOLATED_PROJECT_REF='<ref>' CONFIRM_ISOLATED=sim bash scripts/mark-isolated-db.sh   (local: ref = local)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?Defina DATABASE_URL}"
[ "${CONFIRM_ISOLATED:-}" = "sim" ] || { echo "Recusado: defina CONFIRM_ISOLATED=sim." >&2; exit 2; }
bash "$ROOT/scripts/isolation-guard.sh" "$DATABASE_URL" >/dev/null
REF="${ISOLATED_PROJECT_REF:-local}"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q -v ref="$REF" <<'SQL'
create table if not exists public.zz_isolated_rehearsal_marker (project_ref text primary key, marked_at timestamptz not null default now(), note text not null default 'ensaio isolado');
revoke all on public.zz_isolated_rehearsal_marker from public, anon, authenticated;
insert into public.zz_isolated_rehearsal_marker (project_ref) values (:'ref') on conflict (project_ref) do nothing;
SQL
echo "marca gravada em banco isolado (ref: $REF)"
