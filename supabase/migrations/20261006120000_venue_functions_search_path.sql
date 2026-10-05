-- QPS-043: fijar search_path en las funciones de venues que marca el advisor
-- ("function_search_path_mutable").
--
-- Es seguro: los cuerpos de estas 6 funciones solo usan funciones nativas de
-- Postgres (lower, translate, regexp_replace, btrim, split_part, left, replace,
-- COALESCE, NULLIF) y objetos de `public` siempre calificados (public.venue_*,
-- public.venues). Con search_path = '' no se resuelve ningún nombre sin esquema,
-- así que el resultado no cambia.
--
-- Costo conocido: una función SQL con SET en la definición ya no se inlinea en
-- las consultas. Se usan en 3 índices de `venues` (venues_core_key_idx,
-- venues_name_trgm_idx, venues_canonical_norm_key; tabla chica) y en
-- resolve_venue_id. Medido en la base local (145 venues, PG 17):
--   * funciones sueltas: ~5 -> ~25 microsegundos por llamada;
--   * resolve_venue_id: ~11 -> ~21 ms sobre los 144 nombres no placeholder;
--   * los 3 índices siguen usándose (mismo plan en EXPLAIN);
--   * resultados idénticos (mismo md5 antes y después).

ALTER FUNCTION public.venue_sanitize(text)              SET search_path = '';
ALTER FUNCTION public.venue_normalize(text)             SET search_path = '';
ALTER FUNCTION public.venue_core_key(text)              SET search_path = '';
ALTER FUNCTION public.venue_useful_address(text, text)  SET search_path = '';
ALTER FUNCTION public.venue_slugify(text)               SET search_path = '';
ALTER FUNCTION public.venue_canonical_of(uuid)          SET search_path = '';
