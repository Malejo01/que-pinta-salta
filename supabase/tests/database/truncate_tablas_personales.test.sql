-- QPS-133: pgTAP de la migración 20261014120000_revoke_truncate_tablas_personales.sql.
--
-- Las cinco tablas personales viejas: ni anon ni authenticated tienen
-- TRUNCATE (RLS no lo filtra), y authenticated conserva SELECT, INSERT,
-- UPDATE y DELETE, que RLS acota a la fila propia y que usan el sitio y la
-- app. Si alguien sacara el REVOKE, fallan los casos 1 a 10; si el recorte se
-- pasara de largo, fallan los 11 a 15.
--
-- Solo lee privilegios: no inserta nada. Igual corre en una transacción con
-- rollback, como los demás archivos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ===========================================================================
-- Sin TRUNCATE para anon ni authenticated.
-- ===========================================================================

select ok(
  not has_table_privilege('anon', 'public.user_favorites', 'TRUNCATE'),
  '1. user_favorites: anon no tiene privilegio TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_favorites', 'TRUNCATE'),
  '2. user_favorites: authenticated no tiene privilegio TRUNCATE'
);

select ok(
  not has_table_privilege('anon', 'public.user_radar_settings', 'TRUNCATE'),
  '3. user_radar_settings: anon no tiene privilegio TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_radar_settings', 'TRUNCATE'),
  '4. user_radar_settings: authenticated no tiene privilegio TRUNCATE'
);

select ok(
  not has_table_privilege('anon', 'public.user_followed_categories', 'TRUNCATE'),
  '5. user_followed_categories: anon no tiene privilegio TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_followed_categories', 'TRUNCATE'),
  '6. user_followed_categories: authenticated no tiene privilegio TRUNCATE'
);

select ok(
  not has_table_privilege('anon', 'public.user_followed_venues', 'TRUNCATE'),
  '7. user_followed_venues: anon no tiene privilegio TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_followed_venues', 'TRUNCATE'),
  '8. user_followed_venues: authenticated no tiene privilegio TRUNCATE'
);

select ok(
  not has_table_privilege('anon', 'public.user_followed_instagram_accounts', 'TRUNCATE'),
  '9. user_followed_instagram_accounts: anon no tiene privilegio TRUNCATE'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_followed_instagram_accounts', 'TRUNCATE'),
  '10. user_followed_instagram_accounts: authenticated no tiene privilegio TRUNCATE'
);

-- ===========================================================================
-- authenticated conserva lo que usan el sitio y la app (acotado por RLS).
-- ===========================================================================

select ok(
  has_table_privilege('authenticated', 'public.user_favorites', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_favorites', 'INSERT')
  and has_table_privilege('authenticated', 'public.user_favorites', 'UPDATE')
  and has_table_privilege('authenticated', 'public.user_favorites', 'DELETE'),
  '11. user_favorites: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE'
);
select ok(
  has_table_privilege('authenticated', 'public.user_radar_settings', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_radar_settings', 'INSERT')
  and has_table_privilege('authenticated', 'public.user_radar_settings', 'UPDATE')
  and has_table_privilege('authenticated', 'public.user_radar_settings', 'DELETE'),
  '12. user_radar_settings: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE'
);
select ok(
  has_table_privilege('authenticated', 'public.user_followed_categories', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_followed_categories', 'INSERT')
  and has_table_privilege('authenticated', 'public.user_followed_categories', 'UPDATE')
  and has_table_privilege('authenticated', 'public.user_followed_categories', 'DELETE'),
  '13. user_followed_categories: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE'
);
select ok(
  has_table_privilege('authenticated', 'public.user_followed_venues', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_followed_venues', 'INSERT')
  and has_table_privilege('authenticated', 'public.user_followed_venues', 'UPDATE')
  and has_table_privilege('authenticated', 'public.user_followed_venues', 'DELETE'),
  '14. user_followed_venues: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE'
);
select ok(
  has_table_privilege('authenticated', 'public.user_followed_instagram_accounts', 'SELECT')
  and has_table_privilege('authenticated', 'public.user_followed_instagram_accounts', 'INSERT')
  and has_table_privilege('authenticated', 'public.user_followed_instagram_accounts', 'UPDATE')
  and has_table_privilege('authenticated', 'public.user_followed_instagram_accounts', 'DELETE'),
  '15. user_followed_instagram_accounts: authenticated sí tiene SELECT, INSERT, UPDATE y DELETE'
);

select * from finish();
rollback;
