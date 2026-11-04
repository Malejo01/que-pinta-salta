# Build 9: novedades y guía para testers

> Sale de la tanda Q6 (`ronda/integracion-q6`). Se ajusta en el cierre de la tanda según lo que entre de verdad en el build. Lo que ya se probó en el build 8 (`docs/qa/build-8.md`) no se repite acá, salvo un par de controles rápidos por si algo se rompió.

## Qué hay de nuevo desde el build 8

- **La app entera en inglés.** En el build 8 solo algunas pantallas cambiaban de idioma. Ahora cambian todas: Inicio, Buscar, Mis eventos, Radar y Cuenta, y también la ficha del evento (Guardar, Voy, Agregar al calendario, Seguir), Notificaciones, Contraseña, Eliminar mi cuenta, los avisos sin conexión y la pantalla de «algo salió mal».
- **Fechas y avisos en el idioma que elijas.** En inglés las fechas se ven como «Sat 7 Nov». El recordatorio de lo que guardaste («Tomorrow: …») y «Este finde pinta» («What’s on this weekend») llegan en inglés, y si cambiás el idioma se vuelven a programar en el idioma nuevo.
- **Letra grande.** Con la letra del teléfono al máximo, los botones crecen o pasan a dos renglones en vez de cortarse (por ejemplo «Compartir agenda por WhatsApp», las filas de Cuenta y los botones de la ficha).
- **«Este finde pinta» no se duplica aunque la app esté cerrada.** Si un jueves te llega un «Aviso del equipo» con la app cerrada y lo descartás sin tocarlo, alcanza con abrir la app en algún momento antes de las 18 para que no te llegue también «Este finde pinta».
- **En la web** (no es la app, pero si te pinta mirarla): el alta, el perfil y la carga de eventos ya están en inglés (`/en/auth/sign-up`, `/en/perfil`, `/en/nuevo-evento`), y el sitio carga menos cosas al abrirse.

## Antes de empezar

- [ ] Actualizá la app desde Google Play (o desde el link de la prueba). No hace falta desinstalarla.
- [ ] Anotá el **modelo de tu teléfono**, la **versión de Android** y el **tamaño de letra** que usás. Nos sirve mucho cuando algo se ve mal.
- [ ] Tené a mano tu cuenta de Qué Pinta Salta (o entrá sin cuenta: casi todo se puede probar igual).
- [ ] **No borres tu cuenta de verdad** en el paso 3: alcanza con mirar la pantalla. Si tenés una cuenta de prueba, ahí sí podés ir hasta el final.

## Qué probar

Cada paso dice qué hacer y **qué tenés que ver**. Si algo no coincide, anotá el número del paso, qué viste y sacá una captura.

### 1. La app en inglés (lo más importante)

- [ ] **1.1** Andá a **Cuenta → Idioma** y elegí **English**. **Ver:** la pantalla cambia al toque, sin cerrar la app.
- [ ] **1.2** Recorré las cinco pestañas de abajo: **Home**, **Search**, **My events**, **Radar** y **Account**. **Ver:** títulos, botones, mensajes y vacíos («todavía no guardaste nada») en inglés. Los botones y chips no se cortan ni se pisan.
- [ ] **1.3** En **Home**, tocá **Filters**, prendé **For kids** y **Free events only**, y después sacalos. **Ver:** todo en inglés y la grilla se actualiza.
- [ ] **1.4** Abrí un evento. **Ver:** la barra de arriba dice «Event» (antes decía «Evento»); los botones dicen **♥ Save**, **Going**, **Add to calendar** y **+ Follow**. Con sesión iniciada, tocá **Save** y fijate que aparezca en **My events**. Sin sesión, tiene que aparecer un mensaje en inglés que te invita a entrar.
- [ ] **1.5** Con sesión, en **My events**, mirá «Venues you follow» y el botón **Share my plans on WhatsApp**. **Ver:** en inglés. Ojo: el mensaje que se arma para mandar por WhatsApp sigue en castellano, a propósito (es para mandarlo a gente de Salta).
- [ ] **1.6** En **Radar**, sin tocar nada más, mirá los textos y el botón **Save Radar preferences**. **Ver:** en inglés. Los nombres de las categorías (Música, Teatro…) siguen en castellano: vienen de la base y no es error.
- [ ] **1.7** En **Account**, mirá Notifications, el ingreso con Google y el idioma. **Ver:** en inglés.
- [ ] **1.8** Cerrá la app del todo y volvé a abrirla. **Ver:** sigue en inglés.
- [ ] **1.9** Volvé a **Español** y repasá rápido las pestañas. **Ver:** todo en castellano, sin palabras en inglés colgadas. Después probá **Automático**: la app sigue el idioma del teléfono.

