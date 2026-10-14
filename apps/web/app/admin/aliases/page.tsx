import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCategories, getVenues } from "@/lib/data"
import { AliasesManager } from "@/components/aliases-manager"

export default async function AdminAliasesPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login?redirect=/admin/aliases')
  }
  
  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  if (profile?.role !== 'ADMIN') {
    redirect('/?error=unauthorized')
  }
  
  const [categories, venues] = await Promise.all([
    getCategories(),
    getVenues()
  ])
  
  // Get existing aliases
  const { data: aliases } = await supabase
    .from('aliases')
    .select('*')
    .order('created_at', { ascending: false })
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Aliases</h1>
        <p className="mt-1 text-muted-foreground">
          Mapea nombres alternativos del scraper a categorías y venues existentes.
        </p>
      </div>

      <AliasesManager
        categories={categories}
        venues={venues}
        initialAliases={aliases || []}
      />
    </div>
  )
}

