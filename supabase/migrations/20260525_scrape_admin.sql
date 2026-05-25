create extension if not exists pgcrypto;

create table if not exists public.scrape_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  site_url text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.scrape_sources(id) on delete set null,
  source_key text not null,
  status text not null check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists scrape_runs_source_key_started_at_idx
  on public.scrape_runs(source_key, started_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

 drop trigger if exists set_scrape_sources_updated_at on public.scrape_sources;
create trigger set_scrape_sources_updated_at
before update on public.scrape_sources
for each row
execute function public.set_updated_at();

insert into public.scrape_sources (key, name, description, site_url, is_enabled)
values
  ('norteticket', 'Norteticket', 'Eventos publicados para Salta en Norteticket.', 'https://norteticket.com/?subcategoria=Salta', true),
  ('paseshow', 'Paseshow', 'Fuente reservada para futura integración.', 'https://www.paseshow.com.ar/', false),
  ('tuentrada', 'TuEntrada', 'Fuente reservada para futura integración.', 'https://www.tuentrada.com/', false),
  ('ticketek', 'Ticketek', 'Fuente reservada para futura integración.', 'https://www.ticketek.com.ar/', false),
  ('passline', 'Passline', 'Fuente reservada para futura integración.', 'https://www.passline.com/', false),
  ('eventbrite', 'Eventbrite', 'Fuente reservada para futura integración.', 'https://www.eventbrite.com/', false),
  ('alpogo', 'AlPogo', 'Fuente reservada para futura integración.', 'https://alpogo.com/', false),
  ('independientes', 'Productores Independientes', 'Carga manual o scrapers dedicados por productor.', 'https://quepintasalta.com', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  site_url = excluded.site_url,
  is_enabled = excluded.is_enabled;
