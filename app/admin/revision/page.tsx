import { redirect } from 'next/navigation'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCategories, getVenues } from '@/lib/data'
import { DraftEventsManager } from '@/components/draft-events-manager'
import { dateConfirmation, dateConfirmationText, loadFlyersByEvent } from '@/lib/admin/date-confirmation'

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
      .select(`
        *,
        category:categories(id, name, slug),
        venue:venues(id, name, address)
      `)
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
  const draftEventsList = draftEvents || []
  const instagramAiIds = draftEventsList
    .filter((event) => event.scrape_source_key === 'instagram-ai')
    .map((event) => event.id)

  const adminClient = getPrivilegedClient()
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
        categories={categories}
        venues={venues}
        pendingCount={pendingCount || 0}
      />
    </div>
  )
}
