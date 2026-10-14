-- ============================================================================
-- QPS-133 (14/10): REVOKE TRUNCATE en las cinco tablas personales viejas
-- ============================================================================
--
-- El baseline les dejó a anon y authenticated todos los privilegios de tabla
-- en user_favorites, user_radar_settings y los tres user_followed_*. RLS acota
-- SELECT, INSERT, UPDATE y DELETE a la fila propia, pero no filtra TRUNCATE:
-- era la única acción que no quedaba acotada. A las tablas personales nuevas
-- (rondas 23 a 26: push_tokens, notification_preferences, notification_sends,
-- event_attendance) ya se les recortó una por una; esto deja a las viejas
-- igual.
--
-- No es alcanzable desde la app ni desde el sitio (PostgREST no expone
-- TRUNCATE), así que no cambia nada de lo que hacen hoy. Ninguna fila se toca.
-- service_role y postgres conservan TRUNCATE.
--
-- pgTAP: supabase/tests/database/truncate_tablas_personales.test.sql.
-- ============================================================================

revoke truncate on table
  public.user_favorites,
  public.user_radar_settings,
  public.user_followed_categories,
  public.user_followed_venues,
  public.user_followed_instagram_accounts
from anon, authenticated;
