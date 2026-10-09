-- Ronda 17 (17-b): políticas de RLS de `public` con `(select auth.uid())` /
-- `(select public.is_admin())` en vez de la llamada suelta (aviso
-- "auth_rls_initplan" del Performance Advisor de Supabase: sin el `select`,
-- Postgres re-evalúa la función por cada fila en vez de una sola vez por
-- consulta) y, por tabla/rol/acción, una sola policy PERMISSIVE (aviso
-- "multiple_permissive_policies": cuando dos políticas permisivas cubren el
-- mismo rol y la misma acción, Postgres evalúa las dos y las combina con OR,
-- que es más trabajo que una sola).
--
-- Es una migración de rendimiento y de orden, no de seguridad: el objetivo es
-- que cada tabla deje pasar exactamente el mismo acceso que hoy. El inventario
-- de "antes/después" está en la tarea 17-b; la matriz de la tarea 17-a
-- (supabase/tests/database/rls_matriz.test.sql, que esta migración no toca)
-- es la que lo verifica fila por fila.
--
-- `job_runs` y `event_metrics_daily` no aparecen abajo: sus policies (ver
-- supabase/migrations/20261002175200_job_runs.sql y
-- supabase/migrations/20261005120000_event_metrics.sql) ya están en la forma
-- final — `(select public.is_admin())`, una sola policy de SELECT, `to
-- authenticated` explícito, sin policy de escritura ni para admin — así que
-- no hace falta tocarlas.
--
-- Todo en una sola transacción implícita (el runner de Supabase ejecuta cada
-- archivo de migración como un único mensaje de consulta simple a Postgres,
-- que ya corre todas sus sentencias en una transacción): si algo falla a
-- mitad, se deshace entero. No se usa CONCURRENTLY en ningún lado.

-- ===========================================================================
-- EVENTS
-- ===========================================================================

drop policy if exists "Allow read for published or owner or admin" on public.events;
drop policy if exists "Allow insert for owner or admin" on public.events;
drop policy if exists "Allow update for owner or admin" on public.events;
drop policy if exists "Allow delete for owner or admin" on public.events;

create policy "lectura pública o del dueño o admin"
  on public.events for select
  to anon, authenticated
  using (
    status = 'PUBLISHED'::event_status
    or (select auth.uid()) = created_by
    or (select public.is_admin())
  );

create policy "inserción del dueño o admin"
  on public.events for insert
  to authenticated
  with check (
    ((select auth.uid()) = created_by and (status = 'DRAFT'::event_status or status is null))
    or (select public.is_admin())
  );

create policy "actualización del dueño o admin"
  on public.events for update
  to authenticated
  using ((select auth.uid()) = created_by or (select public.is_admin()))
  with check (
    (select public.is_admin())
    or ((select auth.uid()) = created_by and status = 'DRAFT'::event_status)
  );

create policy "eliminación del dueño o admin"
  on public.events for delete
  to authenticated
  using ((select auth.uid()) = created_by or (select public.is_admin()));

-- ===========================================================================
-- PROFILES
-- ===========================================================================

drop policy if exists "Allow profile insert for owner" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Allow profile read for owner or admin" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Allow profile update for owner or admin" on public.profiles;

create policy "inserción del dueño"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "lectura del dueño o admin"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

create policy "actualización del dueño o admin"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()))
  with check ((select auth.uid()) = id or (select public.is_admin()));

-- ===========================================================================
-- FAVORITES (legado, 0 filas; la app usa user_favorites. No se borra: Mauro,
-- decisión 2 opción 1).
-- ===========================================================================

drop policy if exists "Allow delete for owner" on public.favorites;
drop policy if exists "Users can remove own favorites" on public.favorites;
drop policy if exists "Users can add favorites" on public.favorites;
drop policy if exists "Allow insert for owner" on public.favorites;
drop policy if exists "Allow select for owner" on public.favorites;
drop policy if exists "Users can view own favorites" on public.favorites;

create policy "lectura del dueño"
  on public.favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "inserción del dueño"
  on public.favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "eliminación del dueño"
  on public.favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- USER_FAVORITES
-- ===========================================================================

drop policy if exists "Allow delete for owner" on public.user_favorites;
drop policy if exists "Allow insert for owner" on public.user_favorites;
drop policy if exists "Allow select for owner" on public.user_favorites;

create policy "lectura del dueño"
  on public.user_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "inserción del dueño"
  on public.user_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "eliminación del dueño"
  on public.user_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- USER_FOLLOWED_CATEGORIES / USER_FOLLOWED_VENUES /
-- USER_FOLLOWED_INSTAGRAM_ACCOUNTS / USER_RADAR_SETTINGS
--
-- Ojo: estas cuatro NO tienen is_admin() hoy (el admin no ve lo de otro
-- usuario, a diferencia de events/profiles/instagram_flyers) y la matriz de
-- 17-a fija ese comportamiento (caso 25). No se le agrega is_admin() acá.
-- ===========================================================================

drop policy if exists "Allow category subscriptions management for owner" on public.user_followed_categories;

