-- Q5-3 (decisión 9 de Mauro): «Sumá un lugar para chicos», el pedido del
-- público. Cada pedido queda en esta tabla y el admin lo pasa a BORRADOR de
-- `lugares_permanentes` con un click (fuente 'pedido_publico', que no alcanza
-- para publicar: hace falta verificarlo).
--
-- Por qué una tabla aparte y no un borrador directo: un borrador necesita un
-- venue, y los venues son públicos (anon los lee). Crear venues desde un
-- formulario anónimo llenaría la tabla pública de spam. El pedido no se ve en
-- ningún lado público.
--
-- Escritura: SOLO el servidor con la service key (la server action, después
-- del honeypot, el tiempo mínimo y el límite por IP). No hay policy de
-- INSERT: anon y authenticated no pueden escribir. Leen y cambian solo los
-- admins.
--
-- `contacto` es opcional (email o teléfono de quien pide, si quiere que le
-- avisemos). Se borra con «Borrar contacto» o al descartar el pedido.
--
-- Aditiva: una tabla nueva, un índice y policies.

create table if not exists public.lugares_chicos_pedidos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text not null,
  tipo text null,
  comentario text null,
  link text null,
  contacto text null,
  idioma text not null default 'es',
  estado text not null default 'nuevo',
  lugar_id uuid null references public.lugares_permanentes(id) on delete set null,
  revisado_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint lugares_chicos_pedidos_nombre_check check (char_length(nombre) between 3 and 200),
  constraint lugares_chicos_pedidos_direccion_check check (char_length(direccion) between 3 and 300),
  constraint lugares_chicos_pedidos_tipo_check check (
    tipo is null or tipo in ('pelotero', 'salon_juegos', 'plaza_juegos', 'espacio_cultural_infantil')
  ),
  constraint lugares_chicos_pedidos_comentario_check check (comentario is null or char_length(comentario) <= 1000),
  constraint lugares_chicos_pedidos_link_check check (link is null or (link ~* '^https?://' and char_length(link) <= 300)),
  constraint lugares_chicos_pedidos_contacto_check check (contacto is null or char_length(contacto) <= 200),
  constraint lugares_chicos_pedidos_idioma_check check (idioma in ('es', 'en')),
  constraint lugares_chicos_pedidos_estado_check check (estado in ('nuevo', 'convertido', 'descartado'))
);

comment on table public.lugares_chicos_pedidos is
  'Q5-3: pedidos del formulario público «Sumá un lugar para chicos». Escribe solo el servidor (service role); leen y cambian los admins. El admin los pasa a borrador de lugares_permanentes.';
comment on column public.lugares_chicos_pedidos.contacto is
  'Opcional, de quien pide (para avisarle). Se borra al descartar o con «Borrar contacto».';

create index if not exists lugares_chicos_pedidos_nuevos_idx
  on public.lugares_chicos_pedidos (created_at)
  where estado = 'nuevo';

alter table public.lugares_chicos_pedidos enable row level security;

drop policy if exists "lectura admin" on public.lugares_chicos_pedidos;
create policy "lectura admin"
  on public.lugares_chicos_pedidos for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "actualización admin" on public.lugares_chicos_pedidos;
create policy "actualización admin"
  on public.lugares_chicos_pedidos for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "borrado admin" on public.lugares_chicos_pedidos;
create policy "borrado admin"
  on public.lugares_chicos_pedidos for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.lugares_chicos_pedidos from anon;
revoke all on public.lugares_chicos_pedidos from authenticated;
grant select, update, delete on public.lugares_chicos_pedidos to authenticated;
grant all on public.lugares_chicos_pedidos to service_role;
