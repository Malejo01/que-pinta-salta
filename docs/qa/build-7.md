# Checklist de QA · Build 7 (Tanda Q4)

Guía de prueba manual en teléfono físico (Android) y navegador web para validar el **Build 7** de Qué Pinta Salta antes de la publicación final en Google Play (pista Alpha / Prueba cerrada) y despliegue a producción.

---

## 1. Prioridades críticas de prueba

### A. Avisos sin sesión (push anónimos)
*Contexto: R82 permite recibir notificaciones sin haber creado cuenta, identificando el dispositivo por un `device_id` único generado en servidor.*

- [ ] **Paso 1 (instalación limpia):** Abrir la app tras una instalación limpia (o borrar datos de almacenamiento). No iniciar sesión.
- [ ] **Paso 2 (disparador de invitación):** Navegar la portada, abrir la ficha de un evento y tocar «Guardar» (o «Voy»).
- [ ] **Paso 3 (hoja de activación):** Verificar que aparece la hoja modal de invitación a los avisos (R83: debe aparecer **una sola vez**).
- [ ] **Paso 4 (permiso del sistema):** Tocar «Activar avisos» y aceptar el diálogo de permiso de notificaciones del sistema Android.
- [ ] **Paso 5 (registro en base):** En la base de datos (o logs), verificar que la fila en `push_tokens` se inserta con `user_id = NULL`, `device_id` poblado, y `avisos_equipo = true`.
- [ ] **Paso 6 (preferencias en Cuenta):** Ir al encabezado → Cuenta (sin sesión) → sección Avisos. Comprobar que los interruptores responden y que al cambiar uno persiste entre reinicios de la app.
- [ ] **Paso 7 (recepción anónima):** Emitir un aviso de prueba; verificar que llega al teléfono y que al tocarlo abre la app en la pantalla correspondiente.

---

### B. Avisos con sesión y vinculación de cuenta
*Contexto: Al ingresar con cuenta, el push token se vincula al `user_id` sin duplicar filas, y las preferencias de la cuenta mandan sobre las anónimas.*

- [ ] **Paso 1 (login con token previo):** En el dispositivo anónimo del paso anterior, ir a Cuenta e iniciar sesión con Google o con correo.
- [ ] **Paso 2 (vinculación transparente):** Comprobar que la fila existente en `push_tokens` se actualiza con el `user_id` de la cuenta (no se crea un token duplicado).
- [ ] **Paso 3 (preferencias unificadas):** Comprobar que en Cuenta ahora se muestran las preferencias de `notification_preferences` del usuario.
- [ ] **Paso 4 (cierre de sesión):** Cerrar sesión. Comprobar que la fila en `push_tokens` vuelve a `user_id = NULL` (desvinculada) y que `avisos_patrocinados` regresa a `false`.
- [ ] **Paso 5 (eliminación de cuenta):** Crear una cuenta de prueba, registrar push, y ejecutar «Eliminar mi cuenta» desde la app. Comprobar que el token se elimina completamente de la base y el teléfono deja de recibir avisos asociados a esa cuenta.

---

### C. Recordatorios y acciones en eventos
*Contexto: Flujo de recordatorios y calendario sin permisos intrusivos.*

- [ ] **Paso 1:** En la ficha de un evento próximo, tocar «Agregar al calendario».
- [ ] **Paso 2:** Comprobar que el diálogo de permisos solicita únicamente permiso de **escritura** de calendario (sin leer eventos existentes).
- [ ] **Paso 3:** Verificar que el evento se añade en el calendario del celular con fecha, hora, lugar y título exactos.
- [ ] **Paso 4 (ManejadorTapPush):** Al recibir un aviso push de evento guardado o patrocinado con la app cerrada o en segundo plano, tocar la notificación.
- [ ] **Paso 5:** Verificar que la app arranca y navega automáticamente a la ficha `/evento/[id]`.

---

### D. «Este finde» y filtros combinados
*Contexto: Atajos de fecha calculados en memoria sin recargas innecesarias.*

- [ ] **Paso 1 (atajo Finde):** En la portada (Inicio), tocar la pill «Finde».
- [ ] **Paso 2:** Comprobar que el scroll vuelve arriba de forma fluida y se muestran los eventos entre el viernes a las 18:00 y el domingo a las 23:59.
- [ ] **Paso 3:** Tocar el botón «Filtros» en la cabecera fija (R81) y elegir una categoría (por ejemplo, «Peñas» o «Para chicos»).
- [ ] **Paso 4:** Verificar que la cabecera muestra la grilla de dos columnas con título («Peñas · Finde»), el contador de eventos anunciado y chips removibles `✕ Quitar Finde` y `✕ Quitar Peñas`.
- [ ] **Paso 5 (remover filtro):** Tocar `✕ Quitar Finde`; la vista debe actualizarse instantáneamente conservando el filtro de categoría activo.

