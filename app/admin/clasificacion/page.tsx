import { redirect } from "next/navigation"
import Link from "next/link"
import { Tags, Home } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getCategories, getVenues } from "@/lib/data"
import { getUncategorizedEvents } from "@/lib/admin-actions"
import { ClasificacionManager } from "@/components/clasificacion-manager"
import { Button } from "@/components/ui/button"

export default async function AdminClasificacionPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/clasificacion')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') redirect('/?error=unauthorized')

  const [categories, venues, uncategorizedEvents] = await Promise.all([
    getCategories(),
    getVenues(),
    getUncategorizedEvents(),
  ])

  const { data: aliases } = await supabase
    .from('aliases')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/admin" className="hover:underline">Panel Admin</Link>
              <span>/</span>
              <span>Clasificación</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Tags className="size-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Clasificación</h1>
                <p className="mt-1 text-muted-foreground">
                  Clasificá eventos sin categoría y gestioná las reglas de clasificación automática.
                </p>
              </div>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/"><Home className="mr-2 size-4" />Volver al inicio</Link>
          </Button>
        </div>

        <ClasificacionManager
          uncategorizedEvents={uncategorizedEvents as any}
          categories={categories}
          venues={venues}
          initialAliases={aliases || []}
        />
      </div>
    </div>
  )
}
