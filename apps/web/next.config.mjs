// Interruptor de monetización (ver lib/config/monetization.ts). Apagado, la
// CSP no habilita ningún dominio de anuncios. Se evalúa en el build.
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
const ifAds = (sources) => (ADS_ENABLED ? sources : [])

const csp = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'", "'unsafe-eval'", "'unsafe-inline'",
    'https://va.vercel-scripts.com',
    'https://www.googletagmanager.com', 'https://*.googletagmanager.com', 'https://tagmanager.google.com',
    'https://www.google-analytics.com', 'https://*.google-analytics.com',
    ...ifAds([
      'https://pagead2.googlesyndication.com', 'https://adservice.google.com',
      'https://googleads.g.doubleclick.net', 'https://*.adtrafficquality.google', 'https://*.doubleclick.net',
      'https://www.googleadservices.com', 'https://*.googleadservices.com',
    ]),
    'https://www.google.com', 'https://*.google.com', 'https://*.google.com.ar',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://*.googletagmanager.com', 'https://tagmanager.google.com', 'https://fonts.googleapis.com'],
  'img-src': [
    "'self'", 'blob:', 'data:',
    'https://*.supabase.co',
    'https://entradauno.com', 'https://*.entradauno.com',
    'https://norteticket.com', 'https://*.norteticket.com', 'https://norteticket.com.ar', 'https://*.norteticket.com.ar',
    'https://centralticket.com.ar', 'https://*.centralticket.com.ar',
    'https://vamos.gob.ar', 'https://*.vamos.gob.ar',
    'https://alpogo.com', 'https://*.alpogo.com',
    'https://images.unsplash.com', 'https://*.unsplash.com',
    'https://*.googletagmanager.com', 'https://*.google-analytics.com',
    'https://*.cinemark.com.ar', 'https://*.adro.studio',
    ...(ADS_ENABLED
      ? [
          'https://pagead2.googlesyndication.com', 'https://adservice.google.com',
          'https://googleads.g.doubleclick.net', 'https://*.doubleclick.net',
        ]
      : ['https://stats.g.doubleclick.net']),
    'https://*.google.com', 'https://*.google.com.ar',
    ...ifAds(['https://*.googleadservices.com', 'https://*.merchant-center-analytics.goog', 'https://*.adtrafficquality.google']),
  ],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': [
    "'self'", 'https://*.supabase.co', 'wss://*.supabase.co',
    'https://*.google-analytics.com', 'https://*.analytics.google.com',
    ...(ADS_ENABLED
      ? [
          'https://pagead2.googlesyndication.com', 'https://*.adtrafficquality.google',
          'https://*.doubleclick.net', 'https://*.g.doubleclick.net', 'https://googleads.g.doubleclick.net',
        ]
      : ['https://stats.g.doubleclick.net']),
    'https://*.googletagmanager.com', 'https://*.google.com', 'https://*.google.com.ar',
    ...ifAds(['https://*.googleadservices.com', 'https://*.merchant-center-analytics.goog']),
  ],
  'frame-src': [
    'https://*.googletagmanager.com',
    ...ifAds([
      'https://googleads.g.doubleclick.net', 'https://*.doubleclick.net',
      'https://tpc.googlesyndication.com', 'https://*.adtrafficquality.google',
    ]),
    'https://*.google.com', 'https://*.google.com.ar',
  ],
  'frame-ancestors': ["'none'"],
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Paquetes del monorepo que se importan como TypeScript fuente (R22).
  transpilePackages: ['@qps/core', '@qps/db'],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Android busca Digital Asset Links en esta ruta exacta y no sigue
  // redirecciones: tiene que ser un rewrite (R23, 23-c).
  async rewrites() {
    return [
      { source: '/.well-known/assetlinks.json', destination: '/api/app-links' },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: Object.entries(csp)
              .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
              .join('; '),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
