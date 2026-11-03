# Tanda Q6 · 3/11 noche → 4/11 09:00

Base: `main` después de la Q5 (#166) y del arreglo de «Filtros» (#182). Build 8 lanzado desde `dbafcd4`.

## Decisiones de Mauro que mandan
- **IA:** Gemini sigue siendo el proveedor por defecto (Mauro cargó USD 10). Esta tanda **prepara** el paso a Claude: una capa de proveedor intercambiable y un banco de evaluación **en seco**, sin llamadas pagas. Primero se mide la calidad y después se decide.
- **Decisiones de Q4** (respondidas el 3/11): ya están aplicadas en Q5-16 (#180). No se reabren.
- **Inglés:** lo que falta de la app (Inicio, Buscar, Mis eventos, Radar, Cuenta) y de la web (alta, perfil, carga de eventos).
- **Producción en Play:** el pedido es el 9/11. Hace falta pulido de rendimiento y accesibilidad, y la revisión del diff de Q5.
- Sin dependencias nuevas, migraciones solo aditivas y nada de merge a `main` entre las 00:00 y las 08:00.
- Mauro corre SQL en el editor de Supabase, no la CLI: el SQL para alinear `schema_migrations` va listo para pegar.
