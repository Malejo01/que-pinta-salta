# Qué Pinta Salta 🎸🍻

Agenda automatizada de eventos, peñas, boliches y actividades culturales en Salta Capital.

El proyecto recolecta información de distintas ticketeras y portales locales, unifica y clasifica los eventos de forma inteligente (removiendo duplicados), y los presenta en una interfaz rápida e intuitiva.

---

## 🛠️ Stack Tecnológico

- **Frontend:** Next.js (App Router, React 19)
- **Estilos y Componentes:** Tailwind CSS, Radix UI y Framer Motion
- **Base de Datos y Seguridad:** Supabase (PostgreSQL, Row Level Security para roles ADMIN/USER)
- **Scraping:** Cheerio y Puppeteer en TypeScript
- **Hosting:** Vercel

---

## 📂 Estructura del Código

- `/app`: Páginas y endpoints de la aplicación.
  - `/app/admin`: Panel administrativo para ejecutar scrapers, clasificar eventos no reconocidos y gestionar usuarios.
  - `/app/api/cron`: Endpoints de automatización (ejecución de scrapers y keep-alive de la base de datos).
  - `/app/evento/[id]`: Fichas individuales con detalles, ubicación (Google Maps) y enlaces de compra.
- `/components`: Componentes de UI (filtros dinámicos, carrusel de inicio, tarjetas de eventos y banners publicitarios).
- `/lib/scraper`: Módulo de web scraping que extrae eventos de múltiples fuentes, los formatea y los inserta en la base de datos resolviendo duplicados por similitud de nombre, fecha y lugar.
- `/supabase/migrations`: Migraciones SQL para la base de datos y políticas RLS (Row Level Security).

---

## 🕸️ Scrapers Integrados

El sistema cuenta con scrapers específicos que leen de las siguientes fuentes:

1. **Vamos Salta (Agenda Municipal):** `vamos-scraper.ts`
2. **Alpogo:** `alpogo-scraper.ts`
3. **NorteTicket:** `norteticket-scraper.ts`
4. **EntradaUno:** `entradauno-scraper.ts`

### Cómo ejecutar los scrapers manualmente:

Asegúrate de contar con las variables de entorno de Supabase en tu `.env.local` y ejecuta:

```bash
# Ejecutar NorteTicket (configurado por defecto en scripts)
npm run scrape

# Ejecutar otros scrapers específicos
npx tsx lib/scraper/vamos-scraper.ts
npx tsx lib/scraper/alpogo-scraper.ts
npx tsx lib/scraper/entradauno-scraper.ts
```

---

## 💻 Configuración Local

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno (`.env.local`):**
   Copia los valores de Supabase y las variables de contacto en la raíz del proyecto:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_supabase
   SUPABASE_SERVICE_ROLE_KEY=tu_clave_service_role (requerido para los scrapers y acciones de admin)

   # Publicidad y Anuncios locales
   NEXT_PUBLIC_CONTACT_WHATSAPP=5493875813233
   NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXX (dejar vacío en desarrollo)
   ```

3. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en el navegador.

---

## 💰 Monetización e Integración de Anuncios

El sitio monetiza a través de dos canales integrados en el código:
1. **Google AdSense:** Se inyecta de manera estática en el `<head>` del layout base cuando se define `NEXT_PUBLIC_ADSENSE_CLIENT_ID`.
2. **Anuncios Directos (WhatsApp):** En desarrollo o si no hay un ID de AdSense cargado, se muestra un banner con diseño premium invitando a comercios y organizadores locales a publicitar su evento mediante un enlace directo de WhatsApp.
3. **Eventos Destacados:** Los administradores pueden marcar cualquier evento como "Destacado" desde su página de detalle. Esto los posiciona automáticamente al inicio del carrusel de la página principal y les asigna una tarjeta con diseño destacado.
