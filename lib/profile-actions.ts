"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function updateContactSettings(
  contactType: 'whatsapp' | 'instagram' | 'facebook', 
  contactValue: string
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "No autenticado" }

  const { error } = await supabase
    .from("profiles")
    .update({ 
      contact_type: contactType, 
      contact_value: contactValue 
    })
    .eq("id", user.id)

  if (error) {
    console.error("Error updating contact settings:", error)
    return { error: error.message }
  }

  revalidatePath("/perfil")
  return { success: true }
}
