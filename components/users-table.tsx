"use client"

import { useDeferredValue, useMemo, useState, useTransition } from "react"
import { ShieldCheck, ShieldOff, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { updateUserRole } from "@/lib/user-actions"

interface Profile {
  id: string
  email: string
  full_name: string | null
  role: "USER" | "ADMIN"
  created_at: string
}

export function UsersTable({ initialUsers }: { initialUsers: Profile[] }) {
  const [users, setUsers] = useState<Profile[]>(initialUsers)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const filtered = useMemo(() => {
    const query = deferredSearch.toLowerCase()

    if (!query) return users

    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(query) ||
        (u.full_name ?? "").toLowerCase().includes(query)
    )
  }, [deferredSearch, users])

  const handleRoleToggle = (user: Profile) => {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN"

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
    )

    startTransition(async () => {
      const result = await updateUserRole(user.id, newRole)
      if (result.error) {
        // Revert on error
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, role: user.role } : u))
        )
        toast({
          title: "Error al actualizar rol",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Rol actualizado",
          description: `${user.email} ahora es ${newRole === "ADMIN" ? "Administrador" : "Usuario"}.`,
        })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por email o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre / Alias</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No se encontraron usuarios.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.full_name ?? <span className="text-muted-foreground italic">Sin nombre</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(user.created_at).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.role === "ADMIN" ? "default" : "secondary"}
                      className="gap-1"
                    >
                      {user.role === "ADMIN" ? (
                        <ShieldCheck className="size-3" />
                      ) : (
                        <ShieldOff className="size-3" />
                      )}
                      {user.role === "ADMIN" ? "Administrador" : "Usuario"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRoleToggle(user)}
                      className="gap-2"
                    >
                      {user.role === "ADMIN" ? (
                        <>
                          <ShieldOff className="size-3" />
                          Revocar Admin
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="size-3" />
                          Hacer Admin
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {users.length} usuario{users.length !== 1 ? "s" : ""}
      </p>
    </div>
  )
}
