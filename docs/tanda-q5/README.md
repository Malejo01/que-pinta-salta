# Tanda Q5 · 2/11 noche → 3/11 · decisiones de Mauro para los agentes

Base: `ronda/integracion-q5`, que sale de la punta de `ronda/integracion-q4` (PR #142, todavía sin mergear a `main` al arrancar). Cuando #142 entre a `main`, mergeá `origin/main` en `ronda/integracion-q5` con `--no-ff`.

## Decisiones ya tomadas (2/11, «todo lo recomendado»)
- Alcance: lugares para chicos, fichas de lugares, más y mejores eventos, la app en inglés, panel de uso para Mauro y los pendientes chicos de Q4.
- Migraciones: igual que en Q4. Se aplican en producción solo si son aditivas y compatibles hacia atrás, después del CI verde y antes del merge a la integración.
- Las 19 «Decisiones para Mauro» de #142 quedan aceptadas como las dejó el agente de Q4.

### Lugares para chicos (§6.4 de `docs/propuestas/lugares-para-chicos.md`)
1. Zona: Salta Capital primero; el modelo admite el Gran Salta, pero la carga inicial es solo Capital.
2. Carga y verificación: el equipo (rol admin) desde `/admin`. Plazos de 90 y 180 días como propone el documento. Para arrancar, un importador desde OpenStreetMap que deja los lugares como **borrador** para que un admin los verifique; nada se publica sin verificación.
3. Salones que abren solo con reserva: entran, marcados «Con reserva».
4. Emprendimientos en casas particulares: afuera.
5. La capa se prende sola con el chip «Para chicos».
6. Ficha propia por lugar: sí (`/lugar/<slug>`), junto con las fichas de lugares de esta tanda.
7. Publicidad en la capa: no, por ahora.
8. `cargado_por` / `verificado_por`: grant por columnas para `anon` (no se exponen).
9. Alta a pedido: sí, formulario público que entra como borrador, con anti-spam.
10. Barrios: lista corta (15 a 25) con puntos aproximados, en un archivo de datos versionado y editable.
