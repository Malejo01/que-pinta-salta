-- Sprint 0 / 0.4 (docs/AUDITORIA-2026-10.md §B, Storage)
--
-- "Authenticated users can upload flyers" dejaba a cualquier usuario
-- autenticado subir a cualquier ruta del bucket flyers. Queda
-- "Allow authenticated upload of flyers", que exige que la primera carpeta
-- sea el uid del usuario.

DROP POLICY IF EXISTS "Authenticated users can upload flyers" ON storage.objects;
