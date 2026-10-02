-- ============================================================================
-- BASELINE del esquema de producción (proyecto splzietmyydqhmdxijcn), 2026-10-02
-- ============================================================================
--
-- Reemplaza a las 29 migraciones de supabase/migrations_legacy/: el estado que
-- dejaron (más lo que se aplicó a mano en el SQL Editor y nunca estuvo en el
-- repo) está todo acá. En producción esta versión se marca como aplicada con
-- `supabase migration repair`; no se ejecuta.
--
-- Origen:
--   1. `supabase db dump --db-url <prod>` (schema public, extensiones, grants,
--      default privileges). Con dos correcciones, para que la base que se
--      reconstruye sea idéntica a prod (verificado con `supabase db diff`):
--      - aliases_target_type_check y events_classification_source_check están
--        escritos como IN (...), su forma original: la que emite pg_dump se
--        re-parsea a otro árbol de expresión;
--      - REVOKE de handle_new_user() a anon/authenticated (al final): pg_dump no
--        lo emite y los default privileges de public se lo otorgan.
--   2. Al final, a mano desde el catálogo de prod, lo que el dump no incluye
--      porque vive en schemas administrados por Supabase: las políticas RLS de
--      storage.objects y el trigger de auth.users que llama a handle_new_user().
--
-- Las funciones is_admin, prevent_role_tampering, set_updated_at tienen saltos de
-- línea Windows (CRLF) dentro del cuerpo en prod: se escriben como E'...' con
-- \r escapado para que el archivo no lleve CR (git/autocrlf los borraría).
--
-- Los buckets (filas de storage.buckets) están en la migración siguiente,
-- 20261002160100_storage_buckets.sql.
-- ============================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."event_status" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'CANCELLED',
    'PAST',
    'PENDING'
);


ALTER TYPE "public"."event_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'EMAIL',
    'PUSH',
    'WHATSAPP'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'USER',
    'ADMIN'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS E'\r
BEGIN\r
  RETURN EXISTS (\r
    SELECT 1 FROM public.profiles\r
    WHERE id = auth.uid() AND role = ''ADMIN''\r
  );\r
END;\r
';


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_tampering"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS E'\r
BEGIN\r
  -- Si la consulta proviene del rol privilegiado del sistema (service_role), permitir\r
  IF auth.role() = ''service_role'' THEN\r
    RETURN NEW;\r
  END IF;\r
\r
  -- Si el valor NEW.role es diferente de OLD.role\r
  IF NEW.role IS DISTINCT FROM OLD.role THEN\r
    -- Permitir el cambio únicamente si el ejecutor es administrador\r
    IF NOT public.is_admin() THEN\r
      RAISE EXCEPTION ''No tienes permisos de administrador para modificar roles.'';\r
    END IF;\r
  END IF;\r
  RETURN NEW;\r
END;\r
';


ALTER FUNCTION "public"."prevent_role_tampering"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS E'\r
begin\r
  new.updated_at = now();\r
  return new;\r
end;\r
';


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "alias" character varying(200) NOT NULL,
    "target_type" character varying(20) NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    -- Escrito como IN (forma original) y no como lo emite pg_dump: re-parsear la
    -- versión de pg_dump guarda otro árbol de expresión y db diff marca diferencia.
    CONSTRAINT "aliases_target_type_check" CHECK (("target_type" IN ('category', 'venue')))
);


ALTER TABLE "public"."aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "icon" character varying(50),
    "color" character varying(7),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cinema_movies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "poster_url" "text",
    "is_currently_showing" boolean DEFAULT true NOT NULL,
    "showings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."cinema_movies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_migrations" (
    "name" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."data_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" character varying(300) NOT NULL,
    "slug" character varying(350) NOT NULL,
    "description" "text",
    "short_description" character varying(500),
    "category_id" "uuid",
    "venue_id" "uuid",
    "image_url" "text",
    "gallery_urls" "text"[] DEFAULT '{}'::"text"[],
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone,
    "is_recurring" boolean DEFAULT false,
    "recurrence_rule" character varying(100),
    "price_min" numeric(10,2) DEFAULT 0,
    "price_max" numeric(10,2),
    "is_free" boolean DEFAULT false,
    "ticket_url" "text",
    "age_restriction" integer DEFAULT 0,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "status" "public"."event_status" DEFAULT 'DRAFT'::"public"."event_status",
    "is_featured" boolean DEFAULT false,
    "view_count" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "scrape_source_key" character varying(100),
    "classification_source" character varying(20),
    "ticket_sources" "jsonb" DEFAULT '[]'::"jsonb",
    "is_commercial" boolean DEFAULT false,
    "ai_metadata" "jsonb",
    -- Ídem aliases_target_type_check: forma original (20260525_clasificacion.sql).
    CONSTRAINT "events_classification_source_check" CHECK (("classification_source" IN ('manual', 'alias', 'scraper')))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "profile_pic_url" "text",
    "instagram_url" "text" GENERATED ALWAYS AS ((('https://www.instagram.com/'::"text" || "username") || '/'::"text")) STORED,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_venue_name" "text",
    "default_maps_url" "text",
    "default_category" "text" DEFAULT 'boliches'::"text" NOT NULL
);


