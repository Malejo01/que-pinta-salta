// Q5-11 · «Idioma» en Cuenta: Automático (el del teléfono), Español o
// English. Se guarda en el teléfono. Tres botones de opción (radio) con
// `checked`, 48 dp de alto; el elegido se distingue por forma (relleno,
// borde de 2 y tilde), no solo por color. El cambio se anuncia.
import { Pressable, StyleSheet, View } from 'react-native'
import { Icono } from '@/components/Icono'
import { Texto } from '@/components/Texto'
import { anunciar } from '@/lib/anunciar'
import { bordeChipInactivo, useColoresQPS } from '@/lib/colores'
import { useIdioma, useTextos, type PreferenciaIdioma } from '@/lib/i18n'

export function SelectorIdioma() {
  const colores = useColoresQPS()
  const t = useTextos()
  const { preferencia, cambiarPreferencia } = useIdioma()
  const opciones: { valor: PreferenciaIdioma; texto: string; lang?: string }[] = [
    { valor: 'auto', texto: t.idioma.automatico },
    { valor: 'es', texto: t.idioma.castellano, lang: 'es' },
    { valor: 'en', texto: t.idioma.ingles, lang: 'en' },
  ]

  return (
    <View style={estilos.seccion} accessibilityRole="radiogroup" accessibilityLabel={t.idioma.titulo}>
      <Texto peso="semibold" accessibilityRole="header" style={estilos.titulo}>
        {t.idioma.titulo}
      </Texto>
      <Texto tono="secundario" style={estilos.descripcion}>
        {t.idioma.descripcion}
      </Texto>
      <View style={estilos.fila}>
        {opciones.map((o) => {
          const activa = preferencia === o.valor
          return (
            <Pressable
              key={o.valor}
              onPress={() => {
                cambiarPreferencia(o.valor)
                anunciar(t.idioma.cambiadoA(o.texto))
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: activa }}
              accessibilityLabel={o.texto}
              accessibilityLanguage={o.lang}
              style={[
                estilos.opcionIdioma,
                activa
                  ? { backgroundColor: colores.primary, borderWidth: 2, borderColor: colores.primary, paddingHorizontal: 13 }
                  : { backgroundColor: colores.card, borderWidth: 1, borderColor: bordeChipInactivo(colores) },
              ]}
            >
              {activa ? <Icono nombre="Check" tamanio={14} color={colores.primaryForeground} /> : null}
              <Texto peso={activa ? 'bold' : 'semibold'} style={{ color: activa ? colores.primaryForeground : colores.foreground }}>
                {o.texto}
              </Texto>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  seccion: { width: '100%', gap: 8, paddingVertical: 16 },
  titulo: { fontSize: 16 },
  descripcion: { fontSize: 12 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcionIdioma: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14 },
})
