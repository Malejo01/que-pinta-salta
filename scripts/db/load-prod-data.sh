#!/usr/bin/env bash
# Baja los DATOS de producción y los carga en la base local de Supabase, para
# probar migraciones (p. ej. las de las ramas) contra datos reales.
#
# - Solo lee de prod (pg_dump --data-only).
# - Vuelca el schema public completo y, de auth, solo users e identities (las
#   FK de profiles las necesitan). Sesiones, tokens y logs de auth no se bajan.
# - El dump tiene emails de usuarios: queda en supabase/.data-dumps/, que está
#   en .gitignore. NUNCA lo commitees ni lo compartas.
# - Resetea la base local (supabase db reset) antes de cargar: se pierde lo
#   que haya en local.
#
# Requisitos: Docker corriendo, `npx supabase start` hecho y
# POSTGRES_URL_NON_POOLING en apps/web/.env.local.
#
# Uso: bash scripts/db/load-prod-data.sh            # baja y carga
#      bash scripts/db/load-prod-data.sh --reuse    # carga el último dump bajado
set -euo pipefail
cd "$(dirname "$0")/../.."

PG_IMAGE=${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}
LOCAL_DB_CONTAINER=${LOCAL_DB_CONTAINER:-supabase_db_que-pinta-salta}
DUMP_DIR=supabase/.data-dumps
mkdir -p "$DUMP_DIR"

if ! git check-ignore -q "$DUMP_DIR/x.sql"; then
  echo "$DUMP_DIR no está en .gitignore: no sigo (el dump tiene emails)." >&2
  exit 2
fi

if [ "${1:-}" != "--reuse" ]; then
  PROD_URL=$(grep -E '^\s*POSTGRES_URL_NON_POOLING\s*=' apps/web/.env.local | head -1 | cut -d= -f2- | tr -d '"\r' | sed 's/^ *//;s/ *$//')
  if [ -z "$PROD_URL" ]; then echo "Falta POSTGRES_URL_NON_POOLING en apps/web/.env.local" >&2; exit 2; fi

  echo "Bajando datos de public..."
  MSYS_NO_PATHCONV=1 docker run --rm "$PG_IMAGE" pg_dump "$PROD_URL" \
    --data-only --no-owner --no-privileges --schema=public \
    > "$DUMP_DIR/public.sql"

  echo "Bajando auth.users y auth.identities..."
  MSYS_NO_PATHCONV=1 docker run --rm "$PG_IMAGE" pg_dump "$PROD_URL" \
    --data-only --no-owner --no-privileges \
    --table=auth.users --table=auth.identities \
    > "$DUMP_DIR/auth.sql"
fi

for f in auth public; do
  [ -s "$DUMP_DIR/$f.sql" ] || { echo "Falta $DUMP_DIR/$f.sql (corré sin --reuse)" >&2; exit 2; }
done

echo "Reseteando la base local (migraciones de supabase/migrations/)..."
npx --no-install supabase db reset > /dev/null

echo "Cargando..."
# session_replication_role=replica: no dispara triggers (on_auth_user_created
# duplicaría los perfiles) ni chequea FKs mientras carga en cualquier orden.
{
  echo "SET session_replication_role = replica;"
  cat "$DUMP_DIR/auth.sql" "$DUMP_DIR/public.sql"
  echo "SET session_replication_role = DEFAULT;"
} | docker exec -i "$LOCAL_DB_CONTAINER" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 > /dev/null

docker exec -i "$LOCAL_DB_CONTAINER" psql -U postgres -d postgres -X -At -c "
  select 'auth.users=' || (select count(*) from auth.users)
    || ' profiles=' || (select count(*) from public.profiles)
    || ' events=' || (select count(*) from public.events)
    || ' venues=' || (select count(*) from public.venues)
    || ' instagram_flyers=' || (select count(*) from public.instagram_flyers)
    || ' cinema_movies=' || (select count(*) from public.cinema_movies)"
echo "Listo. Base local: postgresql://postgres:postgres@127.0.0.1:54322/postgres"
