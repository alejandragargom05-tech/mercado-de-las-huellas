#!/usr/bin/env bash
# Abre un issue en el repositorio, o actualiza el que ya esté abierto con el mismo título (así no se llena de repetidos).
# Uso: scripts/abrir_issue.sh "Título sin comillas" archivo-con-el-cuerpo.md   (necesita gh y GH_TOKEN)
set -euo pipefail
titulo="$1"
cuerpo="$2"
numero=$(gh issue list --state open --search "\"$titulo\" in:title" --json number,title \
  --jq "map(select(.title == \"$titulo\")) | .[0].number // empty")
if [ -n "$numero" ]; then
  gh issue edit "$numero" --body-file "$cuerpo"
  echo "Issue #$numero actualizado."
else
  gh issue create --title "$titulo" --body-file "$cuerpo"
fi
