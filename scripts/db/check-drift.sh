#!/usr/bin/env bash
# Compara el esquema de producción contra el que reconstruyen las migraciones
# de supabase/migrations/. Sale con código 1 si hay alguna diferencia.
#
# Requisitos: Docker corriendo, `supabase start` hecho (la base local tiene que
# estar al día: `npx supabase db reset` si cambiaron las migraciones) y
# POSTGRES_URL_NON_POOLING en .env.local (connection string de prod, pooler en
# modo sesión). Solo lee de prod.
#
# Uso: bash scripts/db/check-drift.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

PROD_URL=$(grep -E '^\s*POSTGRES_URL_NON_POOLING\s*=' .env.local | head -1 | cut -d= -f2- | tr -d '"\r' | sed 's/^ *//;s/ *$//')
if [ -z "$PROD_URL" ]; then echo "Falta POSTGRES_URL_NON_POOLING en .env.local" >&2; exit 2; fi

PG_IMAGE=${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}
LOCAL_DB_CONTAINER=${LOCAL_DB_CONTAINER:-supabase_db_que-pinta-salta}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
drift=0

# 1) supabase db diff: arma una base shadow con las migraciones y la compara
#    contra prod (no la base local).
for schema in public storage; do
  out=$(npx --no-install supabase db diff --db-url "$PROD_URL" --schema "$schema" 2>&1)
  if echo "$out" | grep -q 'No schema changes found'; then
    echo "db diff --schema $schema: sin diferencias"
  else
    echo "db diff --schema $schema: HAY DIFERENCIAS"
    echo "$out" | grep -v -i 'postgres://' | tail -20
    drift=1
  fi
done

# 2) Huella del catálogo: políticas, grants, cuerpos de función, triggers de
#    auth.users, buckets... contra la base local.
MSYS_NO_PATHCONV=1 docker run --rm -i "$PG_IMAGE" psql "$PROD_URL" -X -At -v ON_ERROR_STOP=1 \
  < scripts/db/schema-fingerprint.sql > "$TMP/prod.txt" || { echo "falló la huella de prod" >&2; exit 2; }
docker exec -i "$LOCAL_DB_CONTAINER" psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1 \
  < scripts/db/schema-fingerprint.sql > "$TMP/local.txt" || { echo "falló la huella local" >&2; exit 2; }

if diff "$TMP/prod.txt" "$TMP/local.txt" > "$TMP/fp.diff"; then
  echo "huella del catálogo: $(wc -l < "$TMP/prod.txt") líneas, sin diferencias"
else
  echo "huella del catálogo: HAY DIFERENCIAS (< prod, > local)"
  cat "$TMP/fp.diff"
  drift=1
fi

exit $drift
