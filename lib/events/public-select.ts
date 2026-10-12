/**
 * Columnas de `events` que la UI pública puede recibir (QPS-095).
 *
 * `events.merge_audit` guarda, en cada fusión, el snapshot completo del
 * evento absorbido (y, en la fusión manual, el id del admin que fusionó). No
 * se puede revocar la columna a `anon` sin romper todos los `select('*')`
 * existentes, así que las consultas públicas listan las columnas de forma
 * explícita en vez de traer `*`.
 *
 * Quedan afuera a propósito (no son de la UI pública):
 * - `merge_audit`: snapshot de fusiones, incluye quién fusionó.
 * - `dedup_key`: clave interna de deduplicación.
 * - `ai_metadata`: metadata cruda del modelo de clasificación.
 * - `created_by`: id del admin/usuario que creó la fila.
 *
 * Sin imports de Next ni de Supabase: lo reusa también la app móvil.
 */
export const PUBLIC_EVENT_COLUMNS = [
  'id',
  'title',
  'slug',
  'description',
  'short_description',
  'category_id',
  'venue_id',
  'scrape_source_key',
  'classification_source',
  'image_url',
  'gallery_urls',
  'start_date',
  'end_date',
  'is_recurring',
  'recurrence_rule',
  'price_min',
  'price_max',
  'is_free',
  'ticket_url',
  'ticket_sources',
  'is_commercial',
  'age_restriction',
  'tags',
  'status',
  'is_featured',
  'view_count',
  'created_at',
  'updated_at',
] as const

// El string que arma `Array.join` en runtime tipa como `string` a secas (no
// como un literal), así que supabase-js no puede inferir con él las columnas
// del `.select()`: el resultado de la consulta queda como `GenericStringError`
// a nivel de tipos (igual de "ancho" que `*`, pero sin pedir `*` a la base).
// Los sitios que llaman `.select(PUBLIC_EVENT_SELECT)` resuelven esto
// convirtiendo el resultado con `as unknown as …` en vez de `as …` (ver
// lib/data.ts y app/favoritos/page.tsx).
export const PUBLIC_EVENT_SELECT = `${PUBLIC_EVENT_COLUMNS.join(', ')}, category:categories(*), venue:venues(*)`
