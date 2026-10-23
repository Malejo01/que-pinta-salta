
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ad_campaign_reports": {
                  Row: {
                    "created_at": string,"created_by": string | null,"desde": string,"event_id": string,"hasta": string,"id": string,"metricas": NonNullable<Json>,"precio_ars": number | null,"sponsored_campaign_id": string | null,"tipo": string,"token": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"desde": string,"event_id": string,"hasta": string,"id"?: string,"metricas"?: NonNullable<Json>,"precio_ars"?: number | null,"sponsored_campaign_id"?: string | null,"tipo": string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"desde"?: string,"event_id"?: string,"hasta"?: string,"id"?: string,"metricas"?: NonNullable<Json>,"precio_ars"?: number | null,"sponsored_campaign_id"?: string | null,"tipo"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ad_campaign_reports_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ad_campaign_reports_sponsored_campaign_id_fkey"
      columns: ["sponsored_campaign_id"]
isOneToOne: false
      referencedRelation: "sponsored_campaigns"
      referencedColumns: ["id"]
    }
                  ]
                },"ad_occupancy_daily": {
                  Row: {
                    "created_at": string,"day": string,"hero_cupos": number,"hero_ocupados": number,"push_cupos": number,"push_cupos_usados": number
                  }
                  Insert: {
                    "created_at"?: string,"day": string,"hero_cupos": number,"hero_ocupados": number,"push_cupos"?: number,"push_cupos_usados"?: number
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"hero_cupos"?: number,"hero_ocupados"?: number,"push_cupos"?: number,"push_cupos_usados"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ad_price_cycles": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"audiencia": number,"audiencia_web_28d": number,"cambio_tramo_desde": string | null,"ciclo": string,"created_at": string,"dispositivos_push": number | null,"estado": string,"factor_hero": number,"factor_push": number,"fuente_audiencia": string,"fuente_tipo_cambio": string,"mau_app_28d": number | null,"ocupacion_hero": number | null,"ocupacion_push": number | null,"tipo_cambio": number,"tramo_calculado": number,"tramo_vigente": number
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audiencia": number,"audiencia_web_28d": number,"cambio_tramo_desde"?: string | null,"ciclo": string,"created_at"?: string,"dispositivos_push"?: number | null,"estado"?: string,"factor_hero"?: number,"factor_push"?: number,"fuente_audiencia": string,"fuente_tipo_cambio": string,"mau_app_28d"?: number | null,"ocupacion_hero"?: number | null,"ocupacion_push"?: number | null,"tipo_cambio": number,"tramo_calculado": number,"tramo_vigente": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audiencia"?: number,"audiencia_web_28d"?: number,"cambio_tramo_desde"?: string | null,"ciclo"?: string,"created_at"?: string,"dispositivos_push"?: number | null,"estado"?: string,"factor_hero"?: number,"factor_push"?: number,"fuente_audiencia"?: string,"fuente_tipo_cambio"?: string,"mau_app_28d"?: number | null,"ocupacion_hero"?: number | null,"ocupacion_push"?: number | null,"tipo_cambio"?: number,"tramo_calculado"?: number,"tramo_vigente"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ad_prices": {
                  Row: {
                    "ciclo": string,"created_at": string,"estado": string,"id": string,"precio_ars": number,"precio_fundador_ars": number | null,"precio_usd": number,"producto": string,"tipo_cambio": number,"tramo_ref": number,"vigente_desde": string
                  }
                  Insert: {
                    "ciclo": string,"created_at"?: string,"estado"?: string,"id"?: string,"precio_ars": number,"precio_fundador_ars"?: number | null,"precio_usd": number,"producto": string,"tipo_cambio": number,"tramo_ref": number,"vigente_desde": string
                  }
                  Update: {
                    "ciclo"?: string,"created_at"?: string,"estado"?: string,"id"?: string,"precio_ars"?: number,"precio_fundador_ars"?: number | null,"precio_usd"?: number,"producto"?: string,"tipo_cambio"?: number,"tramo_ref"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ad_prices_ciclo_fkey"
      columns: ["ciclo"]
isOneToOne: false
      referencedRelation: "ad_price_cycles"
      referencedColumns: ["ciclo"]
    }
                  ]
                },"ad_settings": {
                  Row: {
                    "aprobacion_automatica": boolean,"id": boolean,"push_patrocinado_pausa_motivo": string | null,"push_patrocinado_pausado_at": string | null,"umbral_bajas_push": number,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "aprobacion_automatica"?: boolean,"id"?: boolean,"push_patrocinado_pausa_motivo"?: string | null,"push_patrocinado_pausado_at"?: string | null,"umbral_bajas_push"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "aprobacion_automatica"?: boolean,"id"?: boolean,"push_patrocinado_pausa_motivo"?: string | null,"push_patrocinado_pausado_at"?: string | null,"umbral_bajas_push"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"aliases": {
                  Row: {
                    "alias": string,"created_at": string | null,"created_by": string | null,"id": string,"target_id": string,"target_type": string
                  }
                  Insert: {
                    "alias": string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"target_id": string,"target_type": string
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "aliases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string | null,"created_at": string | null,"icon": string | null,"id": string,"name": string,"slug": string
                  }
                  Insert: {
                    "color"?: string | null,"created_at"?: string | null,"icon"?: string | null,"id"?: string,"name": string,"slug": string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string | null,"icon"?: string | null,"id"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cinema_movies": {
                  Row: {
                    "created_at": string,"id": string,"is_currently_showing": boolean,"poster_url": string | null,"showings": NonNullable<Json>,"slug": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_currently_showing"?: boolean,"poster_url"?: string | null,"showings"?: NonNullable<Json>,"slug": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_currently_showing"?: boolean,"poster_url"?: string | null,"showings"?: NonNullable<Json>,"slug"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"data_migrations": {
                  Row: {
                    "applied_at": string,"name": string,"notes": string | null
                  }
                  Insert: {
                    "applied_at"?: string,"name": string,"notes"?: string | null
                  }
                  Update: {
                    "applied_at"?: string,"name"?: string,"notes"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"duplicate_dismissals": {
                  Row: {
                    "decided_at": string,"decided_by": string,"event_a": string,"event_b": string
                  }
                  Insert: {
                    "decided_at"?: string,"decided_by"?: string,"event_a": string,"event_b": string
                  }
                  Update: {
                    "decided_at"?: string,"decided_by"?: string,"event_a"?: string,"event_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "duplicate_dismissals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duplicate_dismissals_event_a_fkey"
      columns: ["event_a"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "duplicate_dismissals_event_b_fkey"
      columns: ["event_b"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_attendance": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"kind": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"kind": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"kind"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_attendance_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_attendance_totals": {
                  Row: {
                    "event_id": string,"me_interesa": number,"voy": number
                  }
                  Insert: {
                    "event_id": string,"me_interesa"?: number,"voy"?: number
                  }
                  Update: {
                    "event_id"?: string,"me_interesa"?: number,"voy"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_attendance_totals_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_metrics_daily": {
                  Row: {
                    "clicks": number,"day": string,"event_id": string,"featured": boolean,"origin": string,"views": number
                  }
                  Insert: {
                    "clicks"?: number,"day": string,"event_id": string,"featured"?: boolean,"origin": string,"views"?: number
                  }
                  Update: {
                    "clicks"?: number,"day"?: string,"event_id"?: string,"featured"?: boolean,"origin"?: string,"views"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_metrics_daily_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "age_restriction": number | null,"ai_metadata": Json | null,"category_id": string | null,"classification_source": string | null,"created_at": string | null,"created_by": string | null,"dedup_key": string | null,"description": string | null,"end_date": string | null,"featured_set_at": string | null,"featured_set_by": string | null,"featured_until": string | null,"gallery_urls": (string)[] | null,"id": string,"image_url": string | null,"is_commercial": boolean | null,"is_featured": boolean | null,"is_free": boolean | null,"is_recurring": boolean | null,"merge_audit": NonNullable<Json>,"price_max": number | null,"price_min": number | null,"recurrence_rule": string | null,"scrape_source_key": string | null,"short_description": string | null,"slug": string,"start_date": string,"status": Database["public"]['Enums']["event_status"] | null,"tags": (string)[] | null,"ticket_sources": Json | null,"ticket_url": string | null,"title": string,"updated_at": string | null,"venue_id": string | null,"view_count": number | null
                  }
                  Insert: {
                    "age_restriction"?: number | null,"ai_metadata"?: Json | null,"category_id"?: string | null,"classification_source"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"dedup_key"?: string | null,"description"?: string | null,"end_date"?: string | null,"featured_set_at"?: string | null,"featured_set_by"?: string | null,"featured_until"?: string | null,"gallery_urls"?: (string)[] | null,"id"?: string,"image_url"?: string | null,"is_commercial"?: boolean | null,"is_featured"?: boolean | null,"is_free"?: boolean | null,"is_recurring"?: boolean | null,"merge_audit"?: NonNullable<Json>,"price_max"?: number | null,"price_min"?: number | null,"recurrence_rule"?: string | null,"scrape_source_key"?: string | null,"short_description"?: string | null,"slug": string,"start_date": string,"status"?: Database["public"]['Enums']["event_status"] | null,"tags"?: (string)[] | null,"ticket_sources"?: Json | null,"ticket_url"?: string | null,"title": string,"updated_at"?: string | null,"venue_id"?: string | null,"view_count"?: number | null
                  }
                  Update: {
                    "age_restriction"?: number | null,"ai_metadata"?: Json | null,"category_id"?: string | null,"classification_source"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"dedup_key"?: string | null,"description"?: string | null,"end_date"?: string | null,"featured_set_at"?: string | null,"featured_set_by"?: string | null,"featured_until"?: string | null,"gallery_urls"?: (string)[] | null,"id"?: string,"image_url"?: string | null,"is_commercial"?: boolean | null,"is_featured"?: boolean | null,"is_free"?: boolean | null,"is_recurring"?: boolean | null,"merge_audit"?: NonNullable<Json>,"price_max"?: number | null,"price_min"?: number | null,"recurrence_rule"?: string | null,"scrape_source_key"?: string | null,"short_description"?: string | null,"slug"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["event_status"] | null,"tags"?: (string)[] | null,"ticket_sources"?: Json | null,"ticket_url"?: string | null,"title"?: string,"updated_at"?: string | null,"venue_id"?: string | null,"view_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "created_at": string | null,"event_id": string,"id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"event_id": string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"event_id"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"instagram_accounts": {
                  Row: {
                    "created_at": string,"default_category": string,"default_maps_url": string | null,"default_venue_name": string | null,"display_name": string,"id": string,"instagram_url": string | null,"is_active": boolean,"notes": string | null,"profile_pic_url": string | null,"updated_at": string,"username": string
                  }
                  Insert: {
                    "created_at"?: string,"default_category"?: string,"default_maps_url"?: string | null,"default_venue_name"?: string | null,"display_name": string,"id"?: string,"instagram_url"?: never,"is_active"?: boolean,"notes"?: string | null,"profile_pic_url"?: string | null,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "created_at"?: string,"default_category"?: string,"default_maps_url"?: string | null,"default_venue_name"?: string | null,"display_name"?: string,"id"?: string,"instagram_url"?: never,"is_active"?: boolean,"notes"?: string | null,"profile_pic_url"?: string | null,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"instagram_flyers": {
                  Row: {
                    "account_id": string,"ai_metadata": Json | null,"ai_processed_at": string | null,"ai_status": string | null,"archived_at": string | null,"caption": string | null,"category": string,"created_at": string,"fetched_at": string,"id": string,"ig_post_id": string,"ig_post_type": string | null,"ig_post_url": string,"is_free": boolean,"maps_url": string | null,"original_image_url": string | null,"price_min": number,"published_at": string,"status": string,"storage_image_path": string | null,"storage_image_url": string | null,"venue_name": string | null
                  }
                  Insert: {
                    "account_id": string,"ai_metadata"?: Json | null,"ai_processed_at"?: string | null,"ai_status"?: string | null,"archived_at"?: string | null,"caption"?: string | null,"category"?: string,"created_at"?: string,"fetched_at"?: string,"id"?: string,"ig_post_id": string,"ig_post_type"?: string | null,"ig_post_url": string,"is_free"?: boolean,"maps_url"?: string | null,"original_image_url"?: string | null,"price_min"?: number,"published_at": string,"status"?: string,"storage_image_path"?: string | null,"storage_image_url"?: string | null,"venue_name"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"ai_metadata"?: Json | null,"ai_processed_at"?: string | null,"ai_status"?: string | null,"archived_at"?: string | null,"caption"?: string | null,"category"?: string,"created_at"?: string,"fetched_at"?: string,"id"?: string,"ig_post_id"?: string,"ig_post_type"?: string | null,"ig_post_url"?: string,"is_free"?: boolean,"maps_url"?: string | null,"original_image_url"?: string | null,"price_min"?: number,"published_at"?: string,"status"?: string,"storage_image_path"?: string | null,"storage_image_url"?: string | null,"venue_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_flyers_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "instagram_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "details": NonNullable<Json>,"duration_ms": number | null,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"items_failed": number,"items_processed": number,"job_key": string,"started_at": string,"status": string,"trigger_source": string
                  }
                  Insert: {
                    "details"?: NonNullable<Json>,"duration_ms"?: number | null,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"items_failed"?: number,"items_processed"?: number,"job_key": string,"started_at"?: string,"status": string,"trigger_source"?: string
                  }
                  Update: {
                    "details"?: NonNullable<Json>,"duration_ms"?: number | null,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"items_failed"?: number,"items_processed"?: number,"job_key"?: string,"started_at"?: string,"status"?: string,"trigger_source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_preferences": {
                  Row: {
                    "announcements": boolean,"created_at": string,"daily_cap": number,"favorite_reminders": boolean,"follow_news": boolean,"quiet_end": string,"quiet_start": string,"radar_channel": string,"sponsored": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "announcements"?: boolean,"created_at"?: string,"daily_cap"?: number,"favorite_reminders"?: boolean,"follow_news"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"radar_channel"?: string,"sponsored"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "announcements"?: boolean,"created_at"?: string,"daily_cap"?: number,"favorite_reminders"?: boolean,"follow_news"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"radar_channel"?: string,"sponsored"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notification_sends": {
                  Row: {
                    "campaign_id": string | null,"channel": string,"dedupe_key": string,"event_id": string | null,"id": string,"kind": string,"sent_at": string,"status": string,"user_id": string
                  }
                  Insert: {
                    "campaign_id"?: string | null,"channel": string,"dedupe_key": string,"event_id"?: string | null,"id"?: string,"kind": string,"sent_at"?: string,"status": string,"user_id": string
                  }
                  Update: {
                    "campaign_id"?: string | null,"channel"?: string,"dedupe_key"?: string,"event_id"?: string | null,"id"?: string,"kind"?: string,"sent_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_sends_campaign_id_fkey"
      columns: ["campaign_id"]
isOneToOne: false
      referencedRelation: "sponsored_campaigns"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_sends_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"contact_type": string | null,"contact_value": string | null,"created_at": string | null,"email": string,"favorite_categories": (string)[] | null,"full_name": string | null,"id": string,"notification_preferences": (Database["public"]['Enums']["notification_type"])[] | null,"role": Database["public"]['Enums']["user_role"] | null,"updated_at": string | null
                  }
                  Insert: {
                    "avatar_url"?: string | null,"contact_type"?: string | null,"contact_value"?: string | null,"created_at"?: string | null,"email": string,"favorite_categories"?: (string)[] | null,"full_name"?: string | null,"id": string,"notification_preferences"?: (Database["public"]['Enums']["notification_type"])[] | null,"role"?: Database["public"]['Enums']["user_role"] | null,"updated_at"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"contact_type"?: string | null,"contact_value"?: string | null,"created_at"?: string | null,"email"?: string,"favorite_categories"?: (string)[] | null,"full_name"?: string | null,"id"?: string,"notification_preferences"?: (Database["public"]['Enums']["notification_type"])[] | null,"role"?: Database["public"]['Enums']["user_role"] | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"id": string,"last_seen_at": string,"platform": string,"token": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"platform": string,"token": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_seen_at"?: string,"platform"?: string,"token"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scrape_runs": {
                  Row: {
                    "created_at": string,"errors": NonNullable<Json>,"finished_at": string | null,"id": string,"inserted_count": number,"message": string | null,"skipped_count": number,"source_id": string | null,"source_key": string,"started_at": string,"status": string,"triggered_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"inserted_count"?: number,"message"?: string | null,"skipped_count"?: number,"source_id"?: string | null,"source_key": string,"started_at"?: string,"status": string,"triggered_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"id"?: string,"inserted_count"?: number,"message"?: string | null,"skipped_count"?: number,"source_id"?: string | null,"source_key"?: string,"started_at"?: string,"status"?: string,"triggered_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "scrape_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "scrape_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"scrape_sources": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_enabled": boolean,"key": string,"name": string,"site_url": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_enabled"?: boolean,"key": string,"name": string,"site_url"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_enabled"?: boolean,"key"?: string,"name"?: string,"site_url"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sponsored_campaigns": {
                  Row: {
                    "bajas_48h": number | null,"bajas_medidas_at": string | null,"body": string,"created_at": string,"created_by": string | null,"destinatarios": number | null,"ends_at": string,"event_id": string | null,"id": string,"sent_at": string | null,"starts_at": string,"title": string,"url": string | null
                  }
                  Insert: {
                    "bajas_48h"?: number | null,"bajas_medidas_at"?: string | null,"body": string,"created_at"?: string,"created_by"?: string | null,"destinatarios"?: number | null,"ends_at": string,"event_id"?: string | null,"id"?: string,"sent_at"?: string | null,"starts_at": string,"title": string,"url"?: string | null
                  }
                  Update: {
                    "bajas_48h"?: number | null,"bajas_medidas_at"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"destinatarios"?: number | null,"ends_at"?: string,"event_id"?: string | null,"id"?: string,"sent_at"?: string | null,"starts_at"?: string,"title"?: string,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sponsored_campaigns_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"user_favorites": {
                  Row: {
                    "cinema_movie_id": string | null,"created_at": string,"event_id": string | null,"id": string,"instagram_flyer_id": string | null,"user_id": string
                  }
                  Insert: {
                    "cinema_movie_id"?: string | null,"created_at"?: string,"event_id"?: string | null,"id"?: string,"instagram_flyer_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "cinema_movie_id"?: string | null,"created_at"?: string,"event_id"?: string | null,"id"?: string,"instagram_flyer_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_favorites_cinema_movie_id_fkey"
      columns: ["cinema_movie_id"]
isOneToOne: false
      referencedRelation: "cinema_movies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_favorites_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_favorites_instagram_flyer_id_fkey"
      columns: ["instagram_flyer_id"]
isOneToOne: false
      referencedRelation: "instagram_flyers"
      referencedColumns: ["id"]
    }
                  ]
                },"user_followed_categories": {
                  Row: {
                    "category_id": string,"user_id": string
                  }
                  Insert: {
                    "category_id": string,"user_id": string
                  }
                  Update: {
                    "category_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_followed_categories_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"user_followed_instagram_accounts": {
                  Row: {
                    "instagram_account_id": string,"user_id": string
                  }
                  Insert: {
                    "instagram_account_id": string,"user_id": string
                  }
                  Update: {
                    "instagram_account_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_followed_instagram_accounts_instagram_account_id_fkey"
      columns: ["instagram_account_id"]
isOneToOne: false
      referencedRelation: "instagram_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"user_followed_venues": {
                  Row: {
                    "user_id": string,"venue_id": string
                  }
                  Insert: {
                    "user_id": string,"venue_id": string
                  }
                  Update: {
                    "user_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_followed_venues_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_followed_venues_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    }
                  ]
                },"user_radar_settings": {
                  Row: {
                    "created_at": string,"email_frequency": string,"email_target": string | null,"last_sent_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"email_frequency"?: string,"email_target"?: string | null,"last_sent_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email_frequency"?: string,"email_target"?: string | null,"last_sent_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"venue_aliases": {
                  Row: {
                    "alias": string,"alias_normalized": string | null,"created_at": string,"created_by": string | null,"id": string,"source": string,"venue_id": string
                  }
                  Insert: {
                    "alias": string,"alias_normalized"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"source"?: string,"venue_id": string
                  }
                  Update: {
                    "alias"?: string,"alias_normalized"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"source"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_aliases_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_aliases_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_merge_log": {
                  Row: {
                    "created_at": string,"entity": string,"entity_id": string,"from_venue_id": string | null,"id": string,"migration_tag": string,"old_values": Json | null,"to_venue_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"entity": string,"entity_id": string,"from_venue_id"?: string | null,"id"?: string,"migration_tag": string,"old_values"?: Json | null,"to_venue_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"entity"?: string,"entity_id"?: string,"from_venue_id"?: string | null,"id"?: string,"migration_tag"?: string,"old_values"?: Json | null,"to_venue_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"venue_review_queue": {
                  Row: {
                    "created_at": string,"id": string,"legacy_venue_id": string | null,"normalized": string | null,"notes": string | null,"occurrences": number,"raw_name": string,"resolved_venue_id": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"similarity": number | null,"source": string | null,"status": Database["public"]['Enums']["venue_review_status"],"suggested_venue_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"legacy_venue_id"?: string | null,"normalized"?: never,"notes"?: string | null,"occurrences"?: number,"raw_name": string,"resolved_venue_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"similarity"?: number | null,"source"?: string | null,"status"?: Database["public"]['Enums']["venue_review_status"],"suggested_venue_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"legacy_venue_id"?: string | null,"normalized"?: never,"notes"?: string | null,"occurrences"?: number,"raw_name"?: string,"resolved_venue_id"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"similarity"?: number | null,"source"?: string | null,"status"?: Database["public"]['Enums']["venue_review_status"],"suggested_venue_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_review_queue_legacy_venue_id_fkey"
      columns: ["legacy_venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_review_queue_legacy_venue_id_fkey"
      columns: ["legacy_venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_review_queue_resolved_venue_id_fkey"
      columns: ["resolved_venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_review_queue_resolved_venue_id_fkey"
      columns: ["resolved_venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_review_queue_suggested_venue_id_fkey"
      columns: ["suggested_venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_review_queue_suggested_venue_id_fkey"
      columns: ["suggested_venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string,"canonical_venue_id": string | null,"capacity": number | null,"created_at": string | null,"geocode_source": string | null,"geocoded_at": string | null,"google_maps_url": string | null,"id": string,"is_placeholder": boolean,"latitude": number | null,"longitude": number | null,"merged_at": string | null,"name": string,"phone": string | null,"slug": string | null,"updated_at": string
                  }
                  Insert: {
                    "address": string,"canonical_venue_id"?: string | null,"capacity"?: number | null,"created_at"?: string | null,"geocode_source"?: string | null,"geocoded_at"?: string | null,"google_maps_url"?: string | null,"id"?: string,"is_placeholder"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"merged_at"?: string | null,"name": string,"phone"?: string | null,"slug"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string,"canonical_venue_id"?: string | null,"capacity"?: number | null,"created_at"?: string | null,"geocode_source"?: string | null,"geocoded_at"?: string | null,"google_maps_url"?: string | null,"id"?: string,"is_placeholder"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"merged_at"?: string | null,"name"?: string,"phone"?: string | null,"slug"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_canonical_venue_id_fkey"
      columns: ["canonical_venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venues_canonical_venue_id_fkey"
      columns: ["canonical_venue_id"]
isOneToOne: false
      referencedRelation: "venues_canonical"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "event_attendance_counts": {
                  Row: {
                    "event_id": string | null,"me_interesa": number | null,"voy": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_attendance_totals_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_duplicate_groups": {
                  Row: {
                    "dedup_key": string | null,"event_ids": (string)[] | null,"first_seen": string | null,"sources": (string)[] | null,"total": number | null
                  }
                  Relationships: [
                    
                  ]
                },"job_last_runs": {
                  Row: {
                    "job_key": string | null,"last_duration_ms": number | null,"last_errors": Json | null,"last_finished_at": string | null,"last_items_failed": number | null,"last_items_processed": number | null,"last_ok_started_at": string | null,"last_ok_status": string | null,"last_run_id": string | null,"last_started_at": string | null,"last_status": string | null,"last_trigger_source": string | null
                  }
                  Relationships: [
                    
                  ]
                },"venues_canonical": {
                  Row: {
                    "address": string | null,"alias_count": number | null,"capacity": number | null,"created_at": string | null,"event_count": number | null,"google_maps_url": string | null,"id": string | null,"latitude": number | null,"longitude": number | null,"name": string | null,"phone": string | null,"slug": string | null
                  }
                  Insert: {
                           "address"?: string | null,"alias_count"?: never,"capacity"?: number | null,"created_at"?: string | null,"event_count"?: never,"google_maps_url"?: string | null,"id"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name"?: string | null,"phone"?: string | null,"slug"?: string | null
                         }
                        Update: {
                           "address"?: string | null,"alias_count"?: never,"capacity"?: number | null,"created_at"?: string | null,"event_count"?: never,"google_maps_url"?: string | null,"id"?: string | null,"latitude"?: number | null,"longitude"?: number | null,"name"?: string | null,"phone"?: string | null,"slug"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"merge_events":
{ Args: { "drop_id": string,"keep_id": string }; Returns: Json
                           },
"purge_notification_sends":
{ Args: { "p_days"?: number }; Returns: number
                           },
"record_event_metric":
{ Args: { "p_event_id": string,"p_kind": string,"p_origin": string }; Returns: undefined
                           },
"register_push_token":
{ Args: { "p_platform": string,"p_token": string }; Returns: undefined
                           },
"resolve_venue_id":
{ Args: { "p_autocreate"?: boolean,"p_raw": string,"p_source"?: string,"p_threshold"?: number }; Returns: string
                           },
"unmerge_event":
{ Args: { "drop_id": string }; Returns: Json
                           },
"venue_canonical_of":
{ Args: { "p_id": string }; Returns: string
                           },
"venue_core_key":
{ Args: { "raw": string }; Returns: string
                           },
"venue_normalize":
{ Args: { "raw": string }; Returns: string
                           },
"venue_sanitize":
{ Args: { "raw": string }; Returns: string
                           },
"venue_slugify":
{ Args: { "raw": string }; Returns: string
                           },
"venue_useful_address":
{ Args: { "p_address": string,"p_name": string }; Returns: string
                           }
          }
          Enums: {
            "event_status": "DRAFT"|"PUBLISHED"|"CANCELLED"|"PAST"|"PENDING","notification_type": "EMAIL"|"PUSH"|"WHATSAPP","user_role": "USER"|"ADMIN","venue_review_status": "pending"|"resolved"|"rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "event_status": ["DRAFT", "PUBLISHED", "CANCELLED", "PAST", "PENDING"],"notification_type": ["EMAIL", "PUSH", "WHATSAPP"],"user_role": ["USER", "ADMIN"],"venue_review_status": ["pending", "resolved", "rejected"]
          }
        }
} as const
