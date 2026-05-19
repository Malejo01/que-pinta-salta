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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Panel de Administración</h1>
          <p className="text-muted-foreground mt-2">Gestiona los aliases de categorías y venues</p>
        </div>
        
        <AliasesManager 
          categories={categories} 
          venues={venues} 
          initialAliases={aliases || []}
        />
      </div>
    </div>
  )
}
