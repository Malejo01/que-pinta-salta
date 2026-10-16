import { EventsPageSkeleton } from '@/components/skeletons'

// Esqueleto de carga de la portada (tarea 30-f): mismo contenedor y grilla
// de tarjetas 2:3 que `HomeContent`, para que no "salte" al terminar de cargar.
export default function Loading() {
  return <EventsPageSkeleton />
}
