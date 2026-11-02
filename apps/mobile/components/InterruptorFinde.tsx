// Q4-11: «Este finde pinta» (jueves 18:00) en Cuenta. Preferencia local.
// Prendido por defecto solo si ya hay permiso de notificaciones; prenderlo sin
// permiso es una acción de la persona y ahí se pide (`usePush().activar`).
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { AVISO_SIN_PERMISO, PISTA_PIDE_PERMISO } from '@/lib/push/textos-interruptores'
import { avisar } from '@/lib/aviso'
import { usePush } from '@/lib/push'
import { findeActivo, guardarPreferenciaFinde, programarFinde } from '@/lib/finde'

export const ETIQUETA_FINDE = 'Este finde pinta'
export const DESCRIPCION_FINDE = 'Los jueves a las 18:00, cuántos planes hay para el fin de semana.'

export function InterruptorFinde() {
  const { estado, activar } = usePush()
  const [activo, setActivo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vigente = true
    findeActivo().then((valor) => {
      if (vigente) setActivo(valor)
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
          if (resultado !== 'activo') {
            // R-2: el interruptor queda apagado; se dice por qué (TalkBack lo lee).
            avisar(AVISO_SIN_PERMISO)
            return
          }
        }
        await guardarPreferenciaFinde(valor)
        setActivo(valor)
        await programarFinde(new Date())
      } finally {
        setGuardando(false)
      }
    },
    [activar, estado, guardando],
  )

  return (
    <View style={estilos.fila}>
      <View style={estilos.etiqueta}>
        <Texto>{ETIQUETA_FINDE}</Texto>
        <Texto tono="secundario" style={estilos.descripcion}>
          {DESCRIPCION_FINDE}
        </Texto>
      </View>
      <Switch
        value={activo}
        onValueChange={(valor) => void cambiar(valor)}
        disabled={guardando}
        accessibilityLabel={ETIQUETA_FINDE}
        accessibilityHint={estado === 'activo' ? DESCRIPCION_FINDE : `${DESCRIPCION_FINDE} ${PISTA_PIDE_PERMISO}`}
        accessibilityState={{ checked: activo, busy: guardando }}
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  fila: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  etiqueta: { flex: 1, marginRight: 12, gap: 2 },
  descripcion: { fontSize: 12 },
})
