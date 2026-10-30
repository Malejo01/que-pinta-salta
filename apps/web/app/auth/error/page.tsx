import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

// En castellano y sin mostrar el `error` crudo de la query (antes se
// mostraba tal cual, en inglés): no da información útil para distinguir
// casos y agrega ruido en el idioma equivocado. Las dos salidas cubren los
// motivos más comunes de que el link no funcione: pedir uno nuevo o entrar
// directamente si la cuenta ya tiene contraseña.
export default function Page() {
  return (
    <main id="contenido" tabIndex={-1} className="flex min-h-svh w-full items-center justify-center p-6 focus:outline-none md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                <h1>El link no funcionó</h1>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Puede que haya vencido o que lo hayas abierto en otro navegador.
              </p>
              <div className="flex flex-col gap-2 text-sm">
                <Link href="/auth/recuperar" className="text-primary dark:text-[#F0585D] underline underline-offset-4">
                  Pedir un link nuevo
                </Link>
                <Link href="/auth/login" className="text-primary dark:text-[#F0585D] underline underline-offset-4">
                  Iniciar sesión
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
