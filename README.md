# Qué Pinta Salta 🎸🍻

> **Agenda inteligente y automatizada de eventos, cines, peñas, boliches y actividades culturales en Salta Capital.**

Qué Pinta Salta es una plataforma moderna diseñada para unificar la cartelera de entretenimiento local. El sistema automatiza la recolección (scraping) de eventos de múltiples ticketeras, clasifica y normaliza la información para eliminar duplicados, y ofrece una experiencia de usuario rápida, premium y altamente personalizada.

---

## 🚀 Características Principales

### 1. 🔍 Descubrimiento Dinámico de Eventos
- **Filtros Avanzados:** Búsqueda rápida por categorías, locaciones, fechas y palabras clave con transiciones animadas fluidas.
- **Detalle Completo:** Fichas individuales con descripciones enriquecidas, geolocalización (Google Maps) y enlaces directos de compra de entradas.
- **Eventos Destacados:** Carrusel interactivo y tarjetas con diseño de alta fidelidad para promocionar eventos especiales.

### 2. 📡 Sistema Radar (Alertas de Eventos)
- **Boletín Personalizado:** Permite a los usuarios configurar un "Radar" para recibir alertas por correo electrónico sobre sus categorías, lugares (venues) y organizadores de Instagram preferidos.
- **Frecuencia Programable:** Opciones de envío diario o semanal gestionado automáticamente mediante tareas programadas (Cron).

### 3. 🍿 Cartelera de Cine Automatizada
- **Scraping de Cines:** Extracción automática y periódica de las carteleras y funciones de cines locales como **Cinemark Alto Noa** y **Cine Ópera**.

### 4. 🔑 Autenticación Premium y Perfil
- **Acceso Dual:** Registro e inicio de sesión tradicional por correo electrónico/contraseña o acceso instantáneo con **Google OAuth**.
- **Gestión de Favoritos:** Guardado dinámico de eventos en una sección dedicada para consulta rápida de los usuarios autenticados.

### 5. 🛡️ Panel Administrativo Completo
- **Scraper Manager:** Interfaz para ejecutar scrapers manualmente en tiempo real y visualizar los logs de importación.
- **Gestor de Alias:** Mapeo inteligente para unificar variaciones en nombres de lugares u organizadores que provienen de distintas fuentes.
- **Clasificador:** Herramienta visual para clasificar eventos nuevos no categorizados automáticamente.
- **Control de Usuarios:** Listado y gestión de permisos y roles del sistema.

---

## 🛠️ Stack Tecnológico

- **Frontend:** [Next.js](https://nextjs.org/) (App Router, React 19)
- **Estilos y Animaciones:** [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/) y [Framer Motion](https://www.framer.com/motion/)
- **Base de Datos y Seguridad:** [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security para roles ADMIN/USER)
- **Automatización & Web Scraping:** Cheerio, Puppeteer, y Webhooks integrados con [Apify](https://apify.com/) (para extracción de Instagram)
- **Hosting:** [Vercel](https://vercel.com/)

---

## 📂 Estructura del Proyecto

```text
├──app/                       # Rutas y páginas de Next.js
│   ├── @modal/               # Interceptores de ruta para visualización en modales
│   ├── admin/                # Panel de administración (Scrapers, Alias, Usuarios, Categorías)
│   ├── api/                  # Endpoints API
│   │   ├── cron/             # Automatizaciones de scraping, newsletter radar y keep-alive
│   │   └── webhooks/apify/   # Webhook para procesar eventos recolectados desde Instagram
│   ├── auth/                 # Páginas de Login, Sign-Up, Callback y Confirmación
│   ├── favoritos/            # Sección de favoritos del usuario
│   ├── radar/                # Configuración de boletines personalizados
│   └── perfil/               # Ajustes de cuenta de usuario
├── components/               # Componentes UI reutilizables
│   ├── ui/                   # Componentes base (Shadcn/Radix)
│   ├── auth-modal.tsx        # Modal de inicio de sesión / registro rápido
│   └── radar-form.tsx        # Formulario interactivo del Radar
├── hooks/                    # React Hooks personalizados (toasts, theme)
├── lib/                      # Lógica de negocio y utilidades
│   ├── actions/              # Server Actions de Next.js (radar, favoritos, etc.)
│   ├── scraper/              # Código fuente de los scrapers (Alpogo, NorteTicket, EntradaUno, Vamos Salta)
│   └── supabase/             # Clientes de base de datos para cliente y servidor
└── supabase/                 # Migraciones SQL y esquemas de base de datos
```

---

## 💻 Configuración para Desarrollo Local

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone <url-del-repositorio>
cd que-pinta-salta
npm install
```

### 2. Configurar Variables de Entorno (`.env.local`)
Crea un archivo `.env.local` en la raíz del proyecto y completa los siguientes parámetros:

```env
# Conexión con Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto-supabase.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-de-supabase
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-de-supabase (necesaria para scrapers y admin actions)

# Publicidad y Anuncios locales
NEXT_PUBLIC_CONTACT_WHATSAPP=5493875813233
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX (opcional en desarrollo)

# Opcional: URL de callback local para pruebas de desarrollo
# NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/auth/callback
```

### 3. Base de Datos (Supabase)
Ejecuta las migraciones contenidas en `supabase/migrations/` en tu base de datos de Supabase para generar las tablas de favoritos, la configuración del radar, suscripciones de Instagram y las políticas de seguridad RLS.

### 4. Proveedor de Google OAuth (Opcional)
Para habilitar el inicio de sesión con Google:
1. Ve al panel de Supabase: **Authentication > Providers > Google**.
2. Activa el proveedor e introduce tu **Client ID** y **Client Secret** generados desde la consola de desarrolladores de Google Cloud.
3. Asegúrate de añadir `http://localhost:3000/auth/callback` a los **Redirect URLs** permitidos en la configuración de Supabase.

### 5. Iniciar el Servidor de Desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

---

## 🕸️ Automatización y Web Scraping

El sistema utiliza scrapers automáticos integrados en `lib/scraper/` para mantener la cartelera actualizada:

- **Vamos Salta (Municipalidad):** `vamos-scraper.ts`
- **Alpogo:** `alpogo-scraper.ts`
- **NorteTicket:** `norteticket-scraper.ts`
- **EntradaUno:** `entradauno-scraper.ts`

### Ejecución de Scrapers Manuales:
```bash
# NorteTicket
npm run scrape

# Otros Proveedores
npx tsx lib/scraper/vamos-scraper.ts
npx tsx lib/scraper/alpogo-scraper.ts
npx tsx lib/scraper/entradauno-scraper.ts
```

### Flujo de Instagram (Apify):
El scraper de Instagram corre en la nube utilizando **Apify**. Al finalizar, realiza un POST al webhook `/api/webhooks/apify` con los nuevos datos, los cuales son procesados y guardados de inmediato.

---

## 💰 Monetización e Integraciones

1. **Google AdSense:** Inserción dinámica cuando la variable `NEXT_PUBLIC_ADSENSE_CLIENT_ID` está presente.
2. **Anuncios Locales Directos:** Banner alternativo y premium con enlace directo a WhatsApp para que los comercios locales contraten publicidad directamente con el administrador.
3. **Eventos Destacados:** Capacidad de marcar eventos clave para colocarlos en el carrusel de inicio y otorgarles un diseño visual enriquecido.
