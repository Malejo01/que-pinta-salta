import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCategories, getVenues } from '@/lib/data'
import { DraftEventsManager } from '@/components/draft-events-manager'

export const dynamic = 'force-dynamic'

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
        initialEvents={draftEvents || []}
        categories={categories}
        venues={venues}
        pendingCount={pendingCount || 0}
      />
    </div>
  )
}
