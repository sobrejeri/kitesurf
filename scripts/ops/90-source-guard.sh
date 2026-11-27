#!/usr/bin/env bash
# Shared source identity guard. Sourcing/executing this file never contacts a DB.
guard_kitesurf_source() {
  [[ "${EXPECTED_PROJECT_REF:-}" = qadkqjfmmnxvovyyhqxw ]] || { echo 'Referência diferente do projeto Kitesurf: recusado.' >&2; return 2; }
  # libpq can otherwise take connection parameters from these alternate inputs.
  [[ -z "${PGHOSTADDR:-}" && -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" ]] || { echo 'Parâmetros alternativos de conexão: recusado.' >&2; return 2; }
  # libpq accepts comma-separated host/port lists; an absolute first socket
  # must never allow a later remote host through the local-source branch.
  [[ "${PGHOST:-}" != *,* && "${PGPORT:-}" != *,* ]] || { echo 'Listas de hosts ou portas: recusado.' >&2; return 2; }
  [[ "${PGDATABASE:-}" = postgres ]] || { echo 'Defina PGDATABASE=postgres (sem URL de conexão).' >&2; return 2; }
  if [[ "${PGHOST:-}" != /* && "${PGPORT:-5432}" != 5432 ]]; then echo 'Use porta de sessão 5432.' >&2; return 2; fi
  if [[ "${PGHOST:-}" = /* ]]; then
    [[ "${ALLOW_LOCAL_SOURCE:-}" = 1 ]] || { echo 'Origem local exige ALLOW_LOCAL_SOURCE=1.' >&2; return 2; }
    return 0
  fi
  if [[ "${PGHOST:-}" = db.qadkqjfmmnxvovyyhqxw.supabase.co ]]; then return 0; fi
  if [[ "${PGHOST:-}" =~ ^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$ && "${PGUSER:-}" = postgres.qadkqjfmmnxvovyyhqxw ]]; then return 0; fi
  echo 'Origem diferente do projeto Kitesurf: recusado.' >&2; return 2
}
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then guard_kitesurf_source; fi
