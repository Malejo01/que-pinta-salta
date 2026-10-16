'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>

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
  ...props
}: PasswordInputFieldProps) {
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
      />
      <button
        type="button"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onClick={onToggleVisible}
        className="absolute inset-y-0 right-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
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
