import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCategories, getVenues } from '@/lib/data'
import { DraftEventsManager } from '@/components/draft-events-manager'
import { dateConfirmation, dateConfirmationText, loadFlyersByEvent } from '@/lib/admin/date-confirmation'
import { ADMIN_REVIEW_EVENT_ROW_SELECT } from '@/lib/events/public-select'
import { mergedIntoId } from '@/lib/events/merged'
import { isUuid } from '@/lib/metricas'
import type { ComponentProps } from 'react'

// La fila que espera DraftEventsManager, sin el dateCheck que se calcula abajo.
type DraftEventWithRelations = Omit<ComponentProps<typeof DraftEventsManager>['initialEvents'][number], 'dateCheck'> & {
  scrape_source_key: string | null
}

export const dynamic = 'force-dynamic'

function getPrivilegedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Faltan variables de entorno de Supabase para operaciones admin (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createSupabaseClient(url, key)
}

export default async function AdminRevisionPage() {
  const supabase = await createClient()

  // 1. Validar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirect=/admin/revision')
  }

  // 2. Validar rol de administrador
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }

  // 3. Obtener datos necesarios en paralelo
  const [
    categories,
    venues,
    { data: draftEvents, error: eventsError },
    { count: pendingCount }
  ] = await Promise.all([
    getCategories(),
    getVenues(),
    supabase
      .from('events')
      // Columnas explícitas (QPS-108): las públicas más ai_metadata.
      .select(`${ADMIN_REVIEW_EVENT_ROW_SELECT}, category:categories(id, name, slug), venue:venues(id, name, address)`)
      .eq('status', 'DRAFT')
      .order('created_at', { ascending: false }),
    supabase
      .from('instagram_flyers')
      .select('*', { count: 'exact', head: true })
      .eq('ai_status', 'PENDING')
      .eq('status', 'ACTIVE')
  ])

  if (eventsError) {
    console.error('Error fetching draft events:', eventsError)
  }

  // 4. Confirmación de fecha (QPS-065/073/077): una sola consulta a
  // instagram_flyers para todos los borradores del pipeline de Instagram-IA,
  // con el cliente privilegiado (ya validamos el rol admin arriba, como en
  // la guarda del servidor de lib/admin-actions.ts).
  // El select con columnas explícitas es un string armado, así que supabase-js
  // no infiere el tipo de fila (ver lib/events/public-select.ts).
  const allDrafts = (draftEvents || []) as unknown as DraftEventWithRelations[]

  // 4a. Borradores ya fusionados en otro (hotfix 13/10): no son pendientes.
  // El servidor no los publica (guarda 2 de publishDraftEvent) y "Rechazar"
  // los rechaza; van aparte, con el evento que quedó y "Deshacer fusión".
  const draftEventsList = allDrafts.filter((event) => !mergedIntoId(event))
  const mergedDrafts = allDrafts.filter((event) => mergedIntoId(event))
  const targetIds = [...new Set(mergedDrafts.map((event) => mergedIntoId(event) as string))].filter(isUuid)

  const adminClient = getPrivilegedClient()
  const targetsById = new Map<string, { id: string; title: string; status: string }>()
  if (targetIds.length > 0) {
    const { data: targets, error: targetsError } = await adminClient
      .from('events')
      .select('id, title, status')
      .in('id', targetIds)
    if (targetsError) {
      console.error('Error fetching merge targets:', targetsError)
    }
    for (const t of targets ?? []) targetsById.set(t.id, t)
  }

  const mergedEvents = mergedDrafts.map((event) => {
    const intoId = mergedIntoId(event) as string
    return {
      id: event.id,
      title: event.title,
      start_date: event.start_date,
      image_url: event.image_url,
      venueName: event.venue?.name ?? null,
      mergedInto: targetsById.get(intoId) ?? { id: intoId, title: null, status: null },
    }
  })

  const instagramAiIds = draftEventsList
    .filter((event) => event.scrape_source_key === 'instagram-ai')
    .map((event) => event.id)

  const flyersResult = await loadFlyersByEvent(adminClient, instagramAiIds)
  if ('error' in flyersResult) {
    console.error('Error fetching instagram_flyers for date confirmation:', flyersResult.error)
  }
  // Falla cerrada (igual que lib/admin-actions.ts): si no se pudo leer
  // instagram_flyers, `null` hace que dateConfirmation exija confirmación en
  // los borradores que de verdad la necesitan.
  const flyersByEvent = 'map' in flyersResult ? flyersResult.map : null

  const eventsWithDateCheck = draftEventsList.map((event) => {
    const flyers = flyersByEvent ? (flyersByEvent.get(event.id) ?? []) : null
    const result = dateConfirmation(event, flyers)
    return {
      ...event,
      dateCheck: { needed: result.needed, reason: result.reason, text: dateConfirmationText(result) },
    }
  })

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Borradores e Inteligencia Artificial
          </h1>
          <p className="text-sm text-muted-foreground">
            Revisá, corregí y aprobá los eventos extraídos de Instagram por el modelo de IA.
          </p>
        </div>
      </div>

      {/* Grid del Administrador de Borradores */}
      <DraftEventsManager
        initialEvents={eventsWithDateCheck}
        mergedEvents={mergedEvents}
        categories={categories}
        venues={venues}
        pendingCount={pendingCount || 0}
      />
    </div>
  )
}
