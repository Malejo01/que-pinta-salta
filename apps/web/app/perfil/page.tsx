import { PaginaPerfil } from "./pagina-perfil"

export const revalidate = 0 // Evitar caché estática para esta página privada

// Q6-2: el cuerpo vive en `pagina-perfil.tsx`, compartido con /en/perfil.
export default async function PerfilPage() {
  return PaginaPerfil({ idioma: "es" })
}
