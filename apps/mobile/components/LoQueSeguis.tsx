// "Lo que seguís" en Cuenta (R47, tarea 47-g, QPS-197): las tres listas de
// seguidos (lugares, cuentas de Instagram y categorías), con "Dejar de
// seguir" en cada fila. Solo se muestra con sesión (lo decide
// `app/(tabs)/cuenta.tsx`, que pasa el `userId` por prop — a diferencia de
// `SeccionNotificaciones.tsx`, este componente no lee `useSession()` por su
// cuenta, para no repetir esa lectura dos veces en la misma pantalla).
//
// Las escrituras pasan siempre por `cambiarSeguimiento` (`lib/radar.ts`):
// este archivo nunca importa `supabase`, ni transitivamente (ver
// `tests/lo-que-seguis.test.ts`, mismo criterio que
// `tests/fila-acciones.test.ts` para `BotonSeguir.tsx`).
//
// La lógica de "de las tres listas a las filas que se dibujan" es
// `filasDeLoQueSeguis`, una función pura (sin React, sin Supabase): aplana
// `LoQueSeguis` (de `lib/radar.ts`) en el orden de los grupos (lugares,
// cuentas, categorías). La pantalla agrupa de nuevo por `tipo` para pintar
// los tres encabezados, filtrando esa misma lista ya aplanada (no vuelve a
// leer `lugares`/`cuentas`/`categorias` por separado).
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { Cargando, ErrorCarga, Vacio } from '@/components/EstadoCarga'
import { Texto } from '@/components/Texto'
import { useColoresQPS } from '@/lib/colores'
import { cambiarSeguimiento, obtenerLoQueSeguis, type LoQueSeguis as ListasDeSeguimiento } from '@/lib/radar'

export type TipoDeSeguimiento = 'lugar' | 'cuenta' | 'categoria'

export interface FilaLoQueSeguis {
  tipo: TipoDeSeguimiento
  id: string
  etiqueta: string
}

const TITULO_GRUPO: Record<TipoDeSeguimiento, string> = {
  lugar: 'Lugares',
  cuenta: 'Cuentas de Instagram',
  categoria: 'Categorías',
}

// Mismo texto que la web (ver el encargo de esta tarea).
const MENSAJE_SIN_NADA =
  'Todavía no seguís nada. Seguí un lugar desde la ficha de un evento, o elegí categorías en el Radar.'
export const MENSAJE_ERROR_CARGA = 'No pudimos cargar lo que seguís. Probá de nuevo.'
export const MENSAJE_ERROR_DEJAR_DE_SEGUIR = 'No pudimos actualizar el seguimiento. Probá de nuevo.'

// Mismo valor que `COLOR_ERROR` de `app/(tabs)/cuenta.tsx` y
// `components/SeccionNotificaciones.tsx` (33-a, QPS-146): un rojo fijo (D1,
// la app arranca siempre en oscuro), nunca elegido según el esquema del
// sistema, y siempre en una constante con nombre (nunca escrito a mano en
// un `color:` — QPS-146/QPS-147).
const COLOR_ERROR = '#f87171'

/**
 * Las tres listas de `obtenerLoQueSeguis` (`lib/radar.ts`), aplanadas a las
 * filas que dibuja la pantalla, en el orden de los grupos: lugares,
 * cuentas de Instagram, categorías. Pura: sin React, sin Supabase.
 * Exportada para probarla con fixtures en `tests/lo-que-seguis.test.ts`.
 */
export function filasDeLoQueSeguis(listas: ListasDeSeguimiento): FilaLoQueSeguis[] {
  return [
    ...listas.lugares.map((lugar) => ({ tipo: 'lugar' as const, id: lugar.id, etiqueta: lugar.nombre })),
    ...listas.cuentas.map((cuenta) => ({
      tipo: 'cuenta' as const,
      id: cuenta.id,
      etiqueta: `@${cuenta.username}`,
    })),
    ...listas.categorias.map((categoria) => ({
      tipo: 'categoria' as const,
      id: categoria.id,
      etiqueta: categoria.nombre,
    })),
  ]
}

/** Clave única de una fila (combina tipo + id: un lugar y una cuenta nunca comparten tabla, pero la clave no depende de eso). */
function claveDeFila(fila: Pick<FilaLoQueSeguis, 'tipo' | 'id'>): string {
  return `${fila.tipo}:${fila.id}`
}

type Estado = { tipo: 'cargando' } | { tipo: 'error'; error: string } | { tipo: 'ok'; filas: FilaLoQueSeguis[] }

export interface LoQueSeguisProps {
  /** El `userId` de la sesión, leído por la pantalla (`useSession()`), nunca por este componente. */
  userId: string
}

