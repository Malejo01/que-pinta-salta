// ============================================================
// Instagram Event Engine - Tipos y Configuración
// ============================================================

/** Registro de la tabla `instagram_accounts` */
export interface InstagramAccount {
  id: string
  username: string
  display_name: string
  profile_pic_url: string | null
  instagram_url: string         // columna generada
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  default_venue_name: string | null
  default_maps_url: string | null
  default_category: string
}

/** Registro de la tabla `instagram_flyers` */
export interface InstagramFlyer {
  id: string
  account_id: string
  ig_post_id: string
  ig_post_url: string
  ig_post_type: string
  caption: string | null
  published_at: string
  original_image_url: string | null
  storage_image_path: string | null
  storage_image_url: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  fetched_at: string
  archived_at: string | null
  created_at: string
  venue_name: string | null
  maps_url: string | null
  category: string
  price_min: number
  is_free: boolean
  ai_metadata?: any | null
  ai_processed_at?: string | null
  ai_status?: 'PENDING' | 'PROCESSED' | 'FAILED' | 'SKIPPED'
}

/** Flyer con datos de la cuenta (JOIN) */
export interface FlyerWithAccount extends InstagramFlyer {
  account: InstagramAccount
}

/**
 * Estructura de un post individual en el payload de Apify.
 * Basado en el output del actor apify/instagram-post-scraper.
 */
export interface ApifyInstagramPost {
  id: string                    // ID único del post en IG
  url: string                   // URL pública del post (https://www.instagram.com/p/xxx)
  displayUrl: string            // URL de la imagen principal (CDN de IG, efímera)
  caption: string | null        // Texto del caption
  timestamp: string             // ISO timestamp de publicación
  ownerUsername: string          // Username del dueño del post
  type: 'Image' | 'Video' | 'Sidecar'
  // Campos adicionales que Apify puede devolver
  likesCount?: number
  commentsCount?: number
  videoUrl?: string             // Solo para type='Video'
  images?: string[]             // Solo para type='Sidecar' (carrusel)
}

/**
 * Payload completo que Apify envía al webhook.
 * Puede venir como array directo o envuelto en un objeto.
 */
export type ApifyWebhookPayload =
  | ApifyInstagramPost[]
  | {
      resource: {
        defaultDatasetId: string
      }
    }

/** Configuración del motor de Instagram */
export const INSTAGRAM_ENGINE_CONFIG = {
  /** Tiempo de vida útil del flyer en días (desde published_at) */
  TTL_DAYS: 14,

  /** Cantidad máxima de posts a obtener por cuenta */
  MAX_POSTS_PER_ACCOUNT: 3,

  /** Nombre del bucket en Supabase Storage */
  STORAGE_BUCKET: 'flyers_ig',

  /** Calidad de re-upload JPEG (si se comprime) */
  IMAGE_QUALITY: 85,

  /** Tamaño máximo de imagen en bytes (5MB) */
  MAX_IMAGE_SIZE: 5 * 1024 * 1024,
} as const
