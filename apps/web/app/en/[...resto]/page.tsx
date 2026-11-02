import { notFound } from "next/navigation"

// Q4-6: cualquier /en/<algo> que no tiene página propia cae acá y muestra la
// 404 en inglés (`app/en/not-found.tsx`). Sin esto Next usaría la 404 raíz,
// en castellano. Las rutas que sí existen (/en/mapa, /en/evento/<id>, …)
// tienen prioridad sobre este catch-all.
export default function RutaInexistenteEn() {
  notFound()
}
