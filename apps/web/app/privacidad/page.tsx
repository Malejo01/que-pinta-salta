import type { Metadata } from "next"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"
import { whatsappUrl } from "@/lib/contacto"
import { ADS_ENABLED } from "@/lib/config/monetization"
import { PaginaLegal, SeccionLegal, Marca, claseLink } from "@/components/legal/pagina-legal"

export const metadata: Metadata = {
  title: "Política de Privacidad | Qué Pinta Salta",
  description:
    "Qué datos personales trata Qué Pinta Salta —el sitio quepintasalta.com.ar y la app Qué Pinta Salta para Android— para qué los usa, con quién los comparte y cómo ejercer tus derechos.",
  alternates: { canonical: "/privacidad" },
}

const contactoWhatsappUrl = whatsappUrl("Hola! Tengo una consulta sobre mis datos en Que Pinta Salta.")

export default function PrivacidadPage() {
  return (
    <PaginaLegal titulo="Política de Privacidad" icono={ShieldCheck}>
      <SeccionLegal titulo="Quiénes somos y a qué se aplica" id="quienes-somos">
        <p>
          Qué Pinta Salta es el sitio quepintasalta.com.ar y la app &quot;Qué Pinta Salta&quot; para Android. Esta
          política explica qué datos personales tratamos cuando los usás, conforme a la Ley 25.326 de Protección de
          los Datos Personales de la República Argentina.
        </p>
        <p>
          <strong className="text-foreground">Responsable del tratamiento:</strong>{" "}
          <Marca>[COMPLETAR: nombre o razón social del responsable, CUIT y domicilio]</Marca>.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Qué datos tratamos">
        <ul className="list-disc space-y-3 pl-5">
          <li>
            <strong className="text-foreground">Sin cuenta:</strong> podés usar la agenda, la búsqueda y las fichas
            de evento sin crear una cuenta, tanto en el sitio como en la app.
          </li>
          <li>
            <strong className="text-foreground">Tu cuenta:</strong> tu email, con contraseña o con Google; si entrás
            con Google, también el nombre y la foto de perfil que Google comparte. La contraseña la gestiona nuestro
            proveedor de autenticación (Supabase) y nosotros no la vemos.
          </li>
          <li>
            <strong className="text-foreground">Lo que hacés con tu cuenta:</strong> tus favoritos; tus marcas de
            &quot;Voy&quot; y &quot;Me interesa&quot; en cada evento (el total de cada uno se muestra recién desde 3
            personas, y nunca se muestra quién marcó cada tipo); las categorías, los lugares y las cuentas de
            Instagram que seguís; las preferencias de Mi Radar (incluido el email al que llegan los avisos) y las de
            notificaciones (el horario de silencio y el tope de avisos por día); y los eventos que cargás.
          </li>
          <li>
            <strong className="text-foreground">Notificaciones en la app:</strong> solo si las activás: el permiso
            del teléfono se pide recién cuando tocás &quot;Activar notificaciones&quot;. Guardamos el token de
            notificaciones de tu teléfono, la plataforma y la última vez que se usó, y un registro de los avisos que
            te mandamos, para no repetirte uno y para respetar el tope diario. Al cerrar sesión intentamos borrar el
            token de ese teléfono. Si en ese momento no hay conexión, puede quedar guardado un tiempo más; se borra
            en cuanto eliminás tu cuenta.
          </li>
          <li>
            <strong className="text-foreground">Lo que la app guarda en tu teléfono:</strong> la sesión, en el
            almacenamiento seguro del teléfono; y, para verla sin conexión, una copia de la última agenda y de tu
            lista de favoritos, sin tu email, tu contraseña ni ningún token. Esa copia deja de usarse a las 48 horas
            (la agenda) o a los 7 días (los favoritos), y se borra al cerrar sesión, al cambiar de cuenta y al
            eliminar la cuenta.
          </li>
          <li>
            <strong className="text-foreground">Calendario:</strong> solo cuando tocás &quot;Agregar al
            calendario&quot;: la app te pide permiso al calendario de tu teléfono. Con ese permiso mira qué
            calendarios tenés para saber en cuál puede escribir y guarda ahí el evento. No leemos los eventos de tu
            calendario ni los mandamos a ningún lado: todo queda en el teléfono.
          </li>
          <li>
            <strong className="text-foreground">Fallas de la app:</strong> si la app se cierra o falla, mandamos un
            reporte técnico a Sentry con el detalle del error. Antes de enviarlo, la app le saca tu email y los
            tokens de sesión que pudieran aparecer.
          </li>
          <li>
            <strong className="text-foreground">Métricas propias:</strong> cuántas veces se vio cada ficha y cuántos
            clics recibió el botón &quot;Comprar&quot;, sumados por evento y por día, sin usuario. Lo mismo para las
            vistas desde la app.
          </li>
          <li>
            <strong className="text-foreground">Navegación en el sitio:</strong> lo de siempre: Vercel Analytics y,
            solo con tu consentimiento, Google Analytics (ver &quot;Cookies y almacenamiento local&quot;).
          </li>
          <li>
            <strong className="text-foreground">Lo que no tratamos:</strong> tu ubicación (&quot;Cómo llegar&quot;
            abre el mapa de tu teléfono con la dirección del lugar), tus contactos, las fotos de tu teléfono ni un
            historial de búsquedas por usuario. La app no tiene analítica de terceros ni anuncios.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">Darnos estos datos es opcional.</strong> Podés usar la agenda, buscar
          y ver las fichas de evento sin crear una cuenta, tanto en el sitio como en la app. Si no creás una cuenta,
          no vas a poder guardar favoritos, marcar &quot;Voy&quot; o &quot;Me interesa&quot;, seguir categorías,
          lugares ni cuentas, ni usar Mi Radar o las notificaciones de la app. Nada más cambia.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Para qué los usamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Mantener tu sesión, tus favoritos y los eventos que publicás.</li>
          <li>Mandarte los avisos que activaste en la app, respetando el horario de silencio y el tope por día.</li>
          <li>Mostrarte la agenda sin conexión cuando no tenés señal.</li>
          <li>Arreglar fallas de la app.</li>
          <li>Enviarte por email las novedades de Mi Radar, solo si lo activás.</li>
          <li>Moderar los eventos cargados por usuarios antes de publicarlos.</li>
          <li>Entender qué secciones se usan, para mejorar el sitio y la app.</li>
          {ADS_ENABLED ? (
            <li>
              Mostrar publicidad en el sitio, que es lo que sostiene el servicio gratuito (ver &quot;Cookies y
              almacenamiento local&quot;).
            </li>
          ) : (
            <li>
              Si en el futuro mostramos publicidad en el sitio, va a ser para sostener el servicio gratuito (ver
              &quot;Cookies y almacenamiento local&quot;).
            </li>
          )}
        </ul>
        <p>No vendemos tus datos personales.</p>
      </SeccionLegal>

      <SeccionLegal titulo="Cookies y almacenamiento local">
        <p>
          En el sitio usamos cookies propias para mantener tu sesión y el almacenamiento local del navegador para
          recordar tu tema claro u oscuro. Ninguna de las dos necesita tu consentimiento.
        </p>
        <p>
          Para saber qué secciones del sitio se usan, usamos Google Analytics, que se carga a través de Google Tag
          Manager. Esa carga, y la cookie <code>_ga</code> que trae,{" "}
          <strong className="text-foreground">solo ocurre si lo aceptás</strong> en el aviso que aparece la primera
          vez que entrás al sitio. Si rechazás, o todavía no elegís, Google Analytics no se carga y esa cookie no se
          pone. Podés cambiar tu elección cuando quieras con el botón &quot;Cookies&quot; del pie de página, que
          vuelve a mostrar el aviso.
        </p>
        <p>
          La analítica propia de Vercel (páginas vistas, rendimiento del sitio) no usa cookies ni necesita tu
          consentimiento.
        </p>
        {ADS_ENABLED ? (
          <p>
            Mostramos publicidad de Google AdSense, que usa cookies de terceros para mostrarte anuncios según tu
            navegación en este y otros sitios. Podés desactivar la publicidad personalizada en la{" "}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className={claseLink}
            >
              Configuración de anuncios de Google
            </a>{" "}
            o, para otros proveedores, en{" "}
            <a href="https://www.aboutads.info/choices" target="_blank" rel="noopener noreferrer" className={claseLink}>
              aboutads.info
            </a>
            . Más información sobre{" "}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
              className={claseLink}
            >
              cómo usa Google los datos de los sitios que usan sus servicios
            </a>
            .
          </p>
        ) : (
          <p>
            Hoy no mostramos publicidad en el sitio. Si en el futuro mostramos anuncios, vamos a actualizar esta
            sección antes de activarlos para explicar qué cookies agregan y cómo desactivarlas.
          </p>
        )}
        <p>
          También podés bloquear o borrar cookies desde la configuración de tu navegador; si bloqueás las propias,
          no vas a poder iniciar sesión en el sitio.
        </p>
        <p>
          La app no usa cookies: la sesión se guarda en el almacenamiento seguro del teléfono (ver &quot;Qué datos
          tratamos&quot;).
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Con quién los compartimos">
        <p>Solo con los proveedores que hacen funcionar el sitio y la app, y únicamente para esa función:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Supabase:</strong> base de datos y autenticación.
          </li>
          <li>
            <strong className="text-foreground">Vercel:</strong> alojamiento del sitio y analítica anónima.
          </li>
          <li>
            <strong className="text-foreground">Google:</strong> inicio de sesión con Google y, solo si lo aceptás,
            Google Analytics a través de Google Tag Manager
            {ADS_ENABLED ? " y AdSense, para mostrar publicidad." : "."}
          </li>
          <li>
            <strong className="text-foreground">Resend:</strong> envío de los emails de Mi Radar.
          </li>
          <li>
            <strong className="text-foreground">Expo:</strong> el servicio que entrega las notificaciones de la app
            a tu teléfono.
          </li>
          <li>
            <strong className="text-foreground">Google (Firebase Cloud Messaging):</strong> lleva esas
            notificaciones a los teléfonos Android.
          </li>
          <li>
            <strong className="text-foreground">Sentry:</strong> recibe los reportes de fallas de la app.
          </li>
        </ul>
        <p>
          Algunos de estos proveedores procesan los datos fuera de Argentina. También podemos revelar datos si una autoridad
          competente lo exige legalmente.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Contenido público">
        <p>
          La información de eventos (títulos, flyers, lugares, horarios y precios) viene de ticketeras, de cuentas
          públicas de Instagram de locales y productores, y de lo que cargan los usuarios. Los afiches y
          los nombres son de sus dueños: los mostramos para informar sobre el evento. Si sos titular de un contenido publicado y
          querés corregirlo o que lo quitemos, escribinos.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Cuánto tiempo los guardamos">
        <p>
          Los datos de tu cuenta se conservan mientras la cuenta exista. La copia que la app guarda en tu teléfono
          dura hasta que vence o hasta que se borra, como contamos arriba. El registro de los avisos enviados se
          borra junto con tu cuenta cuando la eliminás.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Eliminar tu cuenta" id="eliminar-cuenta">
        <p>
          En la app: Cuenta → &quot;Eliminar mi cuenta&quot;. En el sitio, con tu cuenta iniciada:{" "}
          <Link href="/perfil/eliminar-cuenta" className={claseLink}>
            Mi perfil → Eliminar mi cuenta
          </Link>
          . Sin sesión iniciada:{" "}
          <Link href="/eliminar-cuenta" className={claseLink}>
            esta página
          </Link>
          , que explica qué se borra y qué no.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Tus derechos">
        <p>
          Podés pedir acceso, rectificación, actualización o supresión de tus datos personales. El acceso es
          gratuito en intervalos no menores a seis meses, salvo que acredites un interés legítimo (art. 14, inc. 3,
          Ley 25.326). Para ejercer estos derechos, escribinos al contacto de más abajo.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene
          la atribución de atender las denuncias y los reclamos de quienes resulten afectados en sus derechos por
          incumplimiento de las normas vigentes en materia de protección de datos personales.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Menores de edad">
        <p>
          La edad mínima para crear una cuenta: <Marca>[COMPLETAR: edad mínima para crear una cuenta]</Marca>.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Seguridad">
        <p>
          Toda la información viaja cifrada (HTTPS) y cada cuenta solo puede leer lo suyo. Ningún sistema es
          perfecto: trabajamos para protegerla, pero no podemos garantizar una seguridad absoluta.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Contacto">
        <p>
          Para ejercer tus derechos o hacer cualquier consulta sobre esta política, escribinos a{" "}
          <a href={mailtoContacto("Consulta sobre mis datos")} className={claseLink}>
            {CONTACTO_EMAIL}
          </a>{" "}
          o por{" "}
          <a href={contactoWhatsappUrl} target="_blank" rel="noopener noreferrer" className={claseLink}>
            WhatsApp
          </a>
          .
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="Cambios a esta política">
        <p>
          Si cambiamos esta política, vamos a actualizar la versión y la fecha de arriba. Si el cambio es importante, lo vamos a
          avisar en el sitio y en la app.
        </p>
      </SeccionLegal>
    </PaginaLegal>
  )
}
