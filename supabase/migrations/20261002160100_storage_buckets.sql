-- Buckets de Storage de producción. Son filas de storage.buckets, no esquema,
-- por eso van aparte del baseline. Idempotente: en una base que ya los tiene
-- no hace nada.
--
-- flyers:    público, 5 MB, solo imágenes. Lo usan los usuarios para subir el
--            flyer de su evento (carpeta = uid, ver políticas en el baseline).
-- flyers_ig: público, 5 MB, sin restricción de mime y sin políticas: solo
--            escribe el service role (ingesta de Instagram).

INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
  ('flyers', 'flyers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('flyers_ig', 'flyers_ig', true, 5242880, NULL)
ON CONFLICT ("id") DO NOTHING;
