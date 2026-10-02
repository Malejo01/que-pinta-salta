
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "aliases": {
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
                },"events": {
                  Row: {
                    "age_restriction": number | null,"ai_metadata": Json | null,"category_id": string | null,"classification_source": string | null,"created_at": string | null,"created_by": string | null,"description": string | null,"end_date": string | null,"gallery_urls": (string)[] | null,"id": string,"image_url": string | null,"is_commercial": boolean | null,"is_featured": boolean | null,"is_free": boolean | null,"is_recurring": boolean | null,"price_max": number | null,"price_min": number | null,"recurrence_rule": string | null,"scrape_source_key": string | null,"short_description": string | null,"slug": string,"start_date": string,"status": Database["public"]['Enums']["event_status"] | null,"tags": (string)[] | null,"ticket_sources": Json | null,"ticket_url": string | null,"title": string,"updated_at": string | null,"venue_id": string | null,"view_count": number | null
                  }
                  Insert: {
                    "age_restriction"?: number | null,"ai_metadata"?: Json | null,"category_id"?: string | null,"classification_source"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"end_date"?: string | null,"gallery_urls"?: (string)[] | null,"id"?: string,"image_url"?: string | null,"is_commercial"?: boolean | null,"is_featured"?: boolean | null,"is_free"?: boolean | null,"is_recurring"?: boolean | null,"price_max"?: number | null,"price_min"?: number | null,"recurrence_rule"?: string | null,"scrape_source_key"?: string | null,"short_description"?: string | null,"slug": string,"start_date": string,"status"?: Database["public"]['Enums']["event_status"] | null,"tags"?: (string)[] | null,"ticket_sources"?: Json | null,"ticket_url"?: string | null,"title": string,"updated_at"?: string | null,"venue_id"?: string | null,"view_count"?: number | null
                  }
                  Update: {
                    "age_restriction"?: number | null,"ai_metadata"?: Json | null,"category_id"?: string | null,"classification_source"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"end_date"?: string | null,"gallery_urls"?: (string)[] | null,"id"?: string,"image_url"?: string | null,"is_commercial"?: boolean | null,"is_featured"?: boolean | null,"is_free"?: boolean | null,"is_recurring"?: boolean | null,"price_max"?: number | null,"price_min"?: number | null,"recurrence_rule"?: string | null,"scrape_source_key"?: string | null,"short_description"?: string | null,"slug"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["event_status"] | null,"tags"?: (string)[] | null,"ticket_sources"?: Json | null,"ticket_url"?: string | null,"title"?: string,"updated_at"?: string | null,"venue_id"?: string | null,"view_count"?: number | null
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
    }
                  ]
                },"user_radar_settings": {
                  Row: {
                    "created_at": string,"email_frequency": string,"email_target": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"email_frequency"?: string,"email_target"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"email_frequency"?: string,"email_target"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"venues": {
                  Row: {
                    "address": string,"capacity": number | null,"created_at": string | null,"google_maps_url": string | null,"id": string,"latitude": number | null,"longitude": number | null,"name": string,"phone": string | null
                  }
                  Insert: {
                    "address": string,"capacity"?: number | null,"created_at"?: string | null,"google_maps_url"?: string | null,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name": string,"phone"?: string | null
                  }
                  Update: {
                    "address"?: string,"capacity"?: number | null,"created_at"?: string | null,"google_maps_url"?: string | null,"id"?: string,"latitude"?: number | null,"longitude"?: number | null,"name"?: string,"phone"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "job_last_runs": {
                  Row: {
                    "job_key": string | null,"last_duration_ms": number | null,"last_errors": Json | null,"last_finished_at": string | null,"last_items_failed": number | null,"last_items_processed": number | null,"last_ok_started_at": string | null,"last_ok_status": string | null,"last_run_id": string | null,"last_started_at": string | null,"last_status": string | null,"last_trigger_source": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "event_status": "DRAFT"|"PUBLISHED"|"CANCELLED"|"PAST"|"PENDING","notification_type": "EMAIL"|"PUSH"|"WHATSAPP","user_role": "USER"|"ADMIN"
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
            "event_status": ["DRAFT", "PUBLISHED", "CANCELLED", "PAST", "PENDING"],"notification_type": ["EMAIL", "PUSH", "WHATSAPP"],"user_role": ["USER", "ADMIN"]
          }
        }
} as const
