'use server'

import { createAdminClient } from '@/lib/supabase/server'
import type { ApifyInstagramPost } from '@/lib/instagram-config'
import { INSTAGRAM_ENGINE_CONFIG } from '@/lib/instagram-config'

type ProcessResult = {
  inserted: number
  skipped: number
  errors: string[]
}

/**
 * Descarga una imagen desde una URL y la sube a Supabase Storage.
 * Retorna la URL pública del archivo subido, o null si falla.
 */
async function downloadAndUploadImage(
  imageUrl: string,
  storagePath: string
): Promise<string | null> {
  const supabase = createAdminClient()

  try {
    // Descargar imagen desde CDN de Instagram
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuePintaSalta/1.0)',
      },
    })

    if (!response.ok) {
      console.warn(`[IG Engine] No se pudo descargar imagen: ${response.status} ${imageUrl}`)
      return null
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Verificar tamaño máximo
    if (buffer.length > INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE) {
      console.warn(`[IG Engine] Imagen excede ${INSTAGRAM_ENGINE_CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB: ${storagePath}`)
      return null
    }

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) {
      console.error(`[IG Engine] Error subiendo a Storage: ${uploadError.message}`)
      return null
    }

    // Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from(INSTAGRAM_ENGINE_CONFIG.STORAGE_BUCKET)
      .getPublicUrl(storagePath)

    return publicUrlData.publicUrl
  } catch (err) {
    console.error(`[IG Engine] Excepción descargando/subiendo imagen:`, err)
    return null
  }
}

/**
 * Genera el path de almacenamiento en el bucket.
 * Formato: {username}/{postId}.jpg
 */
