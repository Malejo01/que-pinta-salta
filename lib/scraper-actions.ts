"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type ScrapeResult = {
  success: boolean
  inserted: number
  skipped: number
  errors: string[]
  message: string
}

export async function triggerScrape(): Promise<ScrapeResult> {
  const supabase = await createClient()

  // Verificar que el usuario es admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, inserted: 0, skipped: 0, errors: [], message: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    return { success: false, inserted: 0, skipped: 0, errors: [], message: 'Sin permisos de administrador' }
  }

  try {
    // Importar dinámicamente para no romper el bundle de Next.js
    // (puppeteer no puede correr en el edge runtime)
    const { scrapeNorteticketSalta } = await import('@/lib/scraper/norteticket-scraper')
    const { saveEventsToSupabase } = await import('@/lib/scraper/save-to-supabase')

    const events = await scrapeNorteticketSalta()
    const result = await saveEventsToSupabase(events as any)

    revalidatePath('/')
    revalidatePath('/admin/scrape')

    return {
      success: true,
      inserted: result.inserted,
      skipped: result.skipped,
      errors: result.errors,
      message: `Scrape completado: ${result.inserted} eventos nuevos, ${result.skipped} ya existían.`,
    }
  } catch (e: any) {
    return {
      success: false,
      inserted: 0,
      skipped: 0,
      errors: [e?.message ?? 'Error desconocido'],
      message: 'Error durante el scrape',
    }
  }
}
