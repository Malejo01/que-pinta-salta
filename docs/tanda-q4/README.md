# Tanda Q4 · 2/11 → 3/11 · decisiones de Mauro y contexto para los agentes

Rama base: `ronda/integracion-q4` (sale de `main` en `3bd93a6`, con el build 6 publicado en la prueba cerrada de Play).

## Decisiones ya tomadas (no se reabren)
- **Dónde:** Claude en la nube hace lo complejo; Gemini 3.8 (Antigravity, PC de Mauro) hace tareas acotadas y revisa los PRs de Claude.
- **Entrega:** un solo PR de integración `ronda/integracion-q4 → main`, con su vista previa de Vercel. Al final sale el build 7.
- **Migraciones:** se pueden aplicar en la base de producción **solo si son aditivas y compatibles hacia atrás** (columnas nuevas con default o NULL, tablas, funciones, índices, policies). Nada de DROP, cambios de tipo ni borrado de datos. Ver el prompt.

### Avisos sin sesión (R82, dudas de `docs/propuestas/r82/LEEME.md`)
1. En una fila con cuenta manda `notification_preferences` (lo que la persona eligió); `push_tokens.avisos_*` vale solo para filas anónimas.
2. Regla estricta: token + deviceId tienen que coincidir para cambiar preferencias.
3. El `device_id` lo genera el servidor y lo devuelve `registrar` (sin dependencia nueva).
4. Límite de tasa en memoria por instancia para empezar (documentar la limitación).
5. URL de la API: constante `https://www.quepintasalta.com.ar`, que se puede pisar con `EXPO_PUBLIC_API_URL` si existe.
6. Al eliminar la cuenta, ese teléfono deja de recibir avisos (se apagan explícitamente).
7. Al cerrar sesión, los patrocinados vuelven siempre a `false` en la fila anónima.
8. `purge_push_tokens_anonimos` se engancha a la limpieza que ya existe.
9. Las bajas de patrocinados de anónimos se miden aparte (anotarlo).
10. Privacidad: el texto va como propuesta en el PR; las páginas legales no se tocan.

### Mapa (pregunta 21)
Opción 1: workflow de GitHub una vez por día, máximo 4 pedidos por minuto a Nominatim y 10 lugares por corrida, registrado en `job_runs`; columna `geocode_intentado_at` para no repetir un lugar antes de 30 días; el detector de `no-programado.test.ts` cambia para permitir solo ese workflow.

### Publicidad (pregunta 18)
Opción recomendada: sumar `'anterior'` al check de `fuente_audiencia`; el cron escribe `'anterior'` cuando copia la audiencia del ciclo previo, y el aviso del admin sale de ese valor.

### Producto (pendientes de octubre)
- Búsquedas recientes: se borran al eliminar la cuenta (y propuesta de texto para Privacidad en el PR).
- «Para chicos»: deja afuera los eventos con `age_restriction >= 18`.
- La invitación a los avisos aparece una sola vez por persona (ya en `main`, R83).
- Ubicación: la app pasa a pedir solo ubicación aproximada (política de Play del 27/01/2027).
