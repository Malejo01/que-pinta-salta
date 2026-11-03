-- Q5-14 (propuesta de #160, revisión de la Q4): si cambia el título o la
-- descripción de un evento, la traducción al inglés vieja ya no vale. Hay
-- varios caminos de escritura (admin, dedup del scraper, recurrentes): un
-- trigger cubre todos. Pone en null title_en, description_en y
-- traducido_en_at; el job de traducción (Q4-7) lo vuelve a traducir en su
-- próxima corrida, con su tope.
--
-- `before update of title, description`: el job de traducción solo escribe
-- las columnas _en, así que no lo dispara. `is distinct from`: un upsert que
-- reescribe el mismo título no borra nada.
--
-- Aditiva: una función y un trigger.

create or replace function public.events_invalidar_traduccion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.description is distinct from old.description then
    new.title_en := null;
    new.description_en := null;
    new.traducido_en_at := null;
  end if;
  return new;
end;
$$;

comment on function public.events_invalidar_traduccion() is
  'Q5-14: al cambiar title o description, borra la traducción vieja (title_en, description_en, traducido_en_at) para que el job la rehaga.';

drop trigger if exists events_invalidar_traduccion on public.events;
create trigger events_invalidar_traduccion
  before update of title, description on public.events
  for each row execute function public.events_invalidar_traduccion();
