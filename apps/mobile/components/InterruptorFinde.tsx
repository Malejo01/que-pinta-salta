// Q4-11: «Este finde pinta» (jueves 18:00) en Cuenta. Preferencia local.
// Prendido por defecto solo si ya hay permiso de notificaciones; prenderlo sin
// permiso es una acción de la persona y ahí se pide (`usePush().activar`).
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { Texto } from '@/components/Texto'
import { useIdioma, useTextos } from '@/lib/i18n'
import { es } from '@/lib/i18n/diccionarios/es'
import { avisar } from '@/lib/aviso'
import { usePush } from '@/lib/push'
import { findeActivo, guardarPreferenciaFinde, programarFinde } from '@/lib/finde'

// Q6-1: los textos viven en el diccionario (`notificaciones.finde*`); estas constantes son el castellano.
export const ETIQUETA_FINDE = es.notificaciones.finde
export const DESCRIPCION_FINDE = es.notificaciones.findeDescripcion

export function InterruptorFinde() {
  const { estado, activar } = usePush()
  const { idioma } = useIdioma()
  const t = useTextos().notificaciones
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
            avisar(t.sinPermiso)
            return
          }
        }
        await guardarPreferenciaFinde(valor)
        setActivo(valor)
        await programarFinde(new Date(), { idioma })
      } finally {
        setGuardando(false)
      }
    },
    [activar, estado, guardando, idioma, t],
  )

  return (
    <View style={estilos.fila}>
      <View style={estilos.etiqueta}>
        <Texto>{t.finde}</Texto>
        <Texto tono="secundario" style={estilos.descripcion}>
          {t.findeDescripcion}
        </Texto>
      </View>
      <Switch
        value={activo}
        onValueChange={(valor) => void cambiar(valor)}
        disabled={guardando}
        accessibilityLabel={t.finde}
        accessibilityHint={estado === 'activo' ? t.findeDescripcion : `${t.findeDescripcion} ${t.pidePermiso}`}
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
