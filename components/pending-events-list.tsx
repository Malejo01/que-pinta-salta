"use client"

import { useState, useTransition } from "react"
import { Calendar, MapPin, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { approvePendingEvent, deleteDraftEvent } from "@/lib/admin-actions"
import { formatEventDate, formatSaltaClock } from "@/lib/date-format"

export function PendingEventsList({ initialEvents }: { initialEvents: any[] }) {
  const [events, setEvents] = useState(initialEvents)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const handleApprove = (eventId: string) => {
    startTransition(async () => {
      const res = await approvePendingEvent(eventId)
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      } else {
        toast({ title: "Evento Aprobado", description: "El evento ya es público." })
        setEvents(events.filter(e => e.id !== eventId))
      }
    })
  }

  const handleReject = (eventId: string) => {
    startTransition(async () => {
      const res = await deleteDraftEvent(eventId)
      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      } else {
        toast({ title: "Evento Rechazado", description: "El evento fue eliminado." })
        setEvents(events.filter(e => e.id !== eventId))
      }
    })
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg border-dashed bg-muted/30">
        <CheckCircle className="size-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Todo al día</h3>
        <p className="text-muted-foreground mt-2 max-w-sm">
          No hay eventos pendientes de revisión. Los eventos subidos por colaboradores aparecerán aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <Card key={event.id} className="flex flex-col">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1">
                <CardTitle className="line-clamp-2 text-lg">{event.title}</CardTitle>
                <CardDescription className="line-clamp-1">
                  Publicado por: {event.profile?.full_name || event.profile?.email || 'Colaborador Desconocido'}
                </CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0 bg-yellow-500/10 text-yellow-600 border-yellow-200">
                Pendiente
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {event.image_url && (
              <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
                <img 
                  src={event.image_url} 
                  alt={event.title} 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="size-4 shrink-0" />
                <span>
                  {`${formatEventDate(event.start_date)}, ${formatSaltaClock(event.start_date)} hs`}
                </span>
              </div>
              {event.venue && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-4 shrink-0" />
                  <span className="line-clamp-1">{event.venue.name}</span>
                </div>
              )}
            </div>
            {event.description && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {event.description}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex items-center gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full gap-2 text-destructive hover:bg-destructive/10"
              disabled={isPending}
              onClick={() => handleReject(event.id)}
            >
              <XCircle className="size-4" />
              Rechazar
            </Button>
            <Button 
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              disabled={isPending}
              onClick={() => handleApprove(event.id)}
            >
              <CheckCircle className="size-4" />
              Aprobar
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
