"use client"

import { useState, useTransition } from "react"
import { Instagram, Plus, Trash2, Power, PowerOff, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import type { InstagramAccount } from "@/lib/instagram-config"
import {
  createInstagramAccount,
  toggleInstagramAccount,
  deleteInstagramAccount,
} from "@/lib/instagram/admin-actions"

interface InstagramAdminClientProps {
  initialAccounts: InstagramAccount[]
  stats: {
    activeAccounts: number
    activeFlyers: number
    archivedFlyers: number
  }
}

export function InstagramAdminClient({ initialAccounts, stats }: InstagramAdminClientProps) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [newUsername, setNewUsername] = useState("")
  const [newDisplayName, setNewDisplayName] = useState("")
  const [newNotes, setNewNotes] = useState("")
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
        newNotes || undefined
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
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="size-4" />
          Agregar cuenta de Instagram
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="@username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Nombre del boliche"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Notas (opcional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleCreate} disabled={isPending}>
            {isPending ? "Guardando..." : "Agregar"}
          </Button>
        </div>
        {formError && (
          <p className="mt-2 text-sm text-destructive">{formError}</p>
        )}
      </div>

      {/* Tabla de cuentas */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-3 font-medium">Cuenta</th>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 font-medium">Notas</th>
                <th className="p-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b last:border-0">
                  <td className="p-3">
                    <a
                      href={account.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Instagram className="size-4 text-pink-500" />
                      @{account.username}
                      <ExternalLink className="size-3" />
                    </a>
                  </td>
                  <td className="p-3 font-medium">{account.display_name}</td>
                  <td className="p-3">
                    <Badge variant={account.is_active ? "default" : "secondary"}>
                      {account.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {account.notes || "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
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
                  </td>
                </tr>
              ))}

              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No hay cuentas de Instagram configuradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
