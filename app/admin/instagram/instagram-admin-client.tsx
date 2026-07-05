"use client"

import { useState, useTransition } from "react"
import { Instagram, Plus, Trash2, Power, PowerOff, ExternalLink, Edit, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { InstagramAccount } from "@/lib/instagram-config"
import type { Category } from "@/lib/types"
import {
  createInstagramAccount,
  toggleInstagramAccount,
  deleteInstagramAccount,
  updateInstagramAccount,
} from "@/lib/instagram/admin-actions"

interface InstagramAdminClientProps {
  initialAccounts: InstagramAccount[]
  stats: {
    activeAccounts: number
    activeFlyers: number
    archivedFlyers: number
  }
  categories: Category[]
}

export function InstagramAdminClient({ initialAccounts, stats, categories }: InstagramAdminClientProps) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [newUsername, setNewUsername] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [newDefaultVenueName, setNewDefaultVenueName] = useState("")
  const [newDefaultMapsUrl, setNewDefaultMapsUrl] = useState("")
  const [newDefaultCategory, setNewDefaultCategory] = useState("boliches")

  const [editingAccount, setEditingAccount] = useState<InstagramAccount | null>(null)
  const [editDisplayName, setEditDisplayName] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editDefaultVenueName, setEditDefaultVenueName] = useState("")
  const [editDefaultMapsUrl, setEditDefaultMapsUrl] = useState("")
  const [editDefaultCategory, setEditDefaultCategory] = useState("boliches")

  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCreate = () => {
    if (!newUsername.trim() || !newDisplayName.trim()) {
      setFormError("Username y nombre son requeridos")
      return
    }

    setFormError(null)
    startTransition(async () => {
      const result = await createInstagramAccount(
        newUsername,
        newDisplayName,
        newNotes || undefined,
        newDefaultVenueName || undefined,
        newDefaultMapsUrl || undefined,
        newDefaultCategory || undefined
      )

      if (result.error) {
        setFormError(result.error)
        return
      }

      if (result.account) {
        setAccounts((prev) => [...prev, result.account as InstagramAccount])
      }

      setNewUsername("")
      setNewDisplayName("")
      setNewNotes("")
      setNewDefaultVenueName("")
      setNewDefaultMapsUrl("")
      setNewDefaultCategory("boliches")
    })
  }

  const handleToggle = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await toggleInstagramAccount(id, !currentActive)
      if (!result.error) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, is_active: !currentActive } : a))
        )
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteInstagramAccount(id)
      if (!result.error) {
        setAccounts((prev) => prev.filter((a) => a.id !== id))
      }
    })
  }

  const handleStartEdit = (account: InstagramAccount) => {
    setEditingAccount(account)
    setEditDisplayName(account.display_name)
    setEditNotes(account.notes || "")
    setEditDefaultVenueName(account.default_venue_name || "")
    setEditDefaultMapsUrl(account.default_maps_url || "")
    setEditDefaultCategory(account.default_category || "boliches")
    setFormError(null)
  }

  const handleUpdate = () => {
    if (!editingAccount) return
    if (!editDisplayName.trim()) {
      setFormError("El nombre es requerido")
      return
    }

    setFormError(null)
    startTransition(async () => {
      const result = await updateInstagramAccount(editingAccount.id, {
        display_name: editDisplayName.trim(),
        notes: editNotes.trim() || null,
        default_venue_name: editDefaultVenueName.trim() || null,
        default_maps_url: editDefaultMapsUrl.trim() || null,
        default_category: editDefaultCategory,
      })

      if (result.error) {
        setFormError(result.error)
        return
      }

      setAccounts((prev) =>
        prev.map((a) =>
          a.id === editingAccount.id
            ? {
                ...a,
                display_name: editDisplayName.trim(),
                notes: editNotes.trim() || null,
                default_venue_name: editDefaultVenueName.trim() || null,
                default_maps_url: editDefaultMapsUrl.trim() || null,
                default_category: editDefaultCategory,
              }
            : a
        )
      )
      setEditingAccount(null)
    })
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.activeAccounts}</p>
          <p className="text-xs text-muted-foreground">Cuentas activas</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.activeFlyers}</p>
          <p className="text-xs text-muted-foreground">Flyers activos</p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{stats.archivedFlyers}</p>
          <p className="text-xs text-muted-foreground">Archivados</p>
        </div>
      </div>

      {/* Formulario agregar cuenta */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
          <Plus className="size-5 text-primary" />
          Agregar cuenta de Instagram
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="username" className="text-xs text-muted-foreground font-medium">Username de Instagram</Label>
            <Input
              id="username"
              placeholder="@username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="displayName" className="text-xs text-muted-foreground font-medium">Nombre del Boliche / Productora</Label>
            <Input
              id="displayName"
              placeholder="Ej: La Metro Salta"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category" className="text-xs text-muted-foreground font-medium">Categoría por Defecto</Label>
            <Select value={newDefaultCategory} onValueChange={setNewDefaultCategory}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.slug}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="venueName" className="text-xs text-muted-foreground font-medium">Lugar del Evento por Defecto</Label>
            <Input
              id="venueName"
              placeholder="Ej: La Metro, Salta"
              value={newDefaultVenueName}
              onChange={(e) => setNewDefaultVenueName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mapsUrl" className="text-xs text-muted-foreground font-medium">Link de Google Maps por Defecto</Label>
            <Input
              id="mapsUrl"
              placeholder="https://maps.google.com/..."
              value={newDefaultMapsUrl}
              onChange={(e) => setNewDefaultMapsUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes" className="text-xs text-muted-foreground font-medium">Notas u Observaciones (Internas)</Label>
            <Input
              id="notes"
              placeholder="Notas de control"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleCreate} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? "Guardando..." : "Agregar cuenta"}
          </Button>
        </div>
        {formError && (
          <p className="mt-2 text-sm text-destructive font-medium">{formError}</p>
        )}
      </div>

      {/* Lista de cuentas (cards) */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">
          Cuentas configuradas ({accounts.length})
        </h3>

        {accounts.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No hay cuentas de Instagram configuradas
          </div>
        )}

        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/20"
          >
            {/* Fila superior: Info principal + Acciones */}
            <div className="flex items-start justify-between gap-3">
              {/* Lado izquierdo: cuenta + nombre */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={account.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Instagram className="size-4 text-pink-500" />
                    @{account.username}
                    <ExternalLink className="size-3" />
                  </a>
                  <Badge variant={account.is_active ? "default" : "secondary"} className="text-xs">
                    {account.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  <Badge variant="outline" className="capitalize text-xs font-medium">
                    {account.default_category || "boliches"}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-foreground">{account.display_name}</p>
              </div>

              {/* Lado derecho: Botones de acción siempre visibles */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStartEdit(account)}
                  disabled={isPending}
                  title="Editar"
                  className="gap-1.5"
                >
                  <Edit className="size-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleToggle(account.id, account.is_active)}
                  disabled={isPending}
                  title={account.is_active ? "Desactivar" : "Activar"}
                >
                  {account.is_active ? (
                    <PowerOff className="size-4 text-amber-500" />
                  ) : (
                    <Power className="size-4 text-green-500" />
                  )}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      title="Eliminar"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        ¿Eliminar @{account.username}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Esto eliminará la cuenta y todos sus flyers asociados.
                        Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(account.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Fila inferior: detalles */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {account.default_venue_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 text-green-500" />
                  {account.default_venue_name}
                  {account.default_maps_url && (
                    <a
                      href={account.default_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                      title="Ver en Google Maps"
                    >
                      ↗
                    </a>
                  )}
                </span>
              )}
              {account.notes && (
                <span className="truncate max-w-[250px]" title={account.notes}>
                  💬 {account.notes}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Edición de Cuenta */}
      <Dialog open={editingAccount !== null} onOpenChange={(open) => { if (!open) setEditingAccount(null) }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Instagram className="size-5 text-pink-500" />
              Editar Cuenta: @{editingAccount?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-displayName">Nombre del Boliche / Productora</Label>
              <Input
                id="edit-displayName"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Nombre oficial"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-category">Categoría por Defecto</Label>
              <Select value={editDefaultCategory} onValueChange={setEditDefaultCategory}>
                <SelectTrigger id="edit-category" className="w-full">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-venueName">Lugar del Evento por Defecto</Label>
              <Input
                id="edit-venueName"
                value={editDefaultVenueName}
                onChange={(e) => setEditDefaultVenueName(e.target.value)}
                placeholder="Lugar del evento"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-mapsUrl">Link de Google Maps por Defecto</Label>
              <Input
                id="edit-mapsUrl"
                value={editDefaultMapsUrl}
                onChange={(e) => setEditDefaultMapsUrl(e.target.value)}
                placeholder="URL de Google Maps"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notas u Observaciones (Internas)</Label>
              <Input
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Notas de control"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
