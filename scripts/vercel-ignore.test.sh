#!/usr/bin/env bash
# Casos de scripts/vercel-ignore.sh sobre un repo git temporal (no toca este repo).
# Uso: bash scripts/vercel-ignore.test.sh   → sale con 1 si algún caso falla.

set -u
script="$(cd "$(dirname "$0")" && pwd)/vercel-ignore.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp" || exit 1
git init -q -b main .
git config user.email "test@example.com"
git config user.name "test"
commit() { mkdir -p "$(dirname "$1")"; echo "$RANDOM" >> "$1"; git add -A; git commit -q -m "$2"; git rev-parse HEAD; }

base=$(commit apps/web/page.tsx "base")
web=$(commit apps/web/app/page.tsx "cambio en la web")
movil=$(commit apps/mobile/app/index.tsx "cambio en la app móvil")
eas=$(commit apps/mobile/eas.json "eas")
doc=$(commit docs/notas.md "docs")
pkg=$(commit packages/core/index.ts "paquete compartido")
lock=$(commit package-lock.json "dependencias")

fallas=0
caso() {
  local nombre="$1" esperado="$2"; shift 2
  local salida codigo
  salida=$(cd "$tmp/apps/web" 2>/dev/null || cd "$tmp"; env -i PATH="$PATH" HOME="$HOME" "$@" bash "$script")
  codigo=$?
  if [ "$codigo" = "$esperado" ]; then echo "ok   $nombre ($salida)"; else echo "FALLA $nombre: esperaba $esperado, dio $codigo ($salida)"; fallas=$((fallas+1)); fi
}

# exit 0 = no construir, exit 1 = construir
caso "rama sin [preview]"            0 VERCEL_GIT_COMMIT_REF=nube/x VERCEL_GIT_COMMIT_MESSAGE="arreglo"
caso "rama con [preview]"            1 VERCEL_GIT_COMMIT_REF=nube/x VERCEL_GIT_COMMIT_MESSAGE="pantalla nueva [preview]"
caso "deploy manual sin rama"        1
caso "main sin SHA anterior"         1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_COMMIT_SHA="$web"
caso "main con SHA desconocido"      1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA=0123456789abcdef0123456789abcdef01234567 VERCEL_GIT_COMMIT_SHA="$web"
caso "main: cambio en la web"        1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$base" VERCEL_GIT_COMMIT_SHA="$web"
caso "main: solo app móvil"          0 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$web" VERCEL_GIT_COMMIT_SHA="$movil"
caso "main: solo eas.json"           0 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$movil" VERCEL_GIT_COMMIT_SHA="$eas"
caso "main: solo docs"               0 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$eas" VERCEL_GIT_COMMIT_SHA="$doc"
caso "main: paquete compartido"      1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$doc" VERCEL_GIT_COMMIT_SHA="$pkg"
caso "main: lockfile"                1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$pkg" VERCEL_GIT_COMMIT_SHA="$lock"
caso "main: móvil + web juntos"      1 VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA="$base" VERCEL_GIT_COMMIT_SHA="$doc"

echo "fallas: $fallas"
[ "$fallas" -eq 0 ]
