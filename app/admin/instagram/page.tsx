import { Instagram } from "lucide-react"
import { getInstagramAccounts, getInstagramStats } from "@/lib/instagram/data"
import { getCategories } from "@/lib/data"
import { InstagramAdminClient } from "./instagram-admin-client"

export default async function InstagramAdminPage() {
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
            Gestión de cuentas de Instagram para la sección &ldquo;Pinta Jodita 🍻&rdquo;
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
