import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Database, Home, SearchCheck, Tags } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const adminSections = [
  {
    href: '/admin/scrape',
    title: 'Scrapers',
    description: 'Ejecuta scrapers, corre Actualizar todo y revisa historial por fuente.',
    icon: SearchCheck,
  },
  {
    href: '/admin/clasificacion',
    title: 'Clasificación',
    description: 'Clasificá eventos sin categoría importados por scrapers y gestioná las reglas de clasificación automática.',
    icon: Tags,
  },
]

export default async function AdminHomePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') redirect('/?error=unauthorized')

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Database className="size-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Panel de Administración</h1>
              <p className="mt-1 text-muted-foreground">
                Accede a herramientas de scraping, clasificación y mantenimiento del catálogo.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href="/"><Home className="mr-2 size-4" />Volver al inicio</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {adminSections.map((section) => {
            const Icon = section.icon
            return (
              <Card key={section.href}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Icon className="size-5 text-primary" />
                    {section.title}
                  </CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <Link href={section.href}>Abrir {section.title}</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
