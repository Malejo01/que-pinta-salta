import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ScrapeManager } from "@/components/scrape-manager"
import Link from "next/link"

export default async function AdminScrapePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/scrape')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') redirect('/?error=unauthorized')

  // Últimos eventos importados (para referencia)
  const { data: recentEvents } = await supabase
    .from('events')
    .select('id, title, start_date, created_at, ticket_url')
    .not('ticket_url', 'like', '%quepintasalta%')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/admin/aliases" className="hover:underline">Panel Admin</Link>
            <span>/</span>
            <span>Scraper</span>
          </div>
          <h1 className="text-3xl font-bold">Importar desde Norteticket</h1>
          <p className="text-muted-foreground mt-1">
            Sincroniza automáticamente los eventos de Salta publicados en Norteticket.
          </p>
        </div>

        <ScrapeManager />

        {recentEvents && recentEvents.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Últimos eventos importados</h2>
            <div className="rounded-lg border divide-y">
              {recentEvents.map(event => (
                <div key={event.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.start_date ? new Date(event.start_date).toLocaleDateString('es-AR') : '—'}
                    </p>
                  </div>
                  {event.ticket_url && (
                    <a
                      href={event.ticket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Ver en Norteticket →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
