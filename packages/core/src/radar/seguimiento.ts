/**
 * "+ Seguir" (R47, tarea 47-a, QPS-197): seguir un lugar, una categoría o
 * una cuenta de Instagram, para que sus eventos entren en el Radar sin
 * tocar las preferencias de a una. Sin React, sin Supabase, sin red.
 */
import { esUuid } from './preferencias'

export type TipoSeguimiento = 'lugar' | 'cuenta' | 'categoria'

/**
 * El mapeo de tipo de seguimiento a tabla y columna de la base. Único lugar
 * del repo donde vive este mapeo (lo fija un test de "una sola copia" en
 * 47-q): cualquier código que necesite la tabla o la columna de un tipo de
 * seguimiento tiene que importarlo de acá, no repetirlo.
 */
export const TABLA_SEGUIMIENTO: Record<TipoSeguimiento, { tabla: string; columna: string }> = {
  lugar: { tabla: 'user_followed_venues', columna: 'venue_id' },
  cuenta: { tabla: 'user_followed_instagram_accounts', columna: 'instagram_account_id' },
  categoria: { tabla: 'user_followed_categories', columna: 'category_id' },
}

const TIPOS_SEGUIMIENTO: readonly TipoSeguimiento[] = ['lugar', 'cuenta', 'categoria']

function esTipoSeguimiento(valor: unknown): valor is TipoSeguimiento {
  return typeof valor === 'string' && (TIPOS_SEGUIMIENTO as readonly string[]).includes(valor)
}

export type ResultadoValidacionSeguimiento =
  | { ok: true; tipo: TipoSeguimiento; id: string; seguir: boolean }
  | { ok: false; error: string }

/**
 * Valida la entrada de la acción de seguir/dejar de seguir: un objeto (no
 * `null`, no un arreglo) con `tipo` de la lista de `TipoSeguimiento`, `id`
 * un uuid válido (con `esUuid`, de `radar/preferencias.ts`: no se copia la
 * expresión regular) y `seguir` un booleano de verdad (`true`/`false`, no
 * `'true'` ni `1`).
 */
export function validarSeguimiento(entrada: unknown): ResultadoValidacionSeguimiento {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { ok: false, error: 'Los datos para seguir no son válidos.' }
  }

  const { tipo, id, seguir } = entrada as Record<string, unknown>

  if (!esTipoSeguimiento(tipo)) {
    return { ok: false, error: 'El tipo de seguimiento no es válido.' }
  }

  if (!esUuid(id)) {
    return { ok: false, error: 'El id no es un uuid válido.' }
  }

  if (typeof seguir !== 'boolean') {
    return { ok: false, error: 'El valor de "seguir" tiene que ser verdadero o falso.' }
  }

  return { ok: true, tipo, id, seguir }
}

/** Una fila de flyer con su cuenta de Instagram (join), para `cuentaParaSeguir`. */
export interface FilaFlyerConCuenta {
  published_at: string
  account: { id: string; username: string; is_active: boolean } | null
}

/**
 * La cuenta de Instagram que la ficha ofrece seguir: la cuenta *activa* del
 * flyer más reciente. Por qué existe: un evento puede venir de flyers de
 * dos cuentas de Instagram distintas, fusionados por la deduplicación, y la
 * ficha solo puede mostrar (y ofrecer seguir) una sola.
 *
 * Ordena por `published_at` descendente y, para desempatar, por
 * `account.id` descendente. Descarta las filas sin `account` y las de
 * cuentas con `is_active === false`. `null` si no queda ninguna fila.
 */
export function cuentaParaSeguir(
  filas: FilaFlyerConCuenta[],
): { id: string; username: string } | null {
  const candidatas = filas.filter(
    (fila): fila is FilaFlyerConCuenta & { account: { id: string; username: string; is_active: boolean } } =>
      fila.account !== null && fila.account.is_active !== false,
  )

  if (candidatas.length === 0) return null

  const [mejor] = [...candidatas].sort((a, b) => {
    const diferencia = new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    if (!Number.isNaN(diferencia) && diferencia !== 0) return diferencia
    if (a.account.id === b.account.id) return 0
    return a.account.id < b.account.id ? 1 : -1
  })

  return { id: mejor.account.id, username: mejor.account.username }
}

/** El texto del botón de "Seguir" (lugar o categoría), en los dos estados. */
export function textoSeguir(siguiendo: boolean): string {
  return siguiendo ? '✓ Siguiendo' : '+ Seguir'
}

/** El texto del botón de "Seguir" para una cuenta de Instagram, con su `@usuario`. */
export function textoSeguirCuenta(username: string, siguiendo: boolean): string {
  return siguiendo ? `Siguiendo @${username}` : `Seguir @${username}`
}
