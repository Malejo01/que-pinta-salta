// Q4-10: aviso de «cambió lo guardado» (Guardar, Voy o sacarlo). Puro: un
// conjunto de oyentes. Lo escucha el sincronizador de recordatorios para
// reprogramar sin esperar al próximo arranque.
type Oyente = () => void
const oyentes = new Set<Oyente>()

export function suscribirCambiosGuardados(oyente: Oyente): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export function avisarCambioGuardados(): void {
  oyentes.forEach((oyente) => {
    try {
      oyente()
    } catch {
      // Un oyente roto no frena a los demás.
    }
  })
}