### 2. Fechas, recordatorios y «Este finde pinta» en inglés

- [ ] **2.1** Con la app en inglés, mirá las fechas de las tarjetas y de la ficha. **Ver:** formato tipo «Sat 7 Nov» y «Saturday 7 November», con la hora de Salta.
- [ ] **2.2** Con sesión y los recordatorios prendidos en Cuenta, guardá un evento que sea **mañana**. Si lo hacés antes de las 18:00, a esa hora te tiene que llegar el recordatorio. **Ver:** dice «Tomorrow: …» en inglés.
- [ ] **2.3** (Si podés) Guardá otro evento de mañana, pasá la app a **Español** antes de las 18. **Ver:** el recordatorio llega en castellano («Mañana: …»).
- [ ] **2.4** El jueves a las 18:00, con el interruptor «Este finde pinta» prendido en **Cuenta** («What’s on this weekend» en inglés). **Ver:** llega «What’s on this weekend: …» si la app está en inglés, o «Este finde pinta: …» si está en castellano.

### 3. Contraseña y eliminar cuenta en inglés (con sesión iniciada)

- [ ] **3.1** En **Account**, tocá **Change password** (o **Password**, si entraste con Google). **Ver:** título, explicación, campos «New password» y «Repeat it» y el botón **Save password**, todo en inglés.
- [ ] **3.2** Escribí dos contraseñas **distintas** y tocá **Save password**. **Ver:** el error «The passwords do not match.» en inglés. No se cambia nada. Tocá **Back**.
- [ ] **3.3** En **Account**, tocá **Delete my account**. **Ver:** la lista de qué se borra y qué no, en inglés, y el correo de contacto. El campo dice que hay que escribir **ELIMINAR** (la palabra sigue en castellano a propósito).
- [ ] **3.4** **No sigas** si es tu cuenta de verdad: volvé atrás. Con una cuenta de prueba, escribí ELIMINAR y confirmá. **Ver:** se borra, la app vuelve a la pantalla de bienvenida y no hay textos en castellano en el camino.

### 4. Letra grande

- [ ] **4.1** En los ajustes del teléfono, subí el **tamaño de letra** al máximo (en muchos Android: Ajustes → Pantalla → Tamaño de fuente). Si tu teléfono tiene «Tamaño de pantalla» o «Zoom», subilo también.
- [ ] **4.2** Con la app en **inglés** (los textos son más largos), recorré las cinco pestañas y una ficha. **Ver:** ningún botón cortado («Share my plans on WhatsApp», «Change password» con su flecha, «Add to calendar», «Going»). Si un texto no entra, tiene que pasar a dos renglones.
- [ ] **4.3** Repetí en **castellano**. **Ver:** lo mismo.
- [ ] **4.4** Volvé la letra a tu tamaño de siempre.

### 5. Lugares para chicos (repaso rápido en inglés)

- [ ] **5.1** En **Home**, tocá **Filters**, prendé **For kids** y tocá la tarjeta **Places for kids** que aparece arriba de la grilla. **Ver:** la lista en inglés, con los filtros «All types», «Free» y «Open now».
- [ ] **5.2** Abrí un lugar. **Ver:** «Opening hours», **Directions** y los botones de contacto en inglés; la barra de arriba dice «Place for kids». Si la lista está vacía o tiene pocos lugares, avisanos igual: todavía se están cargando y verificando.

### 6. «Este finde pinta» con la app cerrada (solo un jueves)

Este caso depende de que el equipo mande un «Aviso del equipo» ese jueves. Si no llega ninguno, salteá esta parte.

- [ ] **6.1** Con el interruptor «Este finde pinta» prendido en Cuenta y la app **cerrada**, cuando llegue el «Aviso del equipo» **descartalo deslizándolo, sin tocarlo**.
- [ ] **6.2** Abrí la app en cualquier momento **antes de las 18:00** (alcanza con abrirla y cerrarla).
- [ ] **6.3** **Ver:** a las 18:00 **no** te llega «Este finde pinta».
- [ ] **6.4** Aclaración: si ese día **no abrís la app** entre el aviso y las 18, pueden llegarte los dos. Ese caso todavía no está cubierto: no es error.

### 7. Sin conexión

- [ ] **7.1** Con la app en inglés, poné el teléfono en **modo avión** y abrí la app. Pasá por Home, Search, My events y Radar. **Ver:** en cada una, un aviso claro en inglés (por ejemplo «You are offline…» u «Offline»), nunca una pantalla en blanco ni un mensaje en castellano.
- [ ] **7.2** Sacá el modo avión y tocá **Try again** (o tirá la lista para abajo). **Ver:** vuelve a cargar.
- [ ] **7.3** Repetí en castellano. **Ver:** lo mismo, en castellano.

