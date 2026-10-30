'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  /** Nombre accesible del botón del ojito (Q3: el modal de ingreso en inglés). Por defecto, en castellano. */
  etiquetaMostrar?: string
}

type PasswordInputFieldProps = PasswordInputProps & {
  visible: boolean
  onToggleVisible: () => void
}

/**
 * Parte sin estado de `PasswordInput`: recibe `visible` y `onToggleVisible`
 * como props, así que se puede llamar directo en los tests (sin DOM ni
 * renderer) para revisar que las props lleguen al `<input>` y que el botón
 * no dispare el submit del formulario.
 */
function PasswordInputField({
  visible,
  onToggleVisible,
  className,
  etiquetaMostrar = 'Mostrar contraseña',
  ...props
}: PasswordInputFieldProps) {
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
      />
      {/*
        Botón de alternar: aria-label fijo + aria-pressed (no las dos cosas
        cambiando a la vez, revisión del #54). Mide lo mismo que el campo
        (inset-y-0, sin h-11: antes sobresalía 8 px del h-9 del Input); el
        ::after (-inset-y-1) lleva la zona de toque a 44 px sin cambiar lo que se ve.
      */}
      <button
        type="button"
        aria-label={etiquetaMostrar}
        aria-pressed={visible}
        onClick={onToggleVisible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

/**
 * Campo de contraseña con un botón de "ojito" para mostrar/ocultar el valor.
 * Arranca siempre oculto (type="password") y no recuerda el estado entre
 * montajes: cada instancia tiene su propio `useState`. Todas las props
 * (name, autoComplete, required, minLength, id, placeholder, className,
 * etc.) pasan directo al `<input>` interno, igual que si fuera un
 * `<Input type="password" />` común.
 */
function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false)

  return (
    <PasswordInputField
      {...props}
      visible={visible}
      onToggleVisible={() => setVisible((current) => !current)}
    />
  )
}

export { PasswordInput, PasswordInputField }
