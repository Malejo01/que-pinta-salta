// Q5-11 · Idioma de la app: el contexto, el hook y los diccionarios.
//
//   const t = useTextos()            // diccionario del idioma actual
//   const { idioma, preferencia, cambiarPreferencia } = useIdioma()
//
// Por defecto, el idioma del teléfono («Automático»). La elección se guarda
// en el teléfono (`qps.idioma`); no viaja al servidor.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { almacenPorDefecto, type Almacen } from '@/lib/sin-conexion/almacen'
import type { Diccionario } from './diccionarios/es'
import { textosDe } from './textos'
import {
  guardarPreferenciaIdioma,
  idiomaEfectivo,
  leerPreferenciaIdioma,
  type Idioma,
  type PreferenciaIdioma,
} from './idioma'

export type { Diccionario } from './diccionarios/es'
export type { Idioma, PreferenciaIdioma } from './idioma'

// Q6-1: `textosDe` vive en `./textos` (sin React) y se reexporta acá.
export { textosDe }

interface ValorIdioma {
  idioma: Idioma
  preferencia: PreferenciaIdioma
  cambiarPreferencia: (p: PreferenciaIdioma) => void
  /**
   * Q6-1: `true` cuando ya se leyó la preferencia guardada. Los avisos locales
   * esperan a esto para no programarse con el idioma del teléfono y, un
   * instante después, con el elegido.
   */
  listo: boolean
}

const ContextoIdioma = createContext<ValorIdioma>({
  idioma: idiomaEfectivo('auto'),
  preferencia: 'auto',
  cambiarPreferencia: () => {},
  listo: true,
})

export function IdiomaProvider({ children, almacen = almacenPorDefecto }: { children: ReactNode; almacen?: Almacen }) {
  const [preferencia, setPreferencia] = useState<PreferenciaIdioma>('auto')
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let vigente = true
    leerPreferenciaIdioma(almacen).then((p) => {
      if (!vigente) return
      setPreferencia(p)
      setListo(true)
    })
    return () => {
      vigente = false
    }
  }, [almacen])

  const cambiarPreferencia = useCallback(
    (p: PreferenciaIdioma) => {
      setPreferencia(p)
      void guardarPreferenciaIdioma(almacen, p)
    },
    [almacen],
  )

  const valor = useMemo(
    () => ({ idioma: idiomaEfectivo(preferencia), preferencia, cambiarPreferencia, listo }),
    [preferencia, cambiarPreferencia, listo],
  )
  return <ContextoIdioma.Provider value={valor}>{children}</ContextoIdioma.Provider>
}

export function useIdioma(): ValorIdioma {
  return useContext(ContextoIdioma)
}

export function useTextos(): Diccionario {
  return textosDe(useIdioma().idioma)
}
