-- ============================================================
-- Migración SQL: Suscripción a Organizadores de Instagram
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_followed_instagram_accounts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, instagram_account_id)
);

-- Habilitar RLS
ALTER TABLE public.user_followed_instagram_accounts ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para el propietario
CREATE POLICY "Allow instagram account subscriptions management for owner"
  ON public.user_followed_instagram_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_followed_instagram_accounts_user_id ON public.user_followed_instagram_accounts(user_id);
