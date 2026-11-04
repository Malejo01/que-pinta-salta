// Q6-6 · Los avisos que aparecen después de un toque (el error de «Entrar»,
// «Te mandamos un mail…», «Listo, guardamos tu contraseña», el idioma nuevo)
// se le dicen al lector de pantalla: antes aparecían en silencio y quien usa
// TalkBack no se enteraba de que algo había fallado. Parte pura (sin React ni
// React Native, probada en tests/accesibilidad-q6.test.ts); el hook que la
// conecta es `useAnunciarAviso` (lib/anunciar-aviso-hook.ts) y habla a través
// del envoltorio único `anunciar` (lib/anunciar.ts).
//
// Reglas:
//   - Se anuncia cuando el texto CAMBIA a uno con contenido (también el
//     primero). Un render más con el mismo texto no dice nada; volver a `null`
//     no dice nada (el aviso se fue). Las pantallas limpian el error al
//     reintentar (`setError(null)`), así que el mismo error después de otro
//     intento se vuelve a decir.
//   - En Android espera `DEMORA_TOQUE_ANDROID_MS` (TalkBack ignora `queue` y
//     cortaría el anuncio con la lectura del botón que se tocó); en iOS, al
//     toque (`queue: true` lo pone detrás). Un texto nuevo dentro de la espera
//     reemplaza al anterior: se dice solo el último.
//   - Sin live region en esos nodos: TalkBack no la lee al montarse un nodo
//     nuevo (ver lib/anunciar-conteo.ts) y con las dos cosas se leería dos veces.
import { demoraDelToque, type RelojAnuncio } from '@/lib/anunciar-conteo'

export interface AnunciadorDeAviso {
  /** Cada valor del aviso (`null` = no hay aviso en pantalla). */
  observar: (texto: string | null) => void
  /** Descarta el anuncio que está esperando (al desmontar). */
  cancelar: () => void
}

export function crearAnunciadorDeAviso(deps: {
  anunciar: (texto: string) => void
  reloj: RelojAnuncio
  plataforma: string
}): AnunciadorDeAviso {
  let ultimo: string | null = null
  let pendiente: ReturnType<typeof setTimeout> | null = null

  const cancelar = () => {
    if (pendiente !== null) deps.reloj.clearTimeout(pendiente)
    pendiente = null
  }

  return {
    cancelar,
    observar(texto) {
      const actual = texto && texto.trim() ? texto : null
      if (actual === ultimo) return
      ultimo = actual
      cancelar()
      if (actual === null) return
      const demora = demoraDelToque(deps.plataforma)
      if (demora === 0) {
        deps.anunciar(actual)
        return
      }
      pendiente = deps.reloj.setTimeout(() => {
        pendiente = null
        deps.anunciar(actual)
      }, demora)
    },
  }
}