ALTER TABLE "public"."instagram_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_flyers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "ig_post_id" "text" NOT NULL,
    "ig_post_url" "text" NOT NULL,
    "ig_post_type" "text" DEFAULT 'Image'::"text",
    "caption" "text",
    "published_at" timestamp with time zone NOT NULL,
    "original_image_url" "text",
    "storage_image_path" "text",
    "storage_image_url" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "venue_name" "text",
    "maps_url" "text",
    "category" "text" DEFAULT 'boliches'::"text" NOT NULL,
    "price_min" integer DEFAULT 0 NOT NULL,
    "is_free" boolean DEFAULT false NOT NULL,
    "ai_metadata" "jsonb",
    "ai_processed_at" timestamp with time zone,
    "ai_status" "text" DEFAULT 'PENDING'::"text",
    CONSTRAINT "instagram_flyers_ai_status_check" CHECK (("ai_status" = ANY (ARRAY['PENDING'::"text", 'PROCESSED'::"text", 'FAILED'::"text", 'SKIPPED'::"text"]))),
    CONSTRAINT "instagram_flyers_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'ARCHIVED'::"text"])))
);


ALTER TABLE "public"."instagram_flyers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "full_name" character varying(200),
    "avatar_url" "text",
    "role" "public"."user_role" DEFAULT 'USER'::"public"."user_role",
    "favorite_categories" "uuid"[] DEFAULT '{}'::"uuid"[],
    "notification_preferences" "public"."notification_type"[] DEFAULT '{EMAIL}'::"public"."notification_type"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "contact_type" "text",
    "contact_value" "text",
    CONSTRAINT "profiles_contact_type_check" CHECK (("contact_type" = ANY (ARRAY['whatsapp'::"text", 'instagram'::"text", 'facebook'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrape_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid",
    "source_key" "text" NOT NULL,
    "status" "text" NOT NULL,
    "triggered_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "inserted_count" integer DEFAULT 0 NOT NULL,
    "skipped_count" integer DEFAULT 0 NOT NULL,
    "errors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scrape_runs_status_check" CHECK (("status" = ANY (ARRAY['RUNNING'::"text", 'SUCCESS'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."scrape_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scrape_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "site_url" "text",
    "is_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scrape_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "instagram_flyer_id" "uuid",
    "cinema_movie_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "favorite_item_check" CHECK (((("event_id" IS NOT NULL) AND ("instagram_flyer_id" IS NULL) AND ("cinema_movie_id" IS NULL)) OR (("event_id" IS NULL) AND ("instagram_flyer_id" IS NOT NULL) AND ("cinema_movie_id" IS NULL)) OR (("event_id" IS NULL) AND ("instagram_flyer_id" IS NULL) AND ("cinema_movie_id" IS NOT NULL))))
);


ALTER TABLE "public"."user_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_followed_categories" (
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_followed_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_followed_instagram_accounts" (
    "user_id" "uuid" NOT NULL,
    "instagram_account_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_followed_instagram_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_followed_venues" (
    "user_id" "uuid" NOT NULL,
    "venue_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_followed_venues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_radar_settings" (
    "user_id" "uuid" NOT NULL,
    "email_frequency" "text" DEFAULT 'weekly'::"text" NOT NULL,
    "email_target" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_radar_settings_email_frequency_check" CHECK (("email_frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."user_radar_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "address" "text" NOT NULL,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "google_maps_url" "text",
    "phone" character varying(50),
    "capacity" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."venues" OWNER TO "postgres";


ALTER TABLE ONLY "public"."aliases"
    ADD CONSTRAINT "aliases_alias_target_type_key" UNIQUE ("alias", "target_type");



ALTER TABLE ONLY "public"."aliases"
    ADD CONSTRAINT "aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."cinema_movies"
    ADD CONSTRAINT "cinema_movies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cinema_movies"
    ADD CONSTRAINT "cinema_movies_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."data_migrations"
    ADD CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_event_id_key" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."instagram_accounts"
    ADD CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_accounts"
    ADD CONSTRAINT "instagram_accounts_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."instagram_flyers"
    ADD CONSTRAINT "instagram_flyers_ig_post_id_key" UNIQUE ("ig_post_id");



ALTER TABLE ONLY "public"."instagram_flyers"
    ADD CONSTRAINT "instagram_flyers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrape_runs"
    ADD CONSTRAINT "scrape_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scrape_sources"
    ADD CONSTRAINT "scrape_sources_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."scrape_sources"
    ADD CONSTRAINT "scrape_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "unique_user_event_favorite" UNIQUE ("user_id", "event_id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "unique_user_flyer_favorite" UNIQUE ("user_id", "instagram_flyer_id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "unique_user_movie_favorite" UNIQUE ("user_id", "cinema_movie_id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_followed_categories"
    ADD CONSTRAINT "user_followed_categories_pkey" PRIMARY KEY ("user_id", "category_id");



ALTER TABLE ONLY "public"."user_followed_instagram_accounts"
    ADD CONSTRAINT "user_followed_instagram_accounts_pkey" PRIMARY KEY ("user_id", "instagram_account_id");



ALTER TABLE ONLY "public"."user_followed_venues"
    ADD CONSTRAINT "user_followed_venues_pkey" PRIMARY KEY ("user_id", "venue_id");



ALTER TABLE ONLY "public"."user_radar_settings"
    ADD CONSTRAINT "user_radar_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_events_category" ON "public"."events" USING "btree" ("category_id");



CREATE INDEX "idx_events_featured" ON "public"."events" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_events_is_commercial" ON "public"."events" USING "btree" ("is_commercial");



CREATE INDEX "idx_events_scrape_source" ON "public"."events" USING "btree" ("scrape_source_key") WHERE ("scrape_source_key" IS NOT NULL);



CREATE INDEX "idx_events_start_date" ON "public"."events" USING "btree" ("start_date");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_events_ticket_sources" ON "public"."events" USING "gin" ("ticket_sources");



CREATE INDEX "idx_events_uncategorized" ON "public"."events" USING "btree" ("created_at" DESC) WHERE ("category_id" IS NULL);



CREATE INDEX "idx_favorites_event" ON "public"."favorites" USING "btree" ("event_id");



CREATE INDEX "idx_favorites_user" ON "public"."favorites" USING "btree" ("user_id");



CREATE INDEX "idx_followed_categories_user_id" ON "public"."user_followed_categories" USING "btree" ("user_id");



CREATE INDEX "idx_followed_instagram_accounts_user_id" ON "public"."user_followed_instagram_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_followed_venues_user_id" ON "public"."user_followed_venues" USING "btree" ("user_id");



CREATE INDEX "idx_ig_flyers_account" ON "public"."instagram_flyers" USING "btree" ("account_id");



CREATE INDEX "idx_ig_flyers_ai_status_pending" ON "public"."instagram_flyers" USING "btree" ("ai_status") WHERE ("ai_status" = 'PENDING'::"text");



CREATE INDEX "idx_ig_flyers_published" ON "public"."instagram_flyers" USING "btree" ("published_at" DESC);



CREATE INDEX "idx_ig_flyers_status" ON "public"."instagram_flyers" USING "btree" ("status") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "idx_user_favorites_event_id" ON "public"."user_favorites" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



CREATE INDEX "idx_user_favorites_flyer_id" ON "public"."user_favorites" USING "btree" ("instagram_flyer_id") WHERE ("instagram_flyer_id" IS NOT NULL);



CREATE INDEX "idx_user_favorites_movie_id" ON "public"."user_favorites" USING "btree" ("cinema_movie_id") WHERE ("cinema_movie_id" IS NOT NULL);



CREATE INDEX "idx_user_favorites_user_id" ON "public"."user_favorites" USING "btree" ("user_id");



CREATE INDEX "scrape_runs_source_key_started_at_idx" ON "public"."scrape_runs" USING "btree" ("source_key", "started_at" DESC);



CREATE OR REPLACE TRIGGER "set_cinema_movies_updated_at" BEFORE UPDATE ON "public"."cinema_movies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_instagram_accounts_updated_at" BEFORE UPDATE ON "public"."instagram_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_scrape_sources_updated_at" BEFORE UPDATE ON "public"."scrape_sources" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_radar_settings_updated_at" BEFORE UPDATE ON "public"."user_radar_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tr_prevent_role_tampering" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_tampering"();



CREATE OR REPLACE TRIGGER "update_events_updated_at" BEFORE UPDATE ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."aliases"
    ADD CONSTRAINT "aliases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id");



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."favorites"
    ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instagram_flyers"
    ADD CONSTRAINT "instagram_flyers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scrape_runs"
    ADD CONSTRAINT "scrape_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."scrape_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scrape_runs"
    ADD CONSTRAINT "scrape_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_cinema_movie_id_fkey" FOREIGN KEY ("cinema_movie_id") REFERENCES "public"."cinema_movies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_instagram_flyer_id_fkey" FOREIGN KEY ("instagram_flyer_id") REFERENCES "public"."instagram_flyers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_categories"
    ADD CONSTRAINT "user_followed_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_categories"
    ADD CONSTRAINT "user_followed_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_instagram_accounts"
    ADD CONSTRAINT "user_followed_instagram_accounts_instagram_account_id_fkey" FOREIGN KEY ("instagram_account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_instagram_accounts"
    ADD CONSTRAINT "user_followed_instagram_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_venues"
    ADD CONSTRAINT "user_followed_venues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_followed_venues"
    ADD CONSTRAINT "user_followed_venues_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_radar_settings"
    ADD CONSTRAINT "user_radar_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage aliases" ON "public"."aliases" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'ADMIN'::"public"."user_role")))));



CREATE POLICY "Allow admin write for categories" ON "public"."categories" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow admin write for cinema_movies" ON "public"."cinema_movies" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow admin write for instagram_accounts" ON "public"."instagram_accounts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow admin write for instagram_flyers" ON "public"."instagram_flyers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow admin write for venues" ON "public"."venues" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow category subscriptions management for owner" ON "public"."user_followed_categories" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow delete for owner" ON "public"."favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow delete for owner" ON "public"."user_favorites" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow delete for owner or admin" ON "public"."events" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "created_by") OR "public"."is_admin"()));



CREATE POLICY "Allow insert for owner" ON "public"."favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow insert for owner" ON "public"."user_favorites" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow insert for owner or admin" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."uid"() = "created_by") AND (("status" = 'DRAFT'::"public"."event_status") OR ("status" IS NULL))) OR "public"."is_admin"()));



CREATE POLICY "Allow instagram account subscriptions management for owner" ON "public"."user_followed_instagram_accounts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow profile insert for owner" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Allow profile read for owner or admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Allow profile update for owner or admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") OR "public"."is_admin"())) WITH CHECK ((("auth"."uid"() = "id") OR "public"."is_admin"()));



CREATE POLICY "Allow public read for active instagram_flyers" ON "public"."instagram_flyers" FOR SELECT USING (("status" = 'ACTIVE'::"text"));



CREATE POLICY "Allow public read for categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Allow public read for cinema_movies" ON "public"."cinema_movies" FOR SELECT USING (true);



CREATE POLICY "Allow public read for instagram_accounts" ON "public"."instagram_accounts" FOR SELECT USING (true);



CREATE POLICY "Allow public read for venues" ON "public"."venues" FOR SELECT USING (true);



CREATE POLICY "Allow radar settings management for owner" ON "public"."user_radar_settings" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow read for admins" ON "public"."aliases" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow read for admins" ON "public"."scrape_runs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow read for admins" ON "public"."scrape_sources" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow read for published or owner or admin" ON "public"."events" FOR SELECT USING ((("status" = 'PUBLISHED'::"public"."event_status") OR ("auth"."uid"() = "created_by") OR "public"."is_admin"()));



CREATE POLICY "Allow select for owner" ON "public"."favorites" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow select for owner" ON "public"."user_favorites" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow update for owner or admin" ON "public"."events" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "created_by") OR "public"."is_admin"())) WITH CHECK (("public"."is_admin"() OR (("auth"."uid"() = "created_by") AND ("status" = 'DRAFT'::"public"."event_status"))));



CREATE POLICY "Allow venue subscriptions management for owner" ON "public"."user_followed_venues" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow write for admins" ON "public"."aliases" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow write for admins" ON "public"."scrape_runs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Allow write for admins" ON "public"."scrape_sources" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Anyone can read aliases" ON "public"."aliases" FOR SELECT USING (true);



CREATE POLICY "Users can add favorites" ON "public"."favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can remove own favorites" ON "public"."favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own favorites" ON "public"."favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cinema_movies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_flyers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrape_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scrape_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_followed_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_followed_instagram_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_followed_venues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_radar_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_tampering"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_tampering"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_tampering"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."aliases" TO "anon";
GRANT ALL ON TABLE "public"."aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."aliases" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."cinema_movies" TO "anon";
GRANT ALL ON TABLE "public"."cinema_movies" TO "authenticated";
GRANT ALL ON TABLE "public"."cinema_movies" TO "service_role";



GRANT ALL ON TABLE "public"."data_migrations" TO "anon";
GRANT ALL ON TABLE "public"."data_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."data_migrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."favorites" TO "anon";
GRANT ALL ON TABLE "public"."favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."favorites" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_accounts" TO "anon";
GRANT ALL ON TABLE "public"."instagram_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_flyers" TO "anon";
GRANT ALL ON TABLE "public"."instagram_flyers" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_flyers" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."scrape_runs" TO "anon";
GRANT ALL ON TABLE "public"."scrape_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."scrape_runs" TO "service_role";



GRANT ALL ON TABLE "public"."scrape_sources" TO "anon";
GRANT ALL ON TABLE "public"."scrape_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."scrape_sources" TO "service_role";



GRANT ALL ON TABLE "public"."user_favorites" TO "anon";
GRANT ALL ON TABLE "public"."user_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."user_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."user_followed_categories" TO "anon";
GRANT ALL ON TABLE "public"."user_followed_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."user_followed_categories" TO "service_role";



GRANT ALL ON TABLE "public"."user_followed_instagram_accounts" TO "anon";
GRANT ALL ON TABLE "public"."user_followed_instagram_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_followed_instagram_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."user_followed_venues" TO "anon";
GRANT ALL ON TABLE "public"."user_followed_venues" TO "authenticated";
GRANT ALL ON TABLE "public"."user_followed_venues" TO "service_role";



GRANT ALL ON TABLE "public"."user_radar_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_radar_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_radar_settings" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ============================================================================
-- Fuera del schema public (no lo incluye `supabase db dump`)
-- ============================================================================

-- Trigger de alta: crea la fila de public.profiles para cada usuario nuevo.
CREATE OR REPLACE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

-- Políticas RLS de storage.objects (bucket flyers). El bucket flyers_ig no
-- tiene políticas: solo escribe el service role.
CREATE POLICY "Allow authenticated upload of flyers" ON "storage"."objects"
  FOR INSERT TO "authenticated"
  WITH CHECK ((("bucket_id" = 'flyers'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

CREATE POLICY "Allow owner or admin delete of flyers" ON "storage"."objects"
  FOR DELETE TO "authenticated"
  USING ((("bucket_id" = 'flyers'::"text") AND ((("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") OR "public"."is_admin"())));

CREATE POLICY "Allow owner or admin update of flyers" ON "storage"."objects"
  FOR UPDATE TO "authenticated"
  USING ((("bucket_id" = 'flyers'::"text") AND ((("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") OR "public"."is_admin"())))
  WITH CHECK ((("bucket_id" = 'flyers'::"text") AND ((("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") OR "public"."is_admin"())));

CREATE POLICY "Allow public read of flyers" ON "storage"."objects"
  FOR SELECT TO "public"
  USING (("bucket_id" = 'flyers'::"text"));

-- Duplicado exacto de la anterior; está así en prod. Consolidarlo es un cambio
-- de esquema y va en una migración propia, no en el baseline.
CREATE POLICY "Public read access for flyers" ON "storage"."objects"
  FOR SELECT TO "public"
  USING (("bucket_id" = 'flyers'::"text"));

CREATE POLICY "Users can delete own flyers" ON "storage"."objects"
  FOR DELETE TO "public"
  USING ((("bucket_id" = 'flyers'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));

-- handle_new_user() no se ejecuta por RPC (Sprint 0, 0.6). pg_dump solo emite
-- el REVOKE de PUBLIC, pero los default privileges de public les dan EXECUTE a
-- anon y authenticated al crear la función: hay que sacárselo explícitamente.
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "anon", "authenticated";
