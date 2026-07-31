"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Image from "next/image"
import { Copy, Eye, Trash, MapPin, CalendarDays, Loader2, ImageIcon, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteUserEvent } from "@/lib/actions"

export default function MisEventosClient({ initialEvents }: { initialEvents: any[] }) {
  const [events, setEvents] = useState(initialEvents)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    
    const result = await deleteUserEvent(deleteId)
    
    if (result.error) {
      alert(result.error)
    } else {
      setEvents((prev) => prev.filter((event) => event.id !== deleteId))
    }
    
    setIsDeleting(false)
    setDeleteId(null)
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg border-dashed bg-muted/30">
        <CalendarDays className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold mb-2">No tienes eventos creados</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Aún no has creado ningún evento. ¡Empieza a compartir lo que pasa en Salta!
        </p>
        <Button asChild>
          <Link href="/nuevo-evento">Crear mi primer evento</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]"></TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Lugar</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  {event.image_url ? (
                    <div className="relative aspect-[3/4] w-16 overflow-hidden rounded-md border">
                      <Image
                        src={event.image_url}
                        alt={event.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[3/4] w-16 items-center justify-center rounded-md border bg-muted">
                      <ImageIcon className="h-6 w-6 text-muted-foreground opacity-50" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {event.title}
                  <div className="text-xs text-muted-foreground mt-1">
                    {event.category?.name || "Sin categoría"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center text-sm">
                    <CalendarDays className="mr-2 size-3 text-muted-foreground" />
                    {format(new Date(event.start_date), "d 'de' MMMM, yyyy", { locale: es })}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center text-sm">
                    <MapPin className="mr-2 size-3 text-muted-foreground" />
                    {event.venue?.name || "No especificado"}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    event.status === 'PUBLISHED' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {event.status === 'PUBLISHED' ? 'Publicado' : 'Borrador'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" asChild title="Ver evento">
                      <a href={`/evento/${event.id}`} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">Ver evento</span>
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Editar">
                      <Link href={`/nuevo-evento?editId=${event.id}`}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" asChild title="Duplicar">
                      <Link href={`/nuevo-evento?cloneId=${event.id}`}>
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">Duplicar</span>
                      </Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setDeleteId(event.id)}
                      title="Eliminar"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash className="h-4 w-4" />
                      <span className="sr-only">Eliminar</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Eliminará permanentemente este evento
              de nuestros servidores y ya no será visible para nadie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar evento"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
