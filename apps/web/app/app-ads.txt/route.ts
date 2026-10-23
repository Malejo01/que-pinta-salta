// `app-ads.txt` para AdMob (fuente: support.google.com/admob/answer/9363762):
// un archivo público en la raíz del dominio, con una línea DIRECT por cada
// red de anuncios autorizada a vender el inventario de la app. Se arma en el
// build (`dynamic = 'force-static'`), nunca a mano: si falta
// `ADMOB_PUBLISHER_ID` (variable de servidor, sin `NEXT_PUBLIC_`: no se
// expone al cliente) o no tiene el formato exacto `pub-` + 16 dígitos, 404 —
// nunca se publica una línea vacía ni un ID inventado.
export const dynamic = 'force-static'

const PUBLISHER_ID_RE = /^pub-\d{16}$/

export function GET() {
  const publisherId = process.env.ADMOB_PUBLISHER_ID

  if (!publisherId || !PUBLISHER_ID_RE.test(publisherId)) {
    return new Response(null, { status: 404 })
  }

  const body = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
