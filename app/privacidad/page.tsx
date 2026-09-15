import type { Metadata } from "next"
import { ShieldCheck } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { MobileNav } from "@/components/mobile-nav"

export const metadata: Metadata = {
  title: "Política de Privacidad | Qué Pinta Salta",
  description: "Qué datos recopila Qué Pinta Salta, para qué los usa, con quién los comparte y cómo ejercer tus derechos.",
  alternates: { canonical: "/privacidad" },
}

const LAST_UPDATED = "15 de septiembre de 2026"

const whatsappNumber = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || "5493875813233"
const whatsappUrl = `https://wa.me/${whatsappNumber}?text=Hola!%20Tengo%20una%20consulta%20sobre%20mis%20datos%20en%20Que%20Pinta%20Salta.`

const linkClass = "text-primary underline underline-offset-4 hover:text-primary/80"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Navbar />

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <div className="mb-10 flex flex-col items-center space-y-3 text-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10">
          <Section title="Quiénes somos">
            <p>
              Qué Pinta Salta (quepintasalta.com.ar) es una agenda de eventos culturales, peñas, boliches, teatro y
              cine de Salta Capital. Esta política explica qué datos personales tratamos cuando usás el sitio, conforme
              a la Ley 25.326 de Protección de los Datos Personales de la República Argentina.
            </p>
          </Section>

          <Section title="Qué datos recopilamos">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Cuenta:</strong> si te registrás, tu email y, si entrás con Google,
                el nombre y la foto de perfil que Google comparte. La contraseña nunca la vemos: la gestiona nuestro
                proveedor de autenticación.
              </li>
              <li>
                <strong className="text-foreground">Actividad en tu cuenta:</strong> los eventos que guardás como
                favoritos, los eventos que cargás y las preferencias de &quot;Mi Radar&quot; (categorías, lugares y
                cuentas que seguís).
              </li>
              <li>
                <strong className="text-foreground">Navegación:</strong> datos técnicos y de uso (páginas visitadas,
                dispositivo, navegador, ubicación aproximada por IP) recogidos por la analítica de Vercel y por
                Google AdSense, descritos abajo.
              </li>
            </ul>
            <p>Navegar la agenda no requiere cuenta.</p>
          </Section>

          <Section title="Para qué los usamos">
            <ul className="list-disc space-y-2 pl-5">
              <li>Mantener tu sesión, tus favoritos y los eventos que publicás.</li>
              <li>Enviarte por email las novedades de &quot;Mi Radar&quot;, solo si lo activás. Podés desactivarlo cuando quieras desde esa misma página.</li>
              <li>Moderar los eventos cargados por usuarios antes de publicarlos.</li>
              <li>Entender qué secciones se usan para mejorar el sitio.</li>
              <li>Mostrar publicidad, que es lo que sostiene el sitio gratuito.</li>
            </ul>
            <p>No vendemos tus datos personales.</p>
          </Section>

          <Section title="Cookies y publicidad">
            <p>
              Usamos cookies propias para mantener tu sesión, el almacenamiento local del navegador para recordar tu
              tema claro u oscuro, y cookies de terceros de Google AdSense para publicidad. La analítica de Vercel no
              usa cookies.
            </p>
            <p>
              Los proveedores externos, incluido Google, usan cookies para mostrar anuncios basados en tus visitas
              anteriores a este y otros sitios. Las cookies de publicidad permiten a Google y a sus socios mostrarte
              anuncios según tu navegación. Podés desactivar la publicidad personalizada en la{" "}
              <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                Configuración de anuncios de Google
              </a>{" "}
              o, para otros proveedores, en{" "}
              <a href="https://www.aboutads.info/choices" target="_blank" rel="noopener noreferrer" className={linkClass}>
                aboutads.info
              </a>
              . Más información sobre{" "}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                cómo usa Google los datos de los sitios que usan sus servicios
              </a>
              .
            </p>
            <p>También podés bloquear o borrar cookies desde la configuración de tu navegador; si bloqueás las propias, no vas a poder iniciar sesión.</p>
          </Section>

          <Section title="Con quién los compartimos">
            <p>Solo con los proveedores que hacen funcionar el sitio, y únicamente para esa función:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong className="text-foreground">Supabase:</strong> base de datos y autenticación.</li>
              <li><strong className="text-foreground">Vercel:</strong> alojamiento del sitio y analítica anónima.</li>
              <li><strong className="text-foreground">Google:</strong> inicio de sesión con Google y AdSense.</li>
              <li><strong className="text-foreground">Resend:</strong> envío de los emails de &quot;Mi Radar&quot;.</li>
            </ul>
            <p>
              Algunos de estos proveedores procesan datos fuera de Argentina. También podemos revelar datos si una
              autoridad competente lo exige legalmente.
            </p>
          </Section>

          <Section title="Contenido público">
            <p>
              La información de eventos (títulos, flyers, lugares, horarios y precios) proviene de ticketeras, cuentas
              públicas de Instagram de locales y productores, y de lo que cargan los usuarios. Si sos titular de un
              contenido publicado y querés corregirlo o que lo quitemos, escribinos.
            </p>
          </Section>

          <Section title="Cuánto tiempo los guardamos">
            <p>
              Los datos de tu cuenta se conservan mientras la cuenta exista. Si pedís eliminarla, borramos tus datos
              personales, salvo lo que debamos conservar por obligación legal.
            </p>
          </Section>

          <Section title="Tus derechos">
            <p>
              Podés pedir acceso, rectificación, actualización o supresión de tus datos personales. El acceso es
              gratuito en intervalos no menores a seis meses, salvo interés legítimo (art. 14, inc. 3, Ley 25.326).
            </p>
            <p>
              La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326,
              tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus
              derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
            </p>
          </Section>

          <Section title="Contacto">
            <p>
              Para ejercer tus derechos o hacer cualquier consulta sobre esta política, escribinos por{" "}
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                WhatsApp
              </a>
              .
            </p>
          </Section>

          <Section title="Cambios a esta política">
            <p>
              Si cambiamos esta política, vamos a actualizar la fecha de arriba. Si el cambio es importante, lo
              avisaremos en el sitio.
            </p>
          </Section>
        </div>
      </main>

      <MobileNav />
    </div>
  )
}