create policy "gestión del dueño"
  on public.user_followed_categories for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow venue subscriptions management for owner" on public.user_followed_venues;

create policy "gestión del dueño"
  on public.user_followed_venues for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow instagram account subscriptions management for owner" on public.user_followed_instagram_accounts;

create policy "gestión del dueño"
  on public.user_followed_instagram_accounts for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Allow radar settings management for owner" on public.user_radar_settings;

create policy "gestión del dueño"
  on public.user_radar_settings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ===========================================================================
-- ALIASES
-- ===========================================================================

drop policy if exists "Allow write for admins" on public.aliases;
drop policy if exists "Admins can manage aliases" on public.aliases;
drop policy if exists "Anyone can read aliases" on public.aliases;
drop policy if exists "Allow read for admins" on public.aliases;

create policy "lectura pública"
  on public.aliases for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.aliases for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.aliases for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.aliases for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- CATEGORIES
-- ===========================================================================

drop policy if exists "Allow admin write for categories" on public.categories;
drop policy if exists "Allow public read for categories" on public.categories;

create policy "lectura pública"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.categories for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.categories for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.categories for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- CINEMA_MOVIES
-- ===========================================================================

drop policy if exists "Allow admin write for cinema_movies" on public.cinema_movies;
drop policy if exists "Allow public read for cinema_movies" on public.cinema_movies;

create policy "lectura pública"
  on public.cinema_movies for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.cinema_movies for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.cinema_movies for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.cinema_movies for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- INSTAGRAM_ACCOUNTS
-- ===========================================================================

drop policy if exists "Allow admin write for instagram_accounts" on public.instagram_accounts;
drop policy if exists "Allow public read for instagram_accounts" on public.instagram_accounts;

create policy "lectura pública"
  on public.instagram_accounts for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.instagram_accounts for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.instagram_accounts for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.instagram_accounts for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- VENUES
-- ===========================================================================

drop policy if exists "Allow admin write for venues" on public.venues;
drop policy if exists "Allow public read for venues" on public.venues;

create policy "lectura pública"
  on public.venues for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.venues for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.venues for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.venues for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- VENUE_ALIASES
-- ===========================================================================

drop policy if exists "venue_aliases lectura publica" on public.venue_aliases;
drop policy if exists "venue_aliases escritura admin" on public.venue_aliases;

create policy "lectura pública"
  on public.venue_aliases for select
  to anon, authenticated
  using (true);

create policy "inserción admin"
  on public.venue_aliases for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.venue_aliases for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.venue_aliases for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- INSTAGRAM_FLYERS
--
-- Hoy el admin ve también los flyers ARCHIVED gracias al ALL de escritura
-- (que cubre SELECT). Al partir el ALL en insert/update/delete, el SELECT
-- público (solo ACTIVE) se queda corto para el admin: por eso el SELECT de
-- abajo suma "or (select public.is_admin())", tal como pide la consigna.
-- ===========================================================================

drop policy if exists "Allow admin write for instagram_flyers" on public.instagram_flyers;
drop policy if exists "Allow public read for active instagram_flyers" on public.instagram_flyers;

create policy "lectura pública o admin"
  on public.instagram_flyers for select
  to anon, authenticated
  using (status = 'ACTIVE'::text or (select public.is_admin()));

create policy "inserción admin"
  on public.instagram_flyers for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.instagram_flyers for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.instagram_flyers for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- SCRAPE_SOURCES
-- ===========================================================================

drop policy if exists "Allow write for admins" on public.scrape_sources;
drop policy if exists "Allow read for admins" on public.scrape_sources;

create policy "lectura admin"
  on public.scrape_sources for select
  to authenticated
  using ((select public.is_admin()));

create policy "inserción admin"
  on public.scrape_sources for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.scrape_sources for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.scrape_sources for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- SCRAPE_RUNS
-- ===========================================================================

drop policy if exists "Allow write for admins" on public.scrape_runs;
drop policy if exists "Allow read for admins" on public.scrape_runs;

create policy "lectura admin"
  on public.scrape_runs for select
  to authenticated
  using ((select public.is_admin()));

create policy "inserción admin"
  on public.scrape_runs for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "actualización admin"
  on public.scrape_runs for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "eliminación admin"
  on public.scrape_runs for delete
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- VENUE_REVIEW_QUEUE
--
-- Una sola policy ya cubre las cuatro acciones para el admin y no se
-- superpone con ninguna otra (no hay SELECT público aparte): no hace falta
-- partirla en insert/update/delete. Ya estaba envuelta en (select
-- public.is_admin()) desde supabase/migrations/20261002190000_venue_canonical.sql;
-- lo único que cambia es el rol, explícito "to authenticated" en vez del
-- "public" implícito (regla 3: nunca "public", que además cuenta roles
-- internos como authenticator/dashboard_user en el advisor).
-- ===========================================================================

drop policy if exists "venue_review_queue solo admin" on public.venue_review_queue;

create policy "gestión admin"
  on public.venue_review_queue for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
