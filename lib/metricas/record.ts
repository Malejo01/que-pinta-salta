import type { MetricOrigin } from './links'

export type MetricKind = 'view' | 'click'

type RpcClient = {
  rpc(
    fn: 'record_event_metric',
    args: { p_event_id: string; p_kind: MetricKind; p_origin: MetricOrigin }
  ): PromiseLike<{ error: { message: string } | null }>
}

/**
 * Cuenta una vista o un clic. NUNCA lanza: medir no puede romper la compra ni
 * la ficha. Si falla (por ejemplo, la migración todavía no está aplicada),
 * loguea y sigue.
 */
export async function recordMetric(
  supabase: RpcClient,
  eventId: string,
  kind: MetricKind,
  origin: MetricOrigin
): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_event_metric', {
      p_event_id: eventId,
      p_kind: kind,
      p_origin: origin,
    })
    if (error) console.error('[metricas] no se pudo contar:', error.message)
  } catch (err) {
    console.error('[metricas] no se pudo contar:', err instanceof Error ? err.message : err)
  }
}
