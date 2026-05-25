"use client"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export function ScraperButton() {
  const [isPending, setIsPending] = useState(false)
  const { toast } = useToast()

  const handleScrape = async () => {
    setIsPending(true)
    try {
      const res = await fetch("/api/cron/scrape", {
        method: "GET",
        headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}` },
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      toast({
        title: "Scraping completado",
        description: `${data.scraped?.total ?? 0} eventos procesados — ${data.database?.inserted ?? 0} nuevos, ${data.database?.updated ?? 0} actualizados.`,
      })
    } catch (err) {
      toast({
        title: "Error al ejecutar scraping",
        description: err instanceof Error ? err.message : "La solicitud falló o agotó el tiempo.",
        variant: "destructive",
      })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      onClick={handleScrape}
      disabled={isPending}
      size="sm"
      className="gap-2"
    >
      <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Ejecutando..." : "Ejecutar Scraping Ahora"}
    </Button>
  )
}
