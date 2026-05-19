"use client"

import { useState } from "react"
import { triggerScrape, type ScrapeResult } from "@/lib/scraper-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function ScrapeManager() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapeResult | null>(null)

  async function handleScrape() {
    setLoading(true)
    setResult(null)
    try {
      const res = await triggerScrape()
      setResult(res)
    } catch (e: any) {
      setResult({ success: false, inserted: 0, skipped: 0, errors: [e?.message], message: 'Error inesperado' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Scraper de Norteticket
          <Badge variant="outline">Salta</Badge>
        </CardTitle>
        <CardDescription>
          Extrae los eventos publicados en{" "}
          <a href="https://norteticket.com/?subcategoria=Salta" target="_blank" rel="noopener noreferrer" className="underline">
            norteticket.com
          </a>{" "}
          y los guarda automáticamente en la base de datos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleScrape} disabled={loading} size="lg">
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Scrapeando... (puede tardar ~2 min)
            </span>
          ) : (
            "Ejecutar Scrape"
          )}
        </Button>

        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <AlertDescription className="space-y-2">
              <p className="font-medium">{result.message}</p>
              {result.success && (
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    ✓ {result.inserted} nuevos insertados
                  </span>
                  <span className="text-muted-foreground">
                    ⊘ {result.skipped} ya existían
                  </span>
                </div>
              )}
              {result.errors.length > 0 && (
                <ul className="text-sm text-destructive list-disc list-inside mt-1">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
