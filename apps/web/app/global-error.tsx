'use client'

// Reemplaza al layout raíz: no hay Tailwind ni providers, por eso los estilos van en línea.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const boton = {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid #a20519',
    background: '#a20519',
    color: '#ffffff',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'pointer',
  } as const
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#f8f8f8', color: '#0a0a0a', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: '32rem', margin: '0 auto', padding: '5rem 1rem', textAlign: 'center', lineHeight: 1.5 }}>
          <p style={{ color: '#a20519', fontWeight: 600, margin: 0 }}>Qué Pinta Salta</p>
          <h1>Algo salió mal</h1>
          <p style={{ color: '#555555' }}>Tuvimos un problema de nuestro lado. Probá de nuevo en un momento.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' }}>
            <button type="button" onClick={() => reset()} style={boton}>Probar de nuevo</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error no tiene layout ni router: <a> a propósito */}
            <a href="/" style={boton}>Ver qué pinta hoy</a>
          </div>
        </main>
      </body>
    </html>
  )
}
