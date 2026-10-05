-- QPS-044: resolve_venue_id() fallaba con "function min(uuid) does not exist" en el
-- paso (4), core key, y por eso nunca llegaba al autocreate. Este test recorre
-- ese paso y el alta de un venue nuevo. Contra la función sin arreglar, los
-- casos 1 a 3 fallan. Todo corre en una transacción con rollback; los venues son
-- inventados.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.venues (name, address, slug)
values ('Teatro Ejemplo QA', 'Calle Inventada 123, Salta', 'teatro-ejemplo-qa');

-- 1. Sin lanzar: las dos llamadas que antes rompían con min(uuid).
select lives_ok(
  $$select public.resolve_venue_id('El Teatro Ejemplo QA', 'qa', false)$$,
  'core key: no lanza min(uuid)'
);
select lives_ok(
  $$select public.resolve_venue_id('Lugar Inventado QA 123', 'qa', true)$$,
  'autocreate: no lanza min(uuid)'
);

-- 2. Core key: sin el artículo, matchea el venue canónico (no es alias ni nombre exacto).
select is(
  public.resolve_venue_id('El Teatro Ejemplo QA', 'qa', false),
  (select id from public.venues where name = 'Teatro Ejemplo QA'),
  'core key: "El Teatro Ejemplo QA" devuelve el id de "Teatro Ejemplo QA"'
);
select is(
  (select count(*)::int from public.venues where name = 'Teatro Ejemplo QA'),
  1,
  'core key: no crea un venue duplicado'
);

-- 3. Autocreate: crea el venue canónico y lo encola para revisión.
select isnt(
  public.resolve_venue_id('Lugar Inventado QA 123', 'qa', true),
  null,
  'autocreate: devuelve un id no nulo'
);
select is(
  (select count(*)::int from public.venues
   where name = 'Lugar Inventado QA 123' and canonical_venue_id is null),
  1,
  'autocreate: crea una fila canónica (canonical_venue_id nulo)'
);
select is(
  public.resolve_venue_id('Lugar Inventado QA 123', 'qa', true),
  (select id from public.venues where name = 'Lugar Inventado QA 123'),
  'autocreate: la segunda llamada devuelve el mismo id (idempotente)'
);
select is(
  (select count(*)::int from public.venues where name = 'Lugar Inventado QA 123'),
  1,
  'autocreate: la segunda llamada no duplica la fila'
);
select is(
  (select count(*)::int from public.venue_review_queue where raw_name = 'Lugar Inventado QA 123'),
  1,
  'autocreate: queda una sola fila en venue_review_queue'
);

-- 4. Sin autocreate, un nombre desconocido devuelve NULL y no crea nada.
select is(
  public.resolve_venue_id('Otro Lugar Inventado QA 456', 'qa', false),
  null,
  'sin autocreate: nombre desconocido devuelve NULL'
);
select is(
  (select count(*)::int from public.venues where name = 'Otro Lugar Inventado QA 456'),
  0,
  'sin autocreate: no crea el venue'
);

-- 5. Permisos: SECURITY DEFINER que crea venues, solo service_role.
select ok(
  not has_function_privilege('anon', 'public.resolve_venue_id(text,text,boolean,real)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_venue_id(text,text,boolean,real)', 'EXECUTE'),
  'anon y authenticated no tienen EXECUTE'
);
select ok(
  has_function_privilege('service_role', 'public.resolve_venue_id(text,text,boolean,real)', 'EXECUTE'),
  'service_role tiene EXECUTE'
);

select * from finish();
rollback;
