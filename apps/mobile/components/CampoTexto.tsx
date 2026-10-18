// Campo de texto reutilizable (28-h, F4/F5): fondo y borde que contrastan en
// los dos temas (`useColoresQPS`, QPS-126), con label visible arriba, foco
// en `primary` y, con `secureTextEntry` + `mostrarOcultar`, el "ojito" para
// mostrar/ocultar el texto (F5). Lo usan los campos de email y contraseña de
// Cuenta y los horarios de Notificaciones (`SeccionNotificaciones`).
//
// 33-a (QPS-151, vuelta 1): `accionDerecha` es una prop opcional, aditiva —
// sin ella, el componente se comporta exactamente igual que antes (Cuenta y
// Notificaciones no cambian en nada, y la rama de `conOjito` sigue intacta).
// Se agregó para que `app/(tabs)/buscar.tsx` pueda recuperar el botón de
// limpiar la búsqueda (el "X") que se perdió al migrar de un `TextInput`
// suelto a `CampoTexto`: se renderiza dentro de la `caja`, a la derecha del
// `TextInput`, igual que el "ojito" pero sin ningún comportamiento propio
// (el contenido y el `onPress` los define quien use `CampoTexto`).
import { forwardRef, useEffect, useState, type ReactNode } from 'react'
import { AppState, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { Icono } from '@/components/Icono'
import { hitSlopPara } from '@/lib/accesibilidad'
import { useColoresQPS } from '@/lib/colores'

// El rojo del error del alta/login (R24) seguía el esquema del sistema
// operativo (`useColorScheme()`): un rojo pensado para fondo claro
// (`#dc2626`) y otro para fondo oscuro (`#f87171`, F4). Pero D1 (29-g) hizo
// que la app renderice siempre oscura (`useColoresQPS()` ya no depende del
// esquema del sistema) — así que seguir el esquema del sistema era
// justamente lo que producía el rojo equivocado: con el teléfono en modo
// claro, el campo elegía `#dc2626` y lo pintaba sobre `colores.card`, que
// sigue oscuro (4,07:1, abajo del 4,5:1 de AA; revisor, 33-a vuelta 2,
// QPS-146). El color queda fijo, mismo valor y mismo motivo que
// `COLOR_ERROR` de `app/(tabs)/cuenta.tsx` y `components/SeccionNotificaciones.tsx`.
const COLOR_ERROR = '#f87171'

export interface CampoTextoProps extends TextInputProps {
  label: string
  error?: string
  /** Solo tiene efecto junto con `secureTextEntry`: suma el "ojito" para
   * mostrar/ocultar el texto (F5). */
  mostrarOcultar?: boolean
  /** Contenido opcional a la derecha del `TextInput`, dentro de la misma
   * `caja` (33-a, QPS-151): por ejemplo, el botón de limpiar de Buscar. Sin
   * esta prop, `CampoTexto` no cambia en nada. */
  accionDerecha?: ReactNode
}

export const CampoTexto = forwardRef<TextInput, CampoTextoProps>(function CampoTexto(
  { label, error, mostrarOcultar, accionDerecha, secureTextEntry, style, onFocus, onBlur, ...resto },
  ref
) {
  const colores = useColoresQPS()
  const [enFoco, setEnFoco] = useState(false)
  const [oculto, setOculto] = useState(true)

  const conOjito = Boolean(secureTextEntry) && Boolean(mostrarOcultar)

  // Si el campo tiene el "ojito" (contraseña visible), al pasar a segundo
  // plano (otra app al frente, o Android capturando el thumbnail de "Apps
  // recientes") se vuelve a ocultar. Solo se suscribe para los campos de
  // contraseña: los horarios de Notificaciones no tienen `conOjito`.
  useEffect(() => {
    if (!conOjito) return
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') {
        setOculto(true)
      }
    })
    return () => suscripcion.remove()
  }, [conOjito])

  return (
    <View style={estilos.contenedor}>
      <Text style={[estilos.label, { color: colores.foreground }]}>{label}</Text>
      <View
        style={[
          estilos.caja,
          {
            backgroundColor: colores.card,
            borderColor: enFoco ? colores.primary : colores.border,
            borderWidth: enFoco ? 2 : 1,
          },
        ]}
      >
        <TextInput
          ref={ref}
          {...resto}
          secureTextEntry={conOjito ? oculto : secureTextEntry}
          placeholderTextColor={colores.muted}
          onFocus={(evento) => {
            setEnFoco(true)
            onFocus?.(evento)
          }}
          onBlur={(evento) => {
            setEnFoco(false)
            onBlur?.(evento)
          }}
          style={[estilos.input, { color: colores.foreground }, style]}
        />
        {conOjito ? (
          <Pressable
            onPress={() => setOculto((valor) => !valor)}
            accessibilityRole="button"
            accessibilityLabel={oculto ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            // 46-c: el ojito es 44×44 (ver `estilos.ojito`), 4dp corto de los
            // 48 de `AREA_TACTIL_MINIMA`. No se sube el tamaño del estilo (no
            // tiene fondo/borde visible: agrandarlo no cambiaría nada de lo
            // que se VE, pero sí correría el TextInput vecino unos px, cosa
            // que `hitSlop` evita del todo) — el detector estático no ve
            // `hitSlop`, así que sigue listado en `tests/a11y/pendientes-componentes.ts`.
            hitSlop={hitSlopPara(44)}
            style={estilos.ojito}
          >
            <Icono nombre={oculto ? 'Eye' : 'EyeOff'} tamanio={20} color={colores.mutedForeground} />
          </Pressable>
        ) : null}
        {accionDerecha}
      </View>
      {error ? <Text style={[estilos.error, { color: COLOR_ERROR }]}>{error}</Text> : null}
    </View>
  )
})

const estilos = StyleSheet.create({
  contenedor: { width: '100%', gap: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    minHeight: 48,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 48,
  },
  ojito: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { fontSize: 13 },
})