### 8. Controles rápidos de lo que ya andaba en el build 8

- [ ] **8.1** En **Inicio**, deslizá las pills de fecha (Hoy, Esta noche, Finde, Semana) hasta el final y tocá **Filtros**. **Ver:** se abre la hoja de filtros (el arreglo del build 8 sigue andando). Probalo también en inglés (Today, Tonight, Weekend, This week y **Filters**).
- [ ] **8.2** **Ver:** la grilla de Inicio sigue en dos columnas parejas, también en inglés y con letra grande.

### 9. Opcional: la web en inglés

Desde el navegador del celular o la compu:

- [ ] **9.1** Entrá a <https://www.quepintasalta.com.ar/en>. **Ver:** el sitio en inglés.
- [ ] **9.2** Abrí <https://www.quepintasalta.com.ar/en/auth/sign-up>. **Ver:** el formulario de alta en inglés (no hace falta crear otra cuenta).
- [ ] **9.3** Con tu cuenta, entrá a <https://www.quepintasalta.com.ar/en/perfil> y a <https://www.quepintasalta.com.ar/en/nuevo-evento>. **Ver:** en inglés. Los nombres de lugares y de eventos pueden seguir en castellano.
- [ ] **9.4** Desde la ficha de un evento, tocá el nombre del lugar. **Ver:** se abre la ficha del lugar (`/lugar/…`, o `/en/place/…` en inglés), con sus próximos eventos y el botón para seguirlo.

## Qué no es error (por ahora)

- **Títulos de eventos en castellano** con la app en inglés: si un evento todavía no tiene traducción, se muestra el original. La traducción automática se está poniendo al día.
- **Nombres de categorías y de lugares** en castellano: vienen de la base de datos.
- **Lo que se comparte por WhatsApp** sale en castellano.
- **ELIMINAR** para confirmar el borrado de la cuenta, también en inglés.
- **Política de privacidad y términos**: los links dicen «(in Spanish)» y abren la versión en castellano.
- **«Este finde pinta» duplicado** si no abriste la app entre el aviso del equipo y las 18 (paso 6.4).

## Cómo reportar

Escribinos por el mismo **WhatsApp** donde te llegó el aviso del build, o respondé el **correo del grupo de testers**, o mandá un mail a **contacto@quepintasalta.com.ar**. Para que lo podamos arreglar rápido, contanos:

1. **Qué hiciste** (el número del paso de esta guía, si lo tenés).
2. **Qué esperabas ver** y **qué viste**.
3. Una **captura de pantalla** (o un video corto si es algo que se mueve).
4. **Modelo del teléfono**, **versión de Android**, **idioma** de la app (castellano, inglés o automático) y si tenías la **letra grande**.

Si algo te impide usar la app (se cierra sola, no abre, no podés entrar a tu cuenta), avisanos apenas lo veas, sin esperar a terminar la guía.

## Enlaces útiles

- Sitio: <https://www.quepintasalta.com.ar>
- Sitio en inglés: <https://www.quepintasalta.com.ar/en>
- Mapa con los lugares para chicos: <https://www.quepintasalta.com.ar/mapa?chicos=1&capa=chicos>
- Fichas de lugar: `https://www.quepintasalta.com.ar/lugar/<nombre-del-lugar>` y, en inglés, `https://www.quepintasalta.com.ar/en/place/<nombre-del-lugar>`. La forma más fácil de llegar es tocar el nombre del lugar en la ficha de un evento o en la lista del mapa.
- ¿Falta un lugar para chicos? Sumalo en <https://www.quepintasalta.com.ar/lugares-chicos/sumar>
- Contacto: contacto@quepintasalta.com.ar

## Notas de la versión (Play, menos de 500 caracteres)

```
Novedades:
• La app entera en inglés: elegí el idioma en Cuenta → Idioma.
• Fechas, recordatorios y «Este finde pinta» en el idioma que elijas.
• Botones más cómodos con la letra grande.
• «Este finde pinta» ya no se repite si ese día llegó un aviso del equipo, aunque la app estuviera cerrada.
• Mejoras de accesibilidad y arreglos chicos.
```

(340 caracteres. Verificar el conteo final en Play Console.)

## Mensaje de WhatsApp para los testers

```
¡Hola! Ya está el build 9 de Qué Pinta Salta 🎉
Actualizala desde Play Store (o desde el link de la prueba).
Novedad grande: la app entera en inglés (Cuenta → Idioma), más cómoda con la letra grande.
Si tenés un rato, seguí la guía de prueba que te pasamos y contanos acá cualquier cosa rara. ¡Gracias por probar!
```
