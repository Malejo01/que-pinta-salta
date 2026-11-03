-- Q6-3: registro de cada llamada a la IA (flyers, traducción, clasificación),
-- para ver consumo, latencia y errores por proveedor y modelo ahora que la
-- IA es intercambiable (Gemini por defecto, Claude listo; `apps/web/lib/ia`).
--
-- Qué se guarda por fila: para qué fue (`uso`), proveedor, modelo, tokens de
-- entrada y de salida, latencia y, si falló, el código de error normalizado.
-- Qué NO: ni el prompt, ni la respuesta, ni la imagen, ni la clave, ni nada
-- del evento o de una persona.
--
-- Escribe SOLO el servidor con service_role (best-effort: si el insert falla,
-- la llamada a la IA sigue igual). Leen los admins. Aditiva: una tabla, dos
-- índices y una policy.

create table if not exists public.ia_llamadas (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  uso text not null,
  proveedor text not null,
  modelo text not null,
  tokens_entrada integer null,
  tokens_salida integer null,
  latencia_ms integer not null,
  ok boolean not null,
  error_codigo text null,
  constraint ia_llamadas_uso_check check (uso ~ '^[a-z_]{1,40}$'),
  constraint ia_llamadas_proveedor_check check (proveedor in ('gemini', 'claude')),
  constraint ia_llamadas_modelo_check check (modelo ~ '^[A-Za-z0-9._-]{1,80}$'),
  constraint ia_llamadas_tokens_entrada_check check (tokens_entrada is null or tokens_entrada >= 0),
  constraint ia_llamadas_tokens_salida_check check (tokens_salida is null or tokens_salida >= 0),
  constraint ia_llamadas_latencia_check check (latencia_ms >= 0),
  constraint ia_llamadas_error_codigo_check check (
    error_codigo is null or error_codigo in (
      'sin_clave', 'no_autorizado', 'sin_credito', 'limite', 'timeout',
      'respuesta_invalida', 'solicitud_invalida', 'error_proveedor', 'red'
    )
  ),
  constraint ia_llamadas_ok_coherente_check check (ok = (error_codigo is null))
);

comment on table public.ia_llamadas is
  'Q6-3: una fila por llamada a la IA (uso, proveedor, modelo, tokens, latencia, código de error). Nunca guarda prompts, respuestas, imágenes, claves ni datos personales. Escribe solo service_role (apps/web/lib/ia/registro.ts); leen los admins.';

create index if not exists ia_llamadas_created_at_idx on public.ia_llamadas (created_at desc);
create index if not exists ia_llamadas_uso_created_at_idx on public.ia_llamadas (uso, created_at desc);

alter table public.ia_llamadas enable row level security;

drop policy if exists "lectura admin" on public.ia_llamadas;
create policy "lectura admin"
  on public.ia_llamadas for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.ia_llamadas from anon;
revoke all on public.ia_llamadas from authenticated;
grant select on public.ia_llamadas to authenticated;
grant all on public.ia_llamadas to service_role;