---

### E. Ubicación aproximada (política Google Play)
*Contexto: Cumplimiento de políticas de Play 2027: solo ubicación aproximada y solo «mientras se usa la app».*

- [ ] **Paso 1:** Tocar la acción o filtro de «Cerca mío» / mapa.
- [ ] **Paso 2:** Observar el diálogo de permisos de ubicación del sistema Android.
- [ ] **Paso 3:** Verificar que solicita ubicación **aproximada** (no precisa) y **solo mientras la app está en uso** (sin permiso en segundo plano).
- [ ] **Paso 4:** Conceder permiso aproximado y comprobar que los eventos se ordenan/ubican sin bloqueos ni errores.

---

### F. Login con Google y gestión de acceso
*Contexto: Autenticación OAuth nativa fluida y robusta.*

- [ ] **Paso 1:** Ir a Cuenta → «Continuar con Google».
- [ ] **Paso 2:** Elegir cuenta en el selector nativo de Google Play Services.
- [ ] **Paso 3:** Comprobar que regresa a la app logueado, sin pantalla blanca ni parpadeos, mostrando el email en Cuenta.
- [ ] **Paso 4:** Tocar «Contraseña» y verificar que un usuario entrado por Google puede definir o cambiar su contraseña.

---

### G. Versión en inglés (`/en`) en la web
*Contexto: Paridad bilingüe, SEO hreflang y accesibilidad con skip-link.*

- [ ] **Paso 1 (navegación):** Entrar a `/en`, `/en/cines`, `/en/mapa`, `/en/buscar`, `/en/radar` y `/en/anunciantes`.
- [ ] **Paso 2 (textos y voseo):** Comprobar que los textos de interfaz están en inglés claro y correcto, mientras que nombres de lugares, bandas y eventos locales permanecen en castellano con `lang="es"`.
- [ ] **Paso 3 (skip-link y a11y):** En el teclado, presionar `Tab` al cargar cualquier página. Comprobar que aparece el enlace accesible «Skip to content» / «Saltar al contenido» y que al presionar `Enter` traslada el foco a `<main id="contenido">`.
- [ ] **Paso 4 (selector de idioma):** Alternar entre ES y EN en la barra de navegación; comprobar que mantiene la ruta y query params correspondientes.
- [ ] **Paso 5 (página 404):** Ingresar a una URL inexistente bajo `/en/` (ej. `/en/no-existe`); verificar mensaje en inglés, enlace a `/en/cines` y ancla de foco visible.

---

## 2. Pruebas complementarias

### Búsqueda y filtros
- [ ] **Búsquedas recientes:** Realizar varias búsquedas en `/buscar`. Salir y volver; comprobar que el historial reciente aparece y permite repetir consultas con un toque.
- [ ] **Filtro «Para chicos»:** Activar el chip «Para chicos»; verificar que ningún evento con `age_restriction >= 18` figure en los resultados.
- [ ] **Filtro «Solo gratis»:** Comprobar que únicamente se listen eventos cuyo precio sea $0 o gratuitos.

### Panel de administración (`/admin/lugares`)
- [ ] **Contador de cobertura:** Entrar como ADMIN y verificar el contador «N de M eventos próximos con ubicación (X %)».
- [ ] **Propuesta de alias:** Comprobar en tarjetas con nombres similares la sugerencia «¿Es el mismo lugar que X?».
- [ ] **Panel ubicar:** Buscar una dirección en OpenStreetMap y guardarla; constatar que las coordenadas persisten y se visualizan en el mapa.

### Modo sin conexión
- [ ] **Caché offline:** Cargar la portada, activar modo avión en el celular y navegar entre Inicio y Mis eventos.
- [ ] Comprobar que se visualizan los últimos eventos cacheados junto al aviso de «Sin conexión» no intrusivo debajo de la cabecera.

---

## 3. Criterios de aprobación del build
1. **0 crashes** en flujos principales (inicio, búsqueda, ficha, mapa, cines, cuenta).
2. **Push anónimo y con cuenta** verificado en un dispositivo real.
3. **Cumplimiento estricto de permisos** (calendario solo escritura, ubicación solo aproximada).
