// ¿Se muestran los botones de "Voy / Me interesa" en la ficha? (R38, 38-b,
// vuelta 2.) Vive en su propio módulo y no en `lib/asistencia.ts` por una
// razón concreta del build, no por prolijidad: `lib/asistencia.ts` es un
// módulo `"use server"`, y en un archivo así **todos** los exports tienen
// que ser funciones `async` (son server actions). Una función común
// exportada desde ahí hace fallar el build de Next (`Only async functions
// are allowed to be exported in a "use server" file`), aunque el typecheck
// y los tests pasen: ni `tsc` ni Vitest miran esa regla. El build de la
// preview del PR #62 fue el que lo mostró.
//
// Este módulo no habla con Supabase ni con la sesión: es una decisión pura
// sobre el estado del evento, y la usan tanto el Server Component de la
// ficha como el componente cliente.

/**
 * `true` solo para eventos `PUBLISHED`: es el único estado que la vista
 * pública `event_attendance_counts`
 * (`supabase/migrations/20261013120100_voy_me_interesa.sql`) agrega, así que
 * es el único en el que mostrar los botones deja un contador que se mueve.
 * En un evento `CANCELLED` o `PAST` —cuya ficha también es pública— el
 * número quedaría clavado en 0 aunque el botón se pudiera tocar.
 *
 * Única fuente de verdad: la llaman `app/evento/[id]/page.tsx` (para no
 * pasar las cantidades) y `components/event-detail-page.tsx` (para no
 * dibujar los botones). El día que se quiera contar también en
 * `PAST`/`CANCELLED` hace falta una migración que cambie esa vista: no
 * alcanza con tocar este archivo.
 */
export function debenMostrarseBotonesAsistencia(status: string): boolean {
  return status === "PUBLISHED"
}