function buildStoragePath(username: string, postId: string): string {
  // Limpiar caracteres problemáticos del postId
  const safeId = postId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${username}/${safeId}.jpg`
}

/**
 * Procesa el array de posts de Apify y los persiste en la DB.
 * - Resuelve account_id por username
 * - Deduplica por ig_post_id
 * - Descarga y re-sube imágenes a Supabase Storage
 * - Inserta registros en instagram_flyers
 */
export async function processApifyPayload(
  posts: ApifyInstagramPost[]
): Promise<ProcessResult> {
  const supabase = createAdminClient()
  const result: ProcessResult = { inserted: 0, skipped: 0, errors: [] }

  // Agrupar posts por username para resolver accounts en batch
  const usernameSet = new Set(posts.map((p) => p.ownerUsername.toLowerCase()))

  // Obtener accounts activas de la DB
  const { data: accounts, error: accountsError } = await supabase
    .from('instagram_accounts')
    .select('id, username')
    .eq('is_active', true)

  if (accountsError || !accounts) {
    result.errors.push(`Error obteniendo cuentas: ${accountsError?.message}`)
    return result
  }

  // Mapa username -> account_id
  const accountMap = new Map(
    accounts.map((a) => [a.username.toLowerCase(), a.id as string])
  )

  // Obtener IDs de posts ya existentes para deduplicar en batch
  const postIds = posts.map((p) => p.id)
  const { data: existingPosts } = await supabase
    .from('instagram_flyers')
    .select('ig_post_id')
    .in('ig_post_id', postIds)

  const existingPostIds = new Set(
    (existingPosts ?? []).map((p) => p.ig_post_id as string)
  )

  for (const post of posts) {
    const username = post.ownerUsername.toLowerCase()

    try {
      // Verificar que la cuenta está registrada
      const accountId = accountMap.get(username)
      if (!accountId) {
        console.log(`[IG Engine] Cuenta no registrada, skip: @${username}`)
        result.skipped++
        continue
      }

      // Deduplicar
      if (existingPostIds.has(post.id)) {
        console.log(`[IG Engine] Post ya existe, skip: ${post.id}`)
        result.skipped++
        continue
      }

      // Determinar URL de imagen (para videos, usar displayUrl que es el thumbnail)
      const imageUrl = post.displayUrl
      if (!imageUrl) {
        console.warn(`[IG Engine] Post sin imagen, skip: ${post.id}`)
        result.skipped++
        continue
      }

      // Descargar y re-subir imagen a Storage
      const storagePath = buildStoragePath(username, post.id)
      const storageUrl = await downloadAndUploadImage(imageUrl, storagePath)

      if (!storageUrl) {
        result.errors.push(`Fallo re-upload para post ${post.id} de @${username}`)
        // Insertamos de todas formas con la URL original como fallback
      }

      // Insertar en la tabla
      const { error: insertError } = await supabase
        .from('instagram_flyers')
        .insert({
          account_id: accountId,
          ig_post_id: post.id,
          ig_post_url: post.url,
          ig_post_type: post.type || 'Image',
          caption: post.caption || null,
          published_at: post.timestamp,
          original_image_url: imageUrl,
          storage_image_path: storagePath,
          storage_image_url: storageUrl || imageUrl, // fallback a URL original
        })

      if (insertError) {
        // Si es un conflicto de unique (race condition), contar como skip
        if (insertError.code === '23505') {
          result.skipped++
        } else {
          result.errors.push(`Error insertando post ${post.id}: ${insertError.message}`)
        }
        continue
      }

      result.inserted++
      console.log(`[IG Engine] ✓ Nuevo flyer: @${username} - ${post.id}`)
    } catch (err: any) {
      result.errors.push(`Excepción en post ${post.id}: ${err?.message}`)
    }
  }

  return result
}

/**
 * Archiva flyers cuyo published_at supera el TTL configurado (14 días).
 * Retorna la cantidad de flyers archivados.
 */
export async function archiveExpiredFlyers(): Promise<number> {
  const supabase = createAdminClient()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - INSTAGRAM_ENGINE_CONFIG.TTL_DAYS)

  const { data, error } = await supabase
    .from('instagram_flyers')
    .update({
      status: 'ARCHIVED',
      archived_at: new Date().toISOString(),
    })
    .eq('status', 'ACTIVE')
    .lt('published_at', cutoffDate.toISOString())
    .select('id')

  if (error) {
    console.error(`[IG Engine] Error archivando flyers: ${error.message}`)
    return 0
  }

  const count = data?.length ?? 0
  if (count > 0) {
    console.log(`[IG Engine] 🗄️ Archivados ${count} flyers expirados (TTL: ${INSTAGRAM_ENGINE_CONFIG.TTL_DAYS} días)`)
  }

  return count
}

/**
 * Dispara el actor de Apify para extraer flyers de las cuentas activas
 * utilizando una ventana de extracción de 7 días.
 */
export async function triggerApifyInstagramScraper(): Promise<{
  success: boolean
  message: string
  runId?: string
  errors: string[]
}> {
  const supabase = createAdminClient()
  const errors: string[] = []

  const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN
  if (!APIFY_API_TOKEN) {
    const msg = 'APIFY_API_TOKEN no configurado en las variables de entorno'
    console.error(`[IG Engine] ${msg}`)
    return { success: false, message: msg, errors: [msg] }
  }

  try {
    // 1. Obtener cuentas activas a monitorear
    const { data: accounts, error: accountsError } = await supabase
      .from('instagram_accounts')
      .select('username')
      .eq('is_active', true)

    if (accountsError) {
      const msg = `Error al consultar instagram_accounts: ${accountsError.message}`
      console.error(`[IG Engine] ${msg}`)
      return { success: false, message: msg, errors: [msg] }
    }

    if (!accounts || accounts.length === 0) {
      const msg = 'No hay cuentas de Instagram activas registradas para scrapear'
      console.warn(`[IG Engine] ${msg}`)
      return { success: true, message: msg, errors: [] }
    }

    const usernames = accounts.map(acc => acc.username)
    console.log(`[IG Engine] Cuentas activas a scrapear (${usernames.length}):`, usernames)

    // 2. Calcular ventana de extracción (7 días atrás YYYY-MM-DD)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const onlyPostsNewerThan = sevenDaysAgo.toISOString().split('T')[0]
    
    // Usar la cantidad de posts configurada en el motor
    const resultsLimit = INSTAGRAM_ENGINE_CONFIG.MAX_POSTS_PER_ACCOUNT || 3

    const apifyPayload = {
      usernames,
      resultsLimit,
      onlyPostsNewerThan,
      skipPinnedPosts: true
    }

    console.log(`[IG Engine] Configurando payload de Apify: ventana desde ${onlyPostsNewerThan}, límite de ${resultsLimit} posts por cuenta`)

    // 3. Disparar el actor de Apify
    const actorUrl = `https://api.apify.com/v2/acts/apify~instagram-post-scraper/runs?token=${APIFY_API_TOKEN}`
    
    const response = await fetch(actorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(apifyPayload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      let parsedError
      try {
        parsedError = JSON.parse(errorText)
      } catch {
        parsedError = null
      }
      
      const errorMessage = parsedError?.error?.message || errorText || 'Error desconocido'
      
      if (response.status === 401) {
        errors.push('Fallo de Autenticación: El APIFY_API_TOKEN configurado no es válido.')
      } else if (response.status === 402) {
        errors.push('Fallo de Saldo/Límites: Se ha agotado el saldo o cuota en Apify.')
      } else {
        errors.push(`Error de Apify (${response.status}): ${errorMessage}`)
      }
      
      console.error(`[IG Engine] Falló disparo del scraper. Código HTTP: ${response.status}`, errorText)
      return { success: false, message: 'Fallo al disparar el scraper de Apify', errors }
    }

    const runData = await response.json()
    const runId = runData.data?.id
    console.log(`[IG Engine] Scraper disparado exitosamente. Run ID: ${runId}`)

    return {
      success: true,
      message: `Scraper de Instagram iniciado exitosamente en Apify (Run ID: ${runId}).`,
      runId,
      errors: []
    }
  } catch (error: any) {
    const msg = `Excepción al disparar el scraper de Apify: ${error?.message || 'Error desconocido'}`
    console.error(`[IG Engine] ${msg}`, error)
    return { success: false, message: msg, errors: [msg] }
  }
}

