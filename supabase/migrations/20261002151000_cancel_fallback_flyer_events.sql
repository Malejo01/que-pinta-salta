-- Sprint 1 / 1.5 (docs/AUDITORIA-2026-10.md §4): migración de datos.
--
-- Los 56 eventos de fallback de la IA de flyers (ai_metadata.is_fallback):
-- 54 con el título "Revisar: Flyer de @…" y 2 que se renombraron a mano
-- ("@bresh", "@treintaypicosalta"). Todos tienen start_date = fecha del post,
-- así que son pasados, y estaban PUBLISHED. Pasan a CANCELLED: RLS solo deja
-- leer PUBLISHED a anon, así que dejan de verse en /evento/[id].
--
-- Por qué estaban PUBLISHED: no los publicó ningún proceso automático. Los
-- 56 tienen el slug que genera publishDraftEvent (lib/admin-actions.ts:333-338,
-- `${slugify(title)}-${id.slice(0,5)}`), que solo se llama desde el botón
-- "Publicar" de /admin/revision (components/draft-events-manager.tsx:208).

UPDATE public.events
SET status = 'CANCELLED'
WHERE (ai_metadata->>'is_fallback')::boolean IS TRUE
  AND status = 'PUBLISHED';
