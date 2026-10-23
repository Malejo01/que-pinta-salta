import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sparkles, Star, StarOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { estaDestacado } from '@qps/core/events/destacados'
import { formatSaltaDayKey } from '@qps/core/date-format'
import { obtenerDestacados } from '@/lib/admin/destacados-actions'
import { ControlDestacado } from '@/components/admin/control-destacado'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/**
 * /admin/destacados (R50, QPS-239/-240, tarea 50-b): lista de eventos
 * destacados (vigentes y recién vencidos) con el control para destacar o
 * quitar el destacado de cada uno. El middleware no cubre /admin: esta
 * página se protege sola, copiado de app/admin/page.tsx.
 */

export const dynamic = 'force-dynamic'

/**
 * "12/10", en hora de Salta. Con formatSaltaDayKey() (no con un slice/split
 * del string crudo): featured_until ya viene con el offset de Salta
 * ("...T23:59:59-03:00"), pero featured_set_at es un
 * `new Date().toISOString()` en UTC — cortar los primeros 10 caracteres a
 * mano le acertaría el día a featured_until y se lo correría a
 * featured_set_at cualquier noche entre las 21 y las 24 h de Salta.
 */
function formatDiaMes(fecha: string): string {
  const [, mes, dia] = formatSaltaDayKey(fecha).split('-')
  return `${dia}/${mes}`
}

export default async function AdminDestacadosPage() {
  const supabase = await createClient()

  // 1. Validar autenticación
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirect=/admin/destacados')
  }

  // 2. Validar rol de administrador
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }

  // obtenerDestacados() vuelve a verificar sesión y rol con su propio
  // cliente (mismo patrón que el resto de las acciones de /lib/admin):
  // redundante con lo de arriba, pero intencional, no se saca.
  const destacados = (await obtenerDestacados()) ?? []

  const ahora = new Date()
  const vigentes = destacados.filter((d) => estaDestacado(d.featured_until, ahora))
  const vencidos = destacados.filter((d) => !estaDestacado(d.featured_until, ahora))

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Destacados</h1>
          <p className="text-sm text-muted-foreground">
            El cobro se hace por fuera (transferencia o Mercado Pago). Cuando esté pago, elegí la fecha de fin.
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Para destacar un evento que no está en esta lista, entrá a su ficha desde{' '}
        <Link href="/buscar" className="font-medium text-primary hover:underline">
          Buscar
        </Link>
        .
      </p>

      {destacados.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg border-dashed bg-muted/30">
          <StarOff className="size-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            No hay ningún evento destacado. Para destacar uno, entrá a su ficha desde{' '}
            <Link href="/buscar" className="font-medium text-primary hover:underline">
              Buscar
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {vigentes.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Star className="size-4 text-primary" />
                Vigentes
              </h2>
              <div className="space-y-4">
                {vigentes.map((evento) => (
                  <TarjetaDestacado key={evento.id} evento={evento} />
                ))}
              </div>
            </section>
          )}

          {vencidos.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <StarOff className="size-4 text-muted-foreground" />
                Vencidos en los últimos 30 días
              </h2>
              <div className="space-y-4">
                {vencidos.map((evento) => (
                  <TarjetaDestacado key={evento.id} evento={evento} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function TarjetaDestacado({
  evento,
}: {
  evento: {
    id: string
    title: string
    start_date: string
    featured_until: string
    featured_set_at: string | null
    destacadoPor: { fullName: string | null; email: string } | null
  }
}) {
  const quienLoDestaco = evento.destacadoPor?.fullName || evento.destacadoPor?.email || null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/evento/${evento.id}`} className="font-medium text-foreground hover:underline">
            {evento.title}
          </Link>
          <span className="text-xs text-muted-foreground">hasta {formatDiaMes(evento.featured_until)}</span>
        </div>
        {quienLoDestaco && evento.featured_set_at && (
          <p className="text-xs text-muted-foreground">
            Lo destacó {quienLoDestaco} el {formatDiaMes(evento.featured_set_at)}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ControlDestacado eventId={evento.id} featuredUntil={evento.featured_until} />
      </CardContent>
    </Card>
  )
}