export function LoQueSeguis({ userId }: LoQueSeguisProps) {
  const router = useRouter()
  const colores = useColoresQPS()

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  // Clave (tipo:id) de la fila que está en vuelo, o null: solo una fila a
  // la vez puede estar "Dejando de seguir" (mismo patrón pesimista que
  // `BotonSeguir.tsx`).
  const [enVuelo, setEnVuelo] = useState<string | null>(null)
  // Error de la ACCIÓN de "Dejar de seguir" (distinto del error de carga,
  // que reemplaza toda la pantalla): se muestra arriba de la lista, sin
  // perder las filas que ya se cargaron (mismo lugar que el error de
  // `app/(tabs)/cuenta.tsx` y `SeccionNotificaciones.tsx`).
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    setErrorAccion(null)
    try {
      const listas = await obtenerLoQueSeguis(userId)
      setEstado({ tipo: 'ok', filas: filasDeLoQueSeguis(listas) })
    } catch {
      setEstado({ tipo: 'error', error: MENSAJE_ERROR_CARGA })
    }
  }, [userId])

  // useFocusEffect (no useEffect, mismo motivo que app/(tabs)/favoritos.tsx):
  // recarga cada vez que la pantalla de Cuenta toma foco (por ejemplo, al
  // volver de seguir un lugar desde una ficha), y de paso evita el lint
  // `react-hooks/set-state-in-effect` que sí marca a useEffect llamando una
  // función que hace setState (lo mismo que ya arrastra, en la línea de
  // base, `components/SeccionNotificaciones.tsx`).
  useFocusEffect(
    useCallback(() => {
      cargar()
    }, [cargar]),
  )

  async function dejarDeSeguir(fila: FilaLoQueSeguis) {
    if (enVuelo) return
    const clave = claveDeFila(fila)
    setErrorAccion(null)
    setEnVuelo(clave)
    const resultado = await cambiarSeguimiento(userId, { tipo: fila.tipo, id: fila.id, seguir: false })
    setEnVuelo(null)
    if (!resultado.ok) {
      setErrorAccion(MENSAJE_ERROR_DEJAR_DE_SEGUIR)
      return
    }
    setEstado((anterior) =>
      anterior.tipo === 'ok'
        ? { tipo: 'ok', filas: anterior.filas.filter((f) => claveDeFila(f) !== clave) }
        : anterior,
    )
  }

  if (estado.tipo === 'cargando') {
    return (
      <View style={estilos.seccion}>
        <Cargando />
      </View>
    )
  }

  if (estado.tipo === 'error') {
    return (
      <View style={estilos.seccion}>
        <Texto peso="bold" style={estilos.titulo}>
          Lo que seguís
        </Texto>
        <ErrorCarga mensaje={estado.error} onReintentar={cargar} />
      </View>
    )
  }

  if (estado.filas.length === 0) {
    return (
      <View style={estilos.seccion}>
        <Texto peso="bold" style={estilos.titulo}>
          Lo que seguís
        </Texto>
        <Vacio mensaje={MENSAJE_SIN_NADA} textoAccion="Ir al Radar" onAccion={() => router.push('/radar')} />
      </View>
    )
  }

  const grupos: TipoDeSeguimiento[] = ['lugar', 'cuenta', 'categoria']

  return (
    <View style={estilos.seccion}>
      <Texto peso="bold" style={estilos.titulo}>
        Lo que seguís
      </Texto>

      {errorAccion ? <Texto style={{ color: COLOR_ERROR }}>{errorAccion}</Texto> : null}

      {grupos.map((tipo) => {
        const filasDelGrupo = estado.filas.filter((fila) => fila.tipo === tipo)
        if (filasDelGrupo.length === 0) return null

        return (
          <View key={tipo} style={estilos.grupo}>
            <Texto peso="semibold" tono="secundario" style={estilos.tituloGrupo}>
              {TITULO_GRUPO[tipo]}
            </Texto>
            {filasDelGrupo.map((fila) => {
              const ocupado = enVuelo === claveDeFila(fila)
              return (
                <View key={claveDeFila(fila)} style={[estilos.fila, { borderBottomColor: colores.border }]}>
                  <Texto style={estilos.etiqueta}>{fila.etiqueta}</Texto>
                  <Pressable
                    onPress={() => dejarDeSeguir(fila)}
                    disabled={ocupado}
                    accessibilityRole="button"
                    accessibilityLabel={`Dejar de seguir ${fila.etiqueta}`}
                    accessibilityState={{ busy: ocupado }}
                    style={estilos.boton}
                  >
                    <Texto peso="semibold" tono="primario" style={estilos.textoBoton}>
                      {ocupado ? 'Dejando de seguir…' : 'Dejar de seguir'}
                    </Texto>
                  </Pressable>
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16 },
  grupo: { gap: 2, marginTop: 8 },
  tituloGrupo: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  etiqueta: { flex: 1 },
  // minHeight 48 (criterio de accesibilidad de esta tarea): el botón entero
  // es el blanco táctil, centrado, sin depender de hitSlop.
  boton: { minHeight: 48, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  textoBoton: { fontSize: 13 },
})
