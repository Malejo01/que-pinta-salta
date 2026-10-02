-- Migración para el rol de Colaborador y eventos pendientes

-- 1. Actualizar tabla profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS contact_type TEXT CHECK (contact_type IN ('whatsapp', 'instagram', 'facebook')),
ADD COLUMN IF NOT EXISTS contact_value TEXT;

-- 2. Actualizar tabla events (agregar 'PENDING' al enum)
ALTER TYPE public.event_status ADD VALUE IF NOT EXISTS 'PENDING';
