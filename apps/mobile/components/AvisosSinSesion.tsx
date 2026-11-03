// R82 / Q4-2: sección «Avisos» de Cuenta para quien NO inició sesión.
//
// Dos interruptores: los avisos del equipo de Qué Pinta Salta y los avisos
// patrocinados (apagados por defecto, política de anuncios de Play). Sin
// cuenta no hay recordatorios de favoritos, novedades de lo que seguís ni
// Radar: eso lo dice el texto.
//
// - Sin permiso de notificaciones, los interruptores se ven apagados; prender
//   uno pide el permiso (es una acción de la persona, nunca en frío) y, si
//   queda activo, aplica el cambio.
// - Optimista con vuelta atrás: si el servidor no responde, el interruptor
//   vuelve a donde estaba y se avisa.
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, View } from 'react-native'
import { botonParaEstado } from '@/components/AvisoActivarPush'
import { InterruptorFinde } from '@/components/InterruptorFinde'
import { Texto } from '@/components/Texto'
import { avisar } from '@/lib/aviso'
import { useColoresQPS } from '@/lib/colores'
import { usePush } from '@/lib/push'
import { avisosVisibles, type AvisosAnonimos } from '@/lib/push/dispositivo'
import { avisosGuardadosDeEsteTelefono, cambiarAvisosDeEsteTelefono } from '@/lib/push/registro'
import { useIdioma, useTextos } from '@/lib/i18n'
import { es } from '@/lib/i18n/diccionarios/es'

// Q6-1: los textos viven en el diccionario (`notificaciones`); estas constantes son el castellano.
export const TITULO_AVISOS_SIN_SESION = es.notificaciones.sinSesionTitulo
export const TEXTO_AVISOS_SIN_SESION = es.notificaciones.sinSesionTexto
export const AVISO_NO_SE_PUDO_CAMBIAR = es.notificaciones.noSePudoCambiar


type Avisos = AvisosAnonimos
type Clave = keyof Avisos

export function AvisosSinSesion() {
  const colores = useColoresQPS()
  const { estado, sincronizado, activar, reintentar, abrirAjustes } = usePush()
  const { idioma } = useIdioma()
  const t = useTextos().notificaciones
  const [guardados, setGuardados] = useState<Avisos | null>(null)
  const [guardando, setGuardando] = useState<Clave | null>(null)
  const activo = estado === 'activo'

  // Relee lo guardado cuando cambia el estado del push (después de registrar).
  useEffect(() => {
    let vigente = true
    avisosGuardadosDeEsteTelefono().then((valor) => {
      if (vigente) setGuardados(valor)
    })
    return () => {
      vigente = false
    }
  }, [estado, sincronizado])

  const visibles = avisosVisibles(activo, guardados)

  const cambiar = useCallback(
    async (clave: Clave, valor: boolean) => {
      if (guardando) return
      setGuardando(clave)
      try {
        if (!activo) {
          // Apagar sin permiso no cambia nada (no llega nada igual).
          if (!valor) return
          const resultado = await activar()
          if (resultado !== 'activo') {
            avisar(t.sinPermiso)
            return
          }
        }
        const anterior = guardados
        setGuardados({ ...avisosVisibles(true, guardados), [clave]: valor })
        const r = await cambiarAvisosDeEsteTelefono({ [clave]: valor })
        if (r.ok) setGuardados(r.avisos)
        else {
          setGuardados(anterior)
          avisar(t.noSePudoCambiar)
        }
      } finally {
        setGuardando(null)
      }
    },
    [activar, activo, guardados, guardando, t],
  )

  const boton = botonParaEstado(estado, idioma)
  const accionBoton =
    boton?.accion === 'abrirAjustes' ? abrirAjustes : boton?.accion === 'reintentar' ? () => void reintentar() : () => void activar()

  return (
    <View style={estilos.seccion}>
      <Texto peso="semibold" accessibilityRole="header" style={estilos.titulo}>
        {t.sinSesionTitulo}
      </Texto>
      <Texto tono="secundario" style={estilos.textoDescripcion}>
        {t.sinSesionTexto}
      </Texto>

      {!activo && sincronizado ? (
        <View style={estilos.estadoPush}>
          <Texto tono="secundario" style={estilos.textoDescripcion}>
            {t.estadosPush[estado]}
          </Texto>
          {boton ? (
            <Pressable
              onPress={boton.accion ? accionBoton : undefined}
              disabled={boton.accion === null}
              accessibilityRole="button"
              accessibilityLabel={boton.etiqueta}
              accessibilityState={{ disabled: boton.accion === null, busy: estado === 'pidiendo' }}
              style={[
                estilos.boton,
                { borderColor: colores.border, backgroundColor: boton.accion ? colores.primary : colores.muted },
              ]}
            >
              <Texto peso="semibold" style={{ color: boton.accion ? colores.primaryForeground : colores.mutedForeground }}>
                {boton.etiqueta}
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={estilos.filaInterruptor}>
        <View style={estilos.filaEtiquetaConDescripcion}>
          <Texto>{t.equipo}</Texto>
          <Texto tono="secundario" style={estilos.textoDescripcion}>
            {t.equipoDescripcion}
          </Texto>
        </View>
        <Switch
          value={visibles.avisosEquipo}
          onValueChange={(valor) => void cambiar('avisosEquipo', valor)}
          disabled={guardando !== null}
          accessibilityLabel={t.equipo}
          accessibilityHint={activo ? t.equipoDescripcion : t.pidePermiso}
          accessibilityState={{ checked: visibles.avisosEquipo, busy: guardando === 'avisosEquipo' }}
        />
      </View>

      <View style={estilos.filaInterruptor}>
        <View style={estilos.filaEtiquetaConDescripcion}>
          <Texto>{t.patrocinados}</Texto>
          <Texto tono="secundario" style={estilos.textoDescripcion}>
            {t.patrocinadosSinSesion}
          </Texto>
        </View>
        <Switch
          value={visibles.avisosPatrocinados}
          onValueChange={(valor) => void cambiar('avisosPatrocinados', valor)}
          disabled={guardando !== null}
          accessibilityLabel={t.patrocinados}
          accessibilityHint={activo ? t.patrocinadosPista : t.pidePermiso}
          accessibilityState={{ checked: visibles.avisosPatrocinados, busy: guardando === 'avisosPatrocinados' }}
        />
      </View>

      {/* Q4-11: también sin cuenta (es una notificación local del teléfono). */}
      <InterruptorFinde />
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16 },
  estadoPush: { gap: 8 },
  // Mismo botón que AvisoActivarPush (pasa los detectores de área táctil).
  boton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  filaInterruptor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  filaEtiquetaConDescripcion: { flex: 1, marginRight: 12, gap: 2 },
  textoDescripcion: { fontSize: 12 },
})
