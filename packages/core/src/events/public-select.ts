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
 * - `featured_set_by` (QPS-239): igual que `created_by` pero para el
 *   destacado — el id del admin que lo marcó. Auditoría del panel, no de la
 *   UI pública: solo la lee `lib/admin/destacados-actions.ts`.
 * - `featured_set_at` (QPS-239): igual que `created_by` pero para el
 *   destacado — el momento en que un admin lo marcó. Auditoría del panel,
 *   no de la UI pública: solo la lee `lib/admin/destacados-actions.ts`.
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
  'featured_until',
  'view_count',
  'created_at',
  'updated_at',
] as const

/** Solo las columnas de `events`, sin joins: para consultas con su propio join. */
export const PUBLIC_EVENT_ROW_SELECT = PUBLIC_EVENT_COLUMNS.join(', ')

// El string que arma `Array.join` en runtime tipa como `string` a secas (no
// como un literal), así que supabase-js no puede inferir con él las columnas
// del `.select()`: el resultado de la consulta queda como `GenericStringError`
// a nivel de tipos (igual de "ancho" que `*`, pero sin pedir `*` a la base).
// Los sitios que llaman `.select(PUBLIC_EVENT_SELECT)` resuelven esto
// convirtiendo el resultado con `as unknown as …` en vez de `as …` (ver
// lib/data.ts y app/favoritos/page.tsx).
export const PUBLIC_EVENT_SELECT = `${PUBLIC_EVENT_ROW_SELECT}, category:categories(*), venue:venues(*)`

/**
 * Columnas para las pantallas de revisión del admin (`/admin/revision`,
 * `/admin/pendientes`, QPS-108): las públicas más `ai_metadata`, que usa
 * `components/draft-events-manager.tsx`. `merge_audit`, `dedup_key` y
 * `created_by` siguen afuera: ninguna pantalla de admin las lee.
 */
export const ADMIN_REVIEW_EVENT_ROW_SELECT = [...PUBLIC_EVENT_COLUMNS, 'ai_metadata'].join(', ')
