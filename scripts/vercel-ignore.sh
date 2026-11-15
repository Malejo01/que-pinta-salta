#!/usr/bin/env bash
# Ignored Build Step de Vercel (apps/web/vercel.json › ignoreCommand).
#
# Vercel lo corre antes de cada build, desde el Root Directory del proyecto (apps/web):
#   exit 0 = NO construir (Vercel cancela el deploy sin gastar Build CPU)
#   exit 1 = construir
#
# Reglas:
#   - Ramas que no son main (previews): solo si el último commit dice [preview].
#   - main (producción): solo si cambió algo que afecta a la web. La app móvil
#     (apps/mobile/**, eas.json) y los docs no construyen la web.
#   - Ante la duda (sin SHA anterior, clone superficial, git falla): construir.
#     Mejor gastar un build de más que saltear un deploy real.
#
# Se puede probar en local sin Vercel, pasando las variables a mano:
#   VERCEL_GIT_COMMIT_REF=main VERCEL_GIT_PREVIOUS_SHA=<sha> VERCEL_GIT_COMMIT_SHA=<sha> bash scripts/vercel-ignore.sh
#   VERCEL_GIT_COMMIT_REF=mi-rama VERCEL_GIT_COMMIT_MESSAGE="algo [preview]" bash scripts/vercel-ignore.sh
# o con los casos del test: bash scripts/vercel-ignore.test.sh

set -u

construir() { echo "vercel-ignore: CONSTRUIR — $1"; exit 1; }
saltear() { echo "vercel-ignore: NO construir — $1"; exit 0; }

ref="${VERCEL_GIT_COMMIT_REF:-}"
mensaje="${VERCEL_GIT_COMMIT_MESSAGE:-}"
anterior="${VERCEL_GIT_PREVIOUS_SHA:-}"
actual="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Sin rama conocida (deploy manual desde el panel o la CLI): construir
if [ -z "$ref" ]; then
  construir "sin VERCEL_GIT_COMMIT_REF (deploy manual)"
fi

if [ "$ref" != "main" ]; then
  case "$mensaje" in
    *"[preview]"*) construir "rama $ref con [preview] en el último commit" ;;
    *) saltear "rama $ref sin [preview] en el último commit (la verificación la hace GitHub Actions)" ;;
  esac
fi

# main: ¿cambió algo de la web entre el deploy anterior y este?
if [ -z "$anterior" ]; then
  construir "main sin VERCEL_GIT_PREVIOUS_SHA (primer deploy o redeploy)"
fi

raiz="$(git rev-parse --show-toplevel 2>/dev/null)" || construir "no se encontró el repo git"

if ! git -C "$raiz" cat-file -e "${anterior}^{commit}" 2>/dev/null; then
  construir "main: el commit anterior ${anterior:0:7} no está en el clone (superficial)"
fi

# Rutas que afectan la web. Lo de la app móvil queda afuera con las exclusiones.
rutas=(
  apps/web
  packages
  package.json
  package-lock.json
  turbo.json
  vercel.json
  ':(exclude)apps/mobile'
  ':(exclude)**/eas.json'
)

git -C "$raiz" diff --quiet "$anterior" "$actual" -- "${rutas[@]}"
estado=$?
case "$estado" in
  0) saltear "main sin cambios en la web entre ${anterior:0:7} y ${actual:0:7}" ;;
  1) construir "main con cambios en la web entre ${anterior:0:7} y ${actual:0:7}" ;;
  *) construir "git diff falló (código $estado)" ;;
esac
