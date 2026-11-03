// Q5-11 · Idioma de la app: el contexto, el hook y los diccionarios.
//
//   const t = useTextos()            // diccionario del idioma actual
//   const { idioma, preferencia, cambiarPreferencia } = useIdioma()
//
// Por defecto, el idioma del teléfono («Automático»). La elección se guarda
// en el teléfono (`qps.idioma`); no viaja al servidor.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { almacenPorDefecto, type Almacen } from '@/lib/sin-conexion/almacen'
import { en } from './diccionarios/en'
import { es, type Diccionario } from './diccionarios/es'
import {
  guardarPreferenciaIdioma,
  idiomaEfectivo,
  leerPreferenciaIdioma,
  type Idioma,
  type PreferenciaIdioma,
} from './idioma'

export type { Diccionario } from './diccionarios/es'
export type { Idioma, PreferenciaIdioma } from './idioma'

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en }

export function textosDe(idioma: Idioma): Diccionario {
  return DICCIONARIOS[idioma]
}

interface ValorIdioma {
  idioma: Idioma
  preferencia: PreferenciaIdioma
  cambiarPreferencia: (p: PreferenciaIdioma) => void
}

const ContextoIdioma = createContext<ValorIdioma>({
  idioma: idiomaEfectivo('auto'),
  preferencia: 'auto',
  cambiarPreferencia: () => {},
})

export function IdiomaProvider({ children, almacen = almacenPorDefecto }: { children: ReactNode; almacen?: Almacen }) {
  const [preferencia, setPreferencia] = useState<PreferenciaIdioma>('auto')

  useEffect(() => {
    let vigente = true
    leerPreferenciaIdioma(almacen).then((p) => {
      if (vigente) setPreferencia(p)
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

  const valor = useMemo(() => ({ idioma: idiomaEfectivo(preferencia), preferencia, cambiarPreferencia }), [preferencia, cambiarPreferencia])
  return <ContextoIdioma.Provider value={valor}>{children}</ContextoIdioma.Provider>
}

export function useIdioma(): ValorIdioma {
  return useContext(ContextoIdioma)
}

export function useTextos(): Diccionario {
  return textosDe(useIdioma().idioma)
}
