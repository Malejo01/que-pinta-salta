"use client"

import { useState, useTransition } from "react"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { updateContactSettings } from "@/lib/profile-actions"

interface Profile {
  id: string
  role: string
  contact_type?: 'whatsapp' | 'instagram' | 'facebook' | null
  contact_value?: string | null
}

export function ContactSettingsForm({ profile }: { profile: Profile }) {
  const [contactType, setContactType] = useState<'whatsapp' | 'instagram' | 'facebook' | ''>(
    profile.contact_type || ""
  )
  const [contactValue, setContactValue] = useState(profile.contact_value || "")
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  if (profile.role !== "COLLABORATOR") return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    startTransition(async () => {
      if (!contactType) {
        toast({ title: "Error", description: "Selecciona un método de contacto", variant: "destructive" })
        return
      }
      if (!contactValue) {
        toast({ title: "Error", description: "Ingresa tu número o enlace", variant: "destructive" })
        return
      }

      const res = await updateContactSettings(
        contactType as 'whatsapp' | 'instagram' | 'facebook',
        contactValue
      )

      if (res.error) {
        toast({ title: "Error", description: res.error, variant: "destructive" })
      } else {
        toast({ title: "Guardado", description: "Tus datos de contacto han sido actualizados." })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Método de Contacto</CardTitle>
        <CardDescription>
          Elige cómo quieres que los usuarios te contacten cuando publicas un evento.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Canal de Comunicación</Label>
            <Select 
              value={contactType} 
              onValueChange={(val: any) => setContactType(val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Número o Enlace</Label>
            <Input 
              placeholder={contactType === "whatsapp" ? "+549387..." : "https://instagram.com/tu_usuario"} 
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {contactType === "whatsapp" 
                ? "Ingresa tu número completo con código de país (ej. +549387...)" 
                : "Ingresa el enlace directo a tu perfil."}
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar Preferencias"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
