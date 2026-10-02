import { redirect } from "next/navigation"
import { Instagram } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getInstagramAccounts, getInstagramStats } from "@/lib/instagram/data"
import { getCategories } from "@/lib/data"
import { InstagramAdminClient } from "./instagram-admin-client"

export default async function InstagramAdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login?redirect=/admin/instagram')
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

  const [accounts, stats, categories] = await Promise.all([
    getInstagramAccounts(),
    getInstagramStats(),
    getCategories(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Instagram className="size-6 text-pink-500" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Instagram Event Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Cuentas de Instagram monitoreadas. Los flyers se distribuyen automáticamente según su categoría.
          </p>
        </div>
      </div>

      <InstagramAdminClient
        initialAccounts={accounts}
        stats={stats}
        categories={categories}
      />
    </div>
  )
}
