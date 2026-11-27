#!/usr/bin/env bash
# Run before initdb, pg_ctl, psql or pg_restore. No DB access here.
guard_local_restore_target() {
  [[ -z "${PGHOSTADDR:-}" && -z "${PGSERVICE:-}" && -z "${PGSERVICEFILE:-}" ]] || { echo 'Restore recusa parâmetros alternativos libpq.' >&2; return 2; }
  # pg_ctl -o parses a string; libpq parses commas as destination lists.
  [[ "${RESTORE_DIR:-}" =~ ^/[A-Za-z0-9_./-]+$ && "${BACKUP_DIR:-}" =~ ^/[A-Za-z0-9_./-]+$ ]] || {
    echo 'Restore exige caminhos absolutos simples, sem espaços, aspas ou listas.' >&2; return 2;
  }
  case "/${RESTORE_DIR#/}/" in */./*|*/../*) echo 'Restore recusa segmentos . e .. no destino.' >&2; return 2 ;; esac
  case "/${BACKUP_DIR#/}/" in */./*|*/../*) echo 'Restore recusa segmentos . e .. na origem.' >&2; return 2 ;; esac
  local port="${PORT:-54790}"
  [[ "$port" =~ ^[0-9]{4,5}$ ]] && (( 10#$port >= 1024 && 10#$port <= 65535 )) || {
    echo 'Porta local inválida.' >&2; return 2;
  }
}
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then guard_local_restore_target; fi
