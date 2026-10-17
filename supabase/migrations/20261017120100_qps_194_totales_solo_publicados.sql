-- QPS-194 (seguridad, R38): la tabla de totales de "voy" / "me interesa"
-- filtra por el estado del evento, igual que la vista pública.
--
-- event_attendance_totals tenía la política "lectura pública" con
-- using (true) y GRANT SELECT a anon (migración 20261013120100, cambio c):
-- con el UUID de un evento que no está PUBLISHED se leían sus cantidades sin
-- pasar por la vista event_attendance_counts, que sí filtra por PUBLISHED.
-- No identifica a nadie (la tabla no tiene columnas de persona) y los UUID no
-- son enumerables, pero se desviaba del modelo que la propia migración
-- documenta. Ahora la política exige lo mismo que la vista.
--
-- La vista (security_invoker) sigue funcionando igual: ya hacía el join con
-- events y status = 'PUBLISHED', así que nunca mostraba otra cosa. El trigger
-- que mantiene los totales es SECURITY DEFINER: no lo afecta la RLS.
-- Sin cambios de esquema (solo la política): no hace falta npm run db:types.

drop policy if exists "lectura pública" on public.event_attendance_totals;
create policy "lectura pública"
  on public.event_attendance_totals for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance_totals.event_id
        and e.status = 'PUBLISHED'::public.event_status
    )
  );

comment on policy "lectura pública" on public.event_attendance_totals is
  'QPS-194: solo totales de eventos PUBLISHED, igual que la vista event_attendance_counts. La tabla no tiene columnas de persona; el GRANT SELECT a anon/authenticated (cambio c) sigue haciendo falta para la vista security_invoker.';
