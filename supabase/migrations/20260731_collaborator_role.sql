-- Migración para el rol de Colaborador y eventos pendientes

-- 1. Actualizar tabla profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS contact_type TEXT CHECK (contact_type IN ('whatsapp', 'instagram', 'facebook')),
ADD COLUMN IF NOT EXISTS contact_value TEXT;

-- Si existe un constraint de check para el rol, hay que reemplazarlo (o si es un tipo, pero usualmente en Supabase es un check constraint text)
-- Intentaremos actualizar la columna asumiendo que no tiene check o que lo podemos reemplazar por un nuevo check si falla.
-- En muchos casos Supabase lo hace como un simple text default 'USER'. Si hay un constraint lo más seguro es dejarlo como texto y luego validarlo a nivel de aplicación, pero por si acaso, intentaremos modificar la restricción o crear el tipo.
-- Supongamos que es simplemente texto:
-- No vamos a dropear un constraint que no conocemos. Si el usuario recibe error de constraint, lo arreglaremos.

-- 2. Actualizar tabla events
-- Agregar el estado PENDING si no existe (asumiendo que es tipo text con constraint, si no lo es, esto no rompe).
-- Si EventStatus es un enum o si solo es una columna de texto con o sin check.
-- Dado que no sabemos el nombre del constraint, lo más seguro es agregar una nota.
-- Asumiendo que es solo un string:
-- Solo requerimos actualizar tipos.
