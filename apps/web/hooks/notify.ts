'use client'

/**
 * Avisos del sitio con el único Toaster montado (`components/ui/toaster.tsx`
 * en `app/layout.tsx`, que escucha a `@/hooks/use-toast`).
 *
 * Hotfix del 13/10: tres pantallas usaban `toast` de `sonner`, cuyo Toaster no
 * estaba montado, así que ningún aviso suyo se veía (ni "publicado" ni los
 * errores del servidor). Esta fachada mantiene la forma que usaban
 * (`success` / `error` / `loading`, con `{ id }` para reemplazar el aviso de
 * "Procesando…") encima del sistema que sí está montado.
 * `tests/admin/avisos-montados.test.ts` falla si vuelve a aparecer otro.
 */
import { toast } from '@/hooks/use-toast'

type Handle = ReturnType<typeof toast>

const abiertos = new Map<string, Handle>()

type Opciones = { id?: string }

function mostrar(title: string, variant: 'default' | 'destructive', opts?: Opciones, duration?: number): string {
  const previo = opts?.id ? abiertos.get(opts.id) : undefined
  if (previo) {
    previo.update({ id: previo.id, title, variant, duration, open: true })
    abiertos.delete(previo.id)
    return previo.id
  }
  return toast({ title, variant, duration }).id
}

export const notify = {
  success(title: string, opts?: Opciones): string {
    return mostrar(title, 'default', opts)
  },
  error(title: string, opts?: Opciones): string {
    return mostrar(title, 'destructive', opts)
  },
  /** Aviso que queda abierto hasta que un `success` o `error` con su id lo reemplaza. */
  loading(title: string): string {
    const handle = toast({ title, duration: Number.POSITIVE_INFINITY })
    abiertos.set(handle.id, handle)
    return handle.id
  },
}
