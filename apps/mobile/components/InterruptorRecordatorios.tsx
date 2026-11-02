// Q4-10: «Recordatorios de lo que guardaste» en Cuenta (con sesión). La
// preferencia es local (el teléfono programa los avisos, sin backend).
//
// - Prendido por defecto solo si la persona ya dio el permiso de
//   notificaciones; sin permiso se ve apagado.
// - Prenderlo sin permiso es una acción de la persona: ahí sí se pide (con
//   `usePush().activar`, el mismo camino que «Activar notificaciones»). Nunca
//   se pide en frío ni se insiste: si lo niega, queda apagado.
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { usePush } from '@/lib/push'
import { avisarCambioGuardados } from '@/lib/recordatorios/cambios'
import { estanActivos, guardarPreferencia } from '@/lib/recordatorios'

export const ETIQUETA_RECORDATORIOS = 'Recordatorios de lo que guardaste'
export const DESCRIPCION_RECORDATORIOS = 'La tarde anterior (18:00) te recordamos lo que guardaste o marcaste «Voy».'

export function InterruptorRecordatorios() {
  const { estado, activar } = usePush()
  const [activos, setActivos] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    estanActivos().then((valor) => {
      if (vigente) setActivos(valor)
    })
    return () => {
      vigente = false
    }
  }, [estado])

  const cambiar = useCallback(
    async (valor: boolean) => {
      if (guardando) return
      setGuardando(true)
      try {
        if (valor && estado !== 'activo') {
          const resultado = await activar()
          if (resultado !== 'activo') return
        }
        await guardarPreferencia(valor)
        setActivos(valor)
        avisarCambioGuardados()
      } finally {
        setGuardando(false)
      }
    },
    [activar, estado, guardando],
  )

  return (
    <View style={estilos.fila}>
      <View style={estilos.etiqueta}>
        <Texto>{ETIQUETA_RECORDATORIOS}</Texto>
        <Texto tono="secundario" style={estilos.descripcion}>
          {DESCRIPCION_RECORDATORIOS}
        </Texto>
      </View>
      <Switch
        value={activos}
        onValueChange={(valor) => void cambiar(valor)}
        disabled={guardando}
        accessibilityLabel={ETIQUETA_RECORDATORIOS}
        accessibilityHint={DESCRIPCION_RECORDATORIOS}
        accessibilityState={{ checked: activos, busy: guardando }}
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  fila: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  etiqueta: { flex: 1, marginRight: 12, gap: 2 },
  descripcion: { fontSize: 12 },
})
