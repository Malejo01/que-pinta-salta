// Pestaña Radar (29-g la creó envolviendo `SeccionRadar`; 29-d la reemplaza
// por la pantalla completa de la web: `PantallaRadar`, con las 3 cards de
// `/radar` + `radar-form.tsx` — ver ops/paridad-web-app.md §3.6).
import { PantallaRadar } from '@/components/PantallaRadar'

export default function RadarScreen() {
  return <PantallaRadar />
}
