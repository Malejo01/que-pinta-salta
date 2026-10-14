import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary">Que pinta Salta</h1>
          <p className="text-sm text-muted-foreground">Eventos en Salta Capital</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="size-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              ¡Gracias por registrarte!
            </CardTitle>
            <CardDescription>Revisa tu email para confirmar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Te hemos enviado un email de confirmacion. Por favor revisa tu
              bandeja de entrada y haz click en el enlace para activar tu cuenta.
            </p>
            <Button asChild className="w-full" variant="outline">
              <Link href="/">Volver a inicio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
