-- Sprint 0 / 0.1 (docs/AUDITORIA-2026-10.md §A.1)
--
-- "Creators can manage own events" era FOR ALL, rol public, sin WITH CHECK.
-- Como las políticas permisivas se combinan con OR, anulaba el
-- status = 'DRAFT' que exigen "Allow insert for owner or admin" y
-- "Allow update for owner or admin": cualquier usuario registrado podía
-- insertar o editar sus eventos con status = 'PUBLISHED' e is_featured = true.
--
-- "Anyone can view published events" es un duplicado de
-- "Allow read for published or owner or admin", que ya incluye
-- status = 'PUBLISHED'.
--
-- Requiere el cambio de updateUserEvent (lib/actions.ts): un dueño no-admin
-- que edita un evento que no está en DRAFT lo devuelve a DRAFT.

DROP POLICY IF EXISTS "Creators can manage own events" ON public.events;
DROP POLICY IF EXISTS "Anyone can view published events" ON public.events;
