# 21 · R84 · Geocodificar en el cron contradice una decisión fijada en la R53

**Contexto.** La 84-b pide completar solos los lugares nuevos «en el cron que ya corre». Hoy eso está prohibido a propósito: `apps/web/tests/venues/geocodificacion/no-programado.test.ts` (R53) fija que el script «NO SE PROGRAMA nunca» y pone en rojo cualquier workflow, `vercel.json` o ruta de `app/api/` que mencione Nominatim, porque la política de uso limita a 4 pedidos por minuto los scripts periódicos. El plan parece escrito sin saber de la R53 (también pide crear un script que ya existe), así que el «autorización para todo» del 2/11 no alcanza para dar por decidido que se cambia esa regla. Además hace falta una columna para no repetir consultas entre corridas (en Vercel no hay caché en disco), y las migraciones están denegadas de noche. No toqué el test.

**Opciones.**
1. **(Recomendada)** Programarlo con reglas propias, de día: un workflow de GitHub una vez por día, a 4 pedidos por minuto como máximo y con tope de 10 lugares por corrida, registrado en `job_runs`; migración con una columna `geocode_intentado_at` para no repetir un lugar antes de 30 días; y el detector cambiado para permitir solo ese workflow. Cumple la política y un workflow no tiene el límite de tiempo de una función de Vercel.
2. Seguir a mano: Mauro corre `--aplicar` cuando entren lugares nuevos, mirando el contador de `/admin/lugares` (84-c). No cambia nada ni suma riesgo, pero depende de que alguien se acuerde.
3. Usar otro geocodificador con licencia para uso automático. Hay que elegir proveedor, y puede tener costo y una dependencia nueva.

**Tarea parada:** la parte automática de la 84-b (encolar y completar lugares nuevos en un proceso programado).
**Sigo con:** 84-a (ajustes al script que ya existe), los alias de la 84-b y el contador de la 84-c.
