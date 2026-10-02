# Migraciones legacy (no se aplican)

Estas 29 migraciones son la historia del esquema hasta el 2026-10-02. **Ya están
contenidas en el baseline** `supabase/migrations/20261002160000_baseline.sql`,
que es un volcado del esquema real de producción. Supabase CLI no las lee: solo
aplica lo que está en `supabase/migrations/`.

Se guardan como referencia, para entender por qué el esquema es como es. No las
corras contra ninguna base.

## Por qué hubo que hacer un baseline

Hasta el Sprint 2, `supabase_migrations.schema_migrations` en producción tenía
registrada solo `20260525 clasificacion` de las 23 migraciones del repo, más las
6 que se aplicaron por MCP en los Sprints 0 y 1. El resto se había corrido a mano
en el SQL Editor o no se había corrido nunca. Además había políticas activas en
producción que no estaban en ningún archivo (`events`, `profiles`, `favorites`,
`aliases`, storage). Con eso, el repo no podía reconstruir producción.

Algunas de estas migraciones **no reflejan lo que hay en producción**:

- `20260729_enable_rls_event_views.sql` nunca se aplicó; la tabla `event_views`
  se borró en el Sprint 0 (`20261002133100_drop_event_views.sql`).
- `20260525_clasificacion.sql` está registrada en prod con la versión `20260525`.
- Las de los Sprints 0 y 1 (`20261002*`) se registraron en prod con la versión
  que les puso el MCP al aplicarlas (`20261002132823`, `…132935`, `…133507`,
  `…133610`, `…141305`, `…141522`), no con la del nombre del archivo.

En producción, todas esas versiones viejas se marcan como `reverted` en el
historial y el baseline como `applied` (`supabase migration repair`). Ver
`docs/PENDIENTES.md`, Sprint 2.

## Migraciones nuevas

Van en `supabase/migrations/` con nombre `YYYYMMDDHHMMSS_descripcion.sql`, con
una versión posterior al baseline. El workflow de CI (`.github/workflows/ci.yml`)
las aplica todas sobre una base vacía en cada push.
