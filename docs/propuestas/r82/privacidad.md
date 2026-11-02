# Propuesta de texto para la política de privacidad (R82)

**Es una propuesta para el PR. No se tocan las páginas legales en esta ronda.** No es asesoramiento legal: la revisa Mauro (y quien corresponda) antes de publicarla. Lo que está entre `[COMPLETAR: …]` es un dato que no se pudo verificar de noche (no se leyeron las páginas legales vigentes: hay que ubicar dónde encaja y alinear el tono).

## Dónde va
Sección de la política sobre la app móvil / notificaciones, [COMPLETAR: ubicar el apartado actual de notificaciones push en las páginas legales del sitio y del listado de Google Play].

## Texto propuesto

### Avisos en tu teléfono, con o sin cuenta

Si activás los avisos de la app de Qué Pinta Salta, guardamos en nuestros servidores:

- **El identificador de avisos de tu teléfono** (el «token» que entrega el servicio de notificaciones de Expo / Google / Apple). Sirve únicamente para enviarte los avisos que elegiste.
- **Un identificador aleatorio de la instalación** de la app, que generamos y guardamos en el almacenamiento seguro del teléfono. Sirve para que solo ese teléfono pueda cambiar sus propios interruptores de avisos. No es tu nombre, tu email ni un identificador publicitario.
- **Tus interruptores**: si querés los avisos del equipo de Qué Pinta Salta y si querés los avisos patrocinados (por defecto, los patrocinados están apagados).
- **El idioma de la app** y la plataforma (Android o iOS), para mostrar el aviso correctamente.
- **Cuándo fue la última vez que la app se conectó** para saber si el teléfono sigue activo.

**No hace falta tener cuenta.** Si no iniciaste sesión, esos datos no están asociados a ningún nombre ni email. Si más tarde iniciás sesión, asociamos el teléfono a tu cuenta para que tus preferencias de Cuenta y tu Radar se apliquen en ese teléfono. Si cerrás sesión, el teléfono sigue recibiendo los avisos que dejaste activados, pero deja de estar asociado a tu cuenta.

**Qué avisos recibís sin cuenta:** solo los del equipo de Qué Pinta Salta y, si los activás, los patrocinados. Los recordatorios de favoritos, las novedades de lo que seguís y el Radar requieren cuenta.

**Cuánto tiempo los guardamos:** mientras uses la app. Si un teléfono no se conecta durante [COMPLETAR: plazo; el diseño propone 180 días] lo borramos. También lo borramos si el servicio de notificaciones informa que el token dejó de ser válido (por ejemplo, al desinstalar la app). El historial de avisos enviados se conserva [COMPLETAR: plazo vigente de `purge_notification_sends`, hoy 90 días por defecto] y se borra junto con el teléfono.

**Cómo dejar de recibirlos:** apagá los interruptores en la pestaña Cuenta de la app, desactivá las notificaciones de Qué Pinta Salta en los ajustes del teléfono, o desinstalá la app. Si tenías cuenta y la eliminás, borramos también el teléfono asociado y su historial de avisos.

**Con quién los compartimos:** los avisos se entregan a través de los servicios de notificaciones de Expo, Google y Apple, que reciben el identificador del teléfono y el contenido del aviso. [COMPLETAR: confirmar la lista de encargados/terceros que ya figura en la política y la forma en que se nombran]. No vendemos estos datos.

**Los avisos patrocinados** los pagan anunciantes y siempre se identifican como «Patrocinado». El anunciante no recibe tu identificador: recibimos de él el contenido del aviso y lo enviamos nosotros. [COMPLETAR: confirmar que sigue siendo así en el producto de Avisos patrocinados].

**Base legal / contacto:** [COMPLETAR: el responsable, el contacto para ejercer derechos de acceso, rectificación y supresión (Ley 25.326, Argentina) y la forma de pedir la baja de un teléfono sin cuenta. Sin cuenta no podemos identificar «tu» teléfono por tu nombre: la baja práctica es apagar los interruptores o desinstalar; si hace falta un pedido manual, hay que definir qué prueba se pide].

## Notas para quien lo revise (no van en el texto público)

1. **Google Play, formulario de seguridad de los datos:** «Identificadores de dispositivo u otros» pasa a estar recopilado (además del id de usuario, si ya figuraba). Finalidad: funcionalidad de la app (notificaciones). No se comparte con anunciantes. [COMPLETAR: confirmar que el formulario de la prueba cerrada y el de producción se actualizan antes de publicar la versión].
2. **Política de anuncios de Play:** los patrocinados siguen apagados por defecto y solo se activan con el interruptor explícito; eso no cambia con la R82.
3. **Cifrado en tránsito:** todo viaja por HTTPS. **En reposo:** [COMPLETAR: lo que ofrezca Supabase; no afirmarlo en el texto sin confirmarlo].
4. **iOS:** si hay versión de iOS, el nombre de los «tipos de datos» en la ficha de privacidad de App Store es «Identificador de dispositivo». [COMPLETAR: solo si se publica en iOS].
5. El texto dice «no es un identificador publicitario» a propósito: el `device_id` es un uuid propio, no el de publicidad de Google ni de Apple.
