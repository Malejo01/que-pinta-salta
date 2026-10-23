import type { Metadata } from "next"
import Link from "next/link"
import { FileText } from "lucide-react"
import { PaginaLegal, SeccionLegal, Marca, claseLink } from "@/components/legal/pagina-legal"
import { UMBRAL_CONTADOR_ASISTENCIA } from "@qps/core/asistencia"
import { ADS_ENABLED } from "@/lib/config/monetization"
import { whatsappUrl } from "@/lib/contacto"
import { CONTACTO_EMAIL, mailtoContacto } from "@qps/core/contacto"

export const metadata: Metadata = {
  title: "Términos y condiciones | Qué Pinta Salta",
  description:
    "Los términos de uso de Qué Pinta Salta: qué podés hacer en el sitio y en la app, y qué no.",
  alternates: { canonical: "/terminos" },
}

const whatsappConsultaUrl = whatsappUrl("Hola! Tengo una consulta sobre los términos y condiciones de Que Pinta Salta.")

export default function TerminosPage() {
  return (
    <PaginaLegal titulo="Términos y condiciones" icono={FileText}>
      <SeccionLegal titulo="1. Qué es Qué Pinta Salta" id="que-es">
        <p>
          Qué Pinta Salta es una agenda gratuita de eventos de Salta Capital: peñas, boliches, teatro, cine y
          recitales, en el sitio y en la app para Android. Al usarla, aceptás estos términos.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="2. Quién lo ofrece" id="quien-lo-ofrece">
        <p>
          Qué Pinta Salta lo ofrece <Marca>[COMPLETAR: nombre o razón social, CUIT y domicilio]</Marca>.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="3. De dónde sale la información y qué no hacemos" id="de-donde-sale-la-informacion">
        <p>
          Los eventos salen de ticketeras, de cuentas públicas de Instagram de locales y productores (leemos los
          afiches de forma automática) y de lo que carga la comunidad. Puede haber errores o cambios de último
          momento: confirmá siempre con el organizador o la ticketera antes de ir.
        </p>
        <p>
          No vendemos entradas ni organizamos los eventos. El botón &quot;Comprar&quot; te lleva a la ticketera, y
          la compra queda entre vos y ella, con sus condiciones. Los precios son orientativos.
        </p>
        <p>
          No controlamos la información que viene de terceros, y en la medida que lo permita la ley no nos hacemos
          responsables por sus errores.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="4. Tu cuenta" id="tu-cuenta">
        <p>
          Tener cuenta es opcional: podés usar la agenda sin crear una. Para guardar eventos, marcar &quot;Voy&quot;, seguir categorías,
          lugares y cuentas, o usar Mi Radar y las notificaciones, te registrás con tu email y una contraseña, o
          con tu cuenta de Google. Cuidá tu contraseña y no la compartas.
        </p>
        <p>
          Edad mínima para crear una cuenta: <Marca>[COMPLETAR: edad mínima]</Marca>.
        </p>
        <p>
          Podés eliminar tu cuenta cuando quieras: con sesión iniciada, desde{" "}
          <Link href="/perfil/eliminar-cuenta" className={claseLink}>
            Mi perfil → Eliminar mi cuenta
          </Link>
          ; sin sesión iniciada, desde{" "}
          <Link href="/eliminar-cuenta" className={claseLink}>
            esta página
          </Link>
          .
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="5. Lo que podés hacer con tu cuenta" id="lo-que-podes-hacer">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Guardar eventos (&quot;Guardar&quot;, tus favoritos) y seguir (&quot;Seguir&quot;) categorías, lugares y
            cuentas de Instagram.
          </li>
          <li>
            Marcar &quot;Voy&quot; en un evento: el total se muestra recién {`desde ${UMBRAL_CONTADOR_ASISTENCIA} personas`},
            y nunca se muestra quién lo marcó.
          </li>
          <li>
            Mi Radar: un email con las novedades de lo que seguís. Te das de baja con un clic, desde el mismo email
            o desde la página del Radar.
          </li>
          <li>
            Notificaciones en la app: las activás y las apagás cuando querés. Respetan un horario de silencio —por
            defecto, de 23:00 a 09:00, y lo podés cambiar desde la app— y un tope de avisos por día, que hoy es de 4
            y no se edita.
          </li>
          <li>
            Avisos patrocinados: las notificaciones de la app pueden incluir avisos patrocinados, con la etiqueta
            &quot;Patrocinado&quot;, como mucho uno por semana. Vienen activados y los apagás en un toque desde
            Cuenta, con su propio interruptor, sin apagar los demás avisos.
          </li>
        </ul>
      </SeccionLegal>

      <SeccionLegal titulo="6. Los eventos que cargás" id="los-eventos-que-cargas">
        <ul className="list-disc space-y-2 pl-5">
          <li>Antes de publicarse, los revisamos: los podemos editar, rechazar o quitar.</li>
          <li>Al cargarlos, confirmás que la información es cierta y que podés publicar el afiche y los textos.</li>
          <li>
            Nos autorizás a mostrarlos en el sitio y en la app, y a que se compartan, para informar sobre el evento.
          </li>
          <li>
            Si eliminás tu cuenta, siguen publicados sin tu nombre, tal como explica la página de{" "}
            <Link href="/eliminar-cuenta" className={claseLink}>
              eliminar cuenta
            </Link>
            .
          </li>
        </ul>
      </SeccionLegal>

      <SeccionLegal titulo="7. Lo que no se puede hacer" id="lo-que-no-se-puede-hacer">
        <p>
          No está permitido: cargar información falsa, ilegal u ofensiva, o contenido de otras personas sin
          permiso; hacerte pasar por otra persona; intentar entrar a cuentas ajenas o al panel de administración; o
          usar el servicio de forma automatizada para copiarlo en bloque o sobrecargarlo.
        </p>
        <p>
          Podemos suspender o eliminar una cuenta que no cumpla con esto.
        </p>
      </SeccionLegal>

      <SeccionLegal
        titulo="8. Contenido de terceros y propiedad intelectual"
        id="contenido-de-terceros-y-propiedad-intelectual"
      >
        <p>
          Los afiches, los nombres y las marcas de los eventos, los lugares y las ticketeras son de sus dueños: los
          mostramos para informar sobre el evento, no los tenemos como propios. Si
          sos titular de alguno de esos contenidos y querés que corrijamos algo o que lo quitemos, escribinos (más
          abajo está el contacto).
        </p>
        <p>
          El nombre y el diseño de Qué Pinta Salta son de quien ofrece el servicio; no podés usarlos como propios.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="9. Publicidad" id="publicidad">
        {ADS_ENABLED ? (
          <p>El sitio puede mostrar anuncios de Google AdSense, identificados como tales.</p>
        ) : (
          <p>Hoy no mostramos publicidad.</p>
        )}
        <p>
          La app puede mostrar anuncios de Google, identificados como tales con el rótulo &quot;Publicidad&quot;. Cómo
          se tratan los datos con los anuncios está en la{" "}
          <Link href="/privacidad" className={claseLink}>
            Política de Privacidad
          </Link>
          .
        </p>
        <p>
          <strong className="text-foreground">Contenido destacado o patrocinado.</strong> Un evento puede aparecer
          destacado, por ejemplo porque su organizador contrató un paquete: todo evento destacado lleva el sello
          &quot;★ Destacado&quot;, en el sitio y en la app. Los avisos patrocinados de las notificaciones llevan la
          etiqueta &quot;Patrocinado&quot; (ver el punto 5).
        </p>
        <p>
          El cobro de los destacados es manual: no se paga dentro del sitio ni de la app, sino que se coordina con
          nosotros y se abona por transferencia o Mercado Pago. El tarifario con los precios está en{" "}
          <Link href="/anunciantes" className={claseLink}>
            la página para anunciantes
          </Link>
          .
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="10. Disponibilidad y cambios del servicio" id="disponibilidad-y-cambios">
        <p>
          Qué Pinta Salta es gratis y puede cambiar, interrumpirse o dejar de existir. No garantizamos que esté
          siempre disponible ni libre de errores.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="11. Responsabilidad" id="responsabilidad">
        <p>
          Dentro de lo que permite la ley, incluida la Ley 24.240 de Defensa del Consumidor, no respondemos por los daños que puedan surgir de usar la agenda,
          incluyendo errores en la información de un evento o problemas con una ticketera.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="12. Privacidad" id="privacidad">
        <p>
          Cómo tratamos tus datos está en la{" "}
          <Link href="/privacidad" className={claseLink}>
            Política de Privacidad
          </Link>
          .
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="13. Cambios a estos términos" id="cambios-a-estos-terminos">
        <p>
          Si cambiamos estos términos, actualizamos la versión y la fecha de arriba. Si el cambio es importante, avisamos en el
          sitio y en la app.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="14. Ley aplicable y jurisdicción" id="ley-y-jurisdiccion">
        <p>
          Estos términos se rigen por las leyes de la República Argentina.
        </p>
      </SeccionLegal>

      <SeccionLegal titulo="15. Contacto" id="contacto">
        <p>
          Para cualquier consulta sobre estos términos, escribinos a{" "}
          <a href={mailtoContacto("Consulta sobre los términos")} className={claseLink}>
            {CONTACTO_EMAIL}
          </a>{" "}
          o por{" "}
          <a href={whatsappConsultaUrl} target="_blank" rel="noopener noreferrer" className={claseLink}>
            WhatsApp
          </a>
          .
        </p>
      </SeccionLegal>
    </PaginaLegal>
  )
}
