/**
 * El modal de ingreso y alta (`components/auth-modal.tsx`) en inglés (Q3): lo
 * abren ♥ Save, ✓ I'm going y + Follow sin sesión desde /en. Sus textos salen
 * del diccionario (`auth`); el castellano tiene que seguir EXACTAMENTE igual.
 * Los mensajes de error y de alta los sigue eligiendo core (sin delatar si un
 * email tiene cuenta): el diccionario solo los traduce.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MENSAJE_ALTA_CON_SESION,
  MENSAJE_ALTA_ENVIADA,
  MENSAJE_ALTA_GENERICO,
  mensajeErrorAlta,
  mensajeErrorIngreso,
} from '@qps/core/auth/mensajes'
import { validarContrasenaNueva } from '@qps/core/auth/cuenta'
import { es } from '@/lib/i18n/diccionarios/es'
import { PasswordInputField } from '@/components/ui/password-input'
import { en } from '@/lib/i18n/diccionarios/en'

const ROOT = join(__dirname, '..', '..')
const fuente = readFileSync(join(ROOT, 'components/auth-modal.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:"'])\/\/.*$/gm, '$1')

const ES_ANTES = {
  tituloIngresar: 'Iniciar Sesión',
  tituloCrear: 'Crear Cuenta',
  descripcionIngresar: 'Guardá tus eventos favoritos para tenerlos siempre a mano.',
  descripcionCrear: 'Sumate para guardar favoritos y personalizar tu agenda.',
  email: 'Email',
  emailPlaceholder: 'tu@email.com',
  contrasena: 'Contraseña',
  mostrarContrasena: 'Mostrar contraseña',
  olvidasteContrasena: '¿Olvidaste tu contraseña?',
  iniciandoSesion: 'Iniciando sesión...',
  creandoCuenta: 'Creando cuenta...',
  botonIngresar: 'Iniciar Sesión',
  botonRegistrarse: 'Registrarse',
  oContinuarCon: 'O continuar con',
  aceptasConGoogle: 'Al continuar con Google aceptás los',
  aceptasAlCrear: 'Al crear tu cuenta aceptás los',
  terminos: 'Términos y condiciones',
  yLa: 'y la',
  privacidad: 'Política de Privacidad',
  cierreLegales: '.',
  noTenesCuenta: '¿No tenés cuenta?',
  registrate: 'Registrate',
  yaTenesCuenta: '¿Ya tenés cuenta?',
  iniciaSesion: 'Iniciá Sesión',
  errorGoogle: 'Ocurrió un error al iniciar sesión con Google. Probá de nuevo.',
  bienvenidoDeNuevo: '¡Bienvenido de nuevo!',
  sesionIniciada: 'Sesión iniciada correctamente.',
  bienvenido: '¡Bienvenido!',
  revisaTuEmail: 'Revisá tu email',
}

// Todos los textos que puede dar core en el modal (ingreso, alta y largo de contraseña).
const corta = validarContrasenaNueva('', '')
const MENSAJES_DE_CORE = [
  MENSAJE_ALTA_GENERICO,
  MENSAJE_ALTA_ENVIADA,
  MENSAJE_ALTA_CON_SESION,
  mensajeErrorAlta({ code: 'weak_password' }),
  mensajeErrorAlta({ code: 'email_address_invalid' }),
  mensajeErrorAlta({ status: 429 }),
  mensajeErrorAlta({}),
  mensajeErrorIngreso({ code: 'invalid_credentials' }),
  mensajeErrorIngreso({ code: 'email_not_confirmed' }),
  mensajeErrorIngreso({ code: 'over_request_rate_limit' }),
  mensajeErrorIngreso({}),
  corta.ok ? '' : corta.mensaje,
]

describe('el castellano no cambió', () => {
  it('los textos del modal', () => {
    const textos = Object.fromEntries(Object.entries(es.auth).filter(([clave]) => clave !== 'mensaje'))
    expect(textos).toEqual(ES_ANTES)
  })

  it('los mensajes de core pasan tal cual', () => {
    for (const m of MENSAJES_DE_CORE) expect(es.auth.mensaje(m)).toBe(m)
  })
})

describe('el inglés', () => {
  it('traduce todos los mensajes de core que puede mostrar el modal', () => {
    expect(corta.ok).toBe(false)
    for (const m of MENSAJES_DE_CORE) {
      const traducido = en.auth.mensaje(m)
      expect(traducido).not.toBe(m)
      expect(traducido).not.toMatch(/[áéíóúñ¿¡]/)
    }
  })

  it('un texto que no conoce queda como vino (y el modal lo marca con lang="es")', () => {
    expect(en.auth.mensaje('Un texto nuevo de core')).toBe('Un texto nuevo de core')
    expect(fuente).toContain('const langError = idioma !== "es" && errorVisible === error ? "es" : undefined')
  })

  it('las páginas legales existen solo en castellano: lo dice el texto', () => {
    expect(en.auth.cierreLegales).toMatch(/Spanish/)
  })
})

describe('components/auth-modal.tsx usa el diccionario', () => {
  it('llama a useTextos() y useIdioma()', () => {
    expect(fuente).toMatch(/useTextos\(\)\.auth/)
    expect(fuente).toMatch(/useIdioma\(\)/)
  })

  it.each(Object.entries(ES_ANTES).filter(([, texto]) => texto.length > 2 && texto !== 'Email'))(
    'no tiene el literal de %s',
    (_clave, texto) => {
      expect(fuente).not.toContain(`"${texto}"`)
      expect(fuente).not.toContain(`'${texto}'`)
      expect(fuente).not.toMatch(new RegExp(`>\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    },
  )

  it('el error se guarda como lo da core y se traduce al mostrarlo', () => {
    expect(fuente).toMatch(/setError\(mensajeErrorIngreso\(error\)\)/)
    expect(fuente).toContain('t.mensaje(error)')
    expect(fuente).not.toMatch(/>\s*\{error\}\s*</)
  })

  it('los links a páginas solo en castellano llevan hrefLang fuera del castellano', () => {
    expect(fuente).toContain('hrefLang={hrefLangDestino(idioma, "/auth/recuperar")}')
    expect(fuente.match(/\{\.\.\.langLegales\}/g)).toHaveLength(4)
  })
})

describe('el ojito de la contraseña', () => {
  type Elemento = { props: { children: Elemento[] | Elemento; 'aria-label'?: string } }
  const boton = (props: Record<string, unknown>) =>
    ((PasswordInputField({ visible: false, onToggleVisible: () => {}, ...props }) as unknown as Elemento).props
      .children as Elemento[])[1]

  it('el modal le pasa el nombre del diccionario; sin pasarlo, sigue en castellano', () => {
    expect(fuente).toContain('etiquetaMostrar={t.mostrarContrasena}')
    expect(boton({ etiquetaMostrar: en.auth.mostrarContrasena }).props['aria-label']).toBe('Show password')
    expect(boton({}).props['aria-label']).toBe('Mostrar contraseña')
    expect(es.auth.mostrarContrasena).toBe('Mostrar contraseña')
  })
})
