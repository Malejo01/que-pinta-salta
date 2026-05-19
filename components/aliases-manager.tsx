"use client"

import { useState, useTransition } from "react"
import { Trash2, Plus, Tag, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { createAlias, deleteAlias } from "@/lib/admin-actions"
import type { Category, Venue } from "@/lib/types"

interface Alias {
  id: string
  alias: string
  target_type: 'category' | 'venue'
  target_id: string
  created_at: string
}

interface AliasesManagerProps {
  categories: Category[]
  venues: Venue[]
  initialAliases: Alias[]
}

export function AliasesManager({ categories, venues, initialAliases }: AliasesManagerProps) {
  const [aliases, setAliases] = useState<Alias[]>(initialAliases)
  const [targetType, setTargetType] = useState<'category' | 'venue'>('category')
  const [targetId, setTargetId] = useState<string>('')
  const [aliasValue, setAliasValue] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const formData = new FormData()
    formData.append('alias', aliasValue)
    formData.append('target_type', targetType)
    formData.append('target_id', targetId)
    
    startTransition(async () => {
      const result = await createAlias(formData)
      if (result.error) {
        setError(result.error)
      } else {
        // Add to local state
        const newAlias: Alias = {
          id: crypto.randomUUID(),
          alias: aliasValue.toLowerCase().trim(),
          target_type: targetType,
          target_id: targetId,
          created_at: new Date().toISOString()
        }
        setAliases([newAlias, ...aliases])
        setAliasValue('')
        setTargetId('')
      }
    })
  }

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const result = await deleteAlias(id)
      if (!result.error) {
        setAliases(aliases.filter(a => a.id !== id))
      }
    })
  }

  const getTargetName = (alias: Alias) => {
    if (alias.target_type === 'category') {
      return categories.find(c => c.id === alias.target_id)?.name || 'Desconocido'
    }
    return venues.find(v => v.id === alias.target_id)?.name || 'Desconocido'
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5" />
            Crear Nuevo Alias
          </CardTitle>
          <CardDescription>
            Los aliases permiten buscar categorías o venues con nombres alternativos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target_type">Tipo</Label>
              <Select 
                value={targetType} 
                onValueChange={(v) => {
                  setTargetType(v as 'category' | 'venue')
                  setTargetId('')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">
                    <span className="flex items-center gap-2">
                      <Tag className="size-4" />
                      Categoría
                    </span>
                  </SelectItem>
                  <SelectItem value="venue">
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4" />
                      Venue
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_id">
                {targetType === 'category' ? 'Categoría' : 'Venue'}
              </Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {targetType === 'category' 
                    ? categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))
                    : venues.map(venue => (
                        <SelectItem key={venue.id} value={venue.id}>
                          {venue.name}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="alias">Alias</Label>
              <Input
                id="alias"
                value={aliasValue}
                onChange={(e) => setAliasValue(e.target.value)}
                placeholder="ej: disco, club, bar..."
                required
              />
              <p className="text-xs text-muted-foreground">
                El alias se guardará en minúsculas
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={isPending || !targetId || !aliasValue}>
              {isPending ? 'Guardando...' : 'Crear Alias'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aliases Existentes</CardTitle>
          <CardDescription>
            {aliases.length} alias{aliases.length !== 1 ? 'es' : ''} configurado{aliases.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aliases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay aliases configurados
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliases.map((alias) => (
                  <TableRow key={alias.id}>
                    <TableCell className="font-mono text-sm">
                      {alias.alias}
                    </TableCell>
                    <TableCell>
                      <Badge variant={alias.target_type === 'category' ? 'default' : 'secondary'}>
                        {alias.target_type === 'category' ? (
                          <Tag className="size-3 mr-1" />
                        ) : (
                          <MapPin className="size-3 mr-1" />
                        )}
                        {alias.target_type === 'category' ? 'Categoría' : 'Venue'}
                      </Badge>
                    </TableCell>
                    <TableCell>{getTargetName(alias)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(alias.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
