# Ubicación en la app (Play, política del 27/01/2027)

Desde el **build 7**, la app de Qué Pinta Salta pide **solo la ubicación aproximada**.

## Qué se pide

| Permiso de Android | Estado | Por qué |
|---|---|---|
| `ACCESS_COARSE_LOCATION` (aproximada) | Declarado | Para «qué hay cerca» alcanza una precisión de cientos de metros. |
| `ACCESS_FINE_LOCATION` (precisa) | **Bloqueado** | `android.blockedPermissions` en `apps/mobile/app.config.ts`. `expo-location` y MapLibre lo declaran en sus manifiestos; el bloqueo lo saca del manifiesto final (`tools:node="remove"`). |
| `ACCESS_BACKGROUND_LOCATION` (segundo plano) | **Bloqueado** | La app nunca usa la ubicación en segundo plano. El plugin de `expo-location` ya tenía apagados el segundo plano y el servicio en primer plano. |

- **Cuándo:** solo «mientras se usa la app» y solo después de que la persona toca una acción que la necesita. Nunca al abrir la app.
- **Precisión:** `Location.Accuracy.Balanced` (unos 100 m), en `apps/mobile/lib/ubicacion.ts`. La posición se redondea a dos decimales (~1 km) antes de usarla.
- **No se guarda ni se manda:** no hay ninguna columna de ubicación de personas en la base, ni se manda a ningún servidor ni a terceros.

## Qué la usa hoy

**Nada todavía.**
- «Cerca mío» (R55) está preparado (el plugin y el texto del permiso), pero ninguna pantalla lee la posición.
- El mapa (MapLibre) muestra los lugares y no dibuja la posición de la persona.
- El helper `ubicacionAproximada()` queda listo para cuando se sume «Cerca mío».

Verificación en el código: `apps/mobile/tests/ubicacion-aproximada.test.ts` comprueba que:
- el config bloquea FINE y BACKGROUND;
- nadie usa `Accuracy.High`, `Highest` ni `BestForNavigation`, ni `accuracy: 4/5/6`, ni el pedido de permisos de MapLibre (`requestAndroidLocationPermissions`, que pide FINE), ni `PermissionsAndroid` con ubicación;
- solo `lib/ubicacion.ts` lee la posición (`getCurrentPositionAsync` / `watchPositionAsync` / `getLastKnownPositionAsync`).

### Cómo verificarlo en el build 7
1. Instalar el build 7 en un teléfono con Android 12 o más nuevo.
2. Ajustes → Apps → Qué Pinta Salta → Permisos → Ubicación: tiene que ofrecer **solo «Aproximada»**, sin el interruptor «Usar ubicación precisa».
3. Opcional, con el `.aab`: `bundletool dump manifest --bundle app.aab | grep LOCATION` → solo `ACCESS_COARSE_LOCATION`.

## Texto para la declaración en Play Console

**Contenido de la app → Permisos de ubicación / Declaración de ubicación:**

> Qué Pinta Salta es una agenda cultural de Salta, Argentina. La app puede pedir la **ubicación aproximada** (ACCESS_COARSE_LOCATION), solo mientras está abierta y solo cuando la persona toca una opción para ver los eventos cercanos. Se usa para ordenar la agenda por cercanía en el teléfono. La app no pide la ubicación precisa ni en segundo plano, no guarda la ubicación en servidores y no la comparte con terceros ni con anunciantes.

**Seguridad de los datos → Ubicación:**
- «Ubicación aproximada»: **no se recopila**, porque no sale del teléfono. Si Play exige declararla por el permiso, se declara como «Procesada efímeramente / solo en el dispositivo», para la finalidad «Funcionalidad de la app», sin compartir.
- «Ubicación precisa»: no se recopila.

## Pendiente
- Si se implementa «Cerca mío» de verdad, revisar este documento y la declaración: qué pantalla la pide y qué texto ve la persona.
