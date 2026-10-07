-- QPS-050 (Ronda 10, tarea 10-e): tres casos de resolve_venue_id() que
-- resolve_venue_id.test.sql no cubre: paso (1) alias exacto, paso (3) venue
-- ya absorbido y paso (4) ambiguo por core key. Datos inventados, todo en
-- una transacción con rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- ---------------------------------------------------------------------------
-- Caso 1 — Paso 4, ambiguo: dos venues canónicos distintos ("La ..." y
-- "El ...") colapsan a la misma core key ("bodega secreta qa"). Una consulta
-- con un tercer artículo ("Los ...") también cae en esa core key, así que el
-- paso (4) encuentra dos matches (no uno) y no resuelve. Sin autocreate,
-- resolve_venue_id tiene que devolver NULL y no crear ningún venue nuevo
-- (puede, sí, encolar una sugerencia difusa en venue_review_queue vía el
-- paso 5, pero eso no es lo que este caso verifica).
-- ---------------------------------------------------------------------------

insert into public.venues (name, address, slug)
values ('La Bodega Secreta QA', 'Calle Inventada 800, Salta', 'la-bodega-secreta-qa');
insert into public.venues (name, address, slug)
values ('El Bodega Secreta QA', 'Calle Inventada 801, Salta', 'el-bodega-secreta-qa');

select is(
  public.resolve_venue_id('Los Bodega Secreta QA', 'qa', false),
  null,
  'paso 4 ambiguo: dos venues con la misma core key y autocreate en false devuelve NULL'
);
select is(
  (select count(*)::int from public.venues where name = 'Los Bodega Secreta QA'),
  0,
  'paso 4 ambiguo: no crea ningun venue nuevo'
);

-- ---------------------------------------------------------------------------
-- Caso 2 — Paso 1, alias exacto: un alias en venue_aliases que no se parece
-- al nombre canónico (no matchearía por normalize ni por core key) tiene que
-- resolver al venue del alias.
-- ---------------------------------------------------------------------------

insert into public.venues (name, address, slug)
values ('Boliche Alias QA', 'Calle Inventada 700, Salta', 'boliche-alias-qa');

insert into public.venue_aliases (venue_id, alias, source)
values (
  (select id from public.venues where name = 'Boliche Alias QA'),
  'BAQA Bar',
  'manual'
);

select is(
  public.resolve_venue_id('BAQA Bar', 'qa', false),
  (select id from public.venues where name = 'Boliche Alias QA'),
  'paso 1: alias exacto devuelve el venue del alias'
);
select is(
  (select count(*)::int from public.venues where name = 'BAQA Bar'),
  0,
  'paso 1: el alias no crea un venue nuevo'
);

-- ---------------------------------------------------------------------------
-- Caso 3 — Paso 3, venue absorbido: una fila legacy con canonical_venue_id
-- apuntando a otro venue sigue siendo un match válido por su propio nombre,
-- pero resolve_venue_id tiene que devolver el id del venue que queda
-- (el canónico), no el de la fila absorbida.
-- ---------------------------------------------------------------------------

insert into public.venues (name, address, slug)
values ('Confiteria Absorbente QA', 'Calle Inventada 500, Salta', 'confiteria-absorbente-qa');

insert into public.venues (name, address, slug, canonical_venue_id, merged_at)
values (
  'Confiteria Absorbida QA',
  'Calle Inventada 501, Salta',
  'confiteria-absorbida-qa',
  (select id from public.venues where name = 'Confiteria Absorbente QA'),
  now()
);

select is(
  public.resolve_venue_id('Confiteria Absorbida QA', 'qa', false),
  (select id from public.venues where name = 'Confiteria Absorbente QA'),
  'paso 3: el nombre de la fila absorbida devuelve el id del venue que queda'
);
select is(
  public.venue_canonical_of((select id from public.venues where name = 'Confiteria Absorbida QA')),
  (select id from public.venues where name = 'Confiteria Absorbente QA'),
  'venue_canonical_of sigue el puntero de la fila absorbida'
);

select * from finish();
rollback;
