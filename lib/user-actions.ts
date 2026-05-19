"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase: null, error: "No autenticado" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") return { supabase: null, error: "Sin permisos de administrador" }

  return { supabase, error: null }
}

export async function getUsers() {
  const { supabase, error } = await assertAdmin()
  if (error || !supabase) return { data: [], error }

  const { data, error: dbError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false })

  return { data: data ?? [], error: dbError?.message ?? null }
}

export async function updateUserRole(userId: string, newRole: "USER" | "ADMIN") {
  const { supabase, error } = await assertAdmin()
  if (error || !supabase) return { error }

  const { error: dbError } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId)

  if (dbError) return { error: dbError.message }

  revalidatePath("/admin/users")
  return { error: null }
}
