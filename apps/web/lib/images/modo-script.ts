/**
 * Mensaje de modo (dry-run o apply) para los scripts que escriben en el
 * Storage de producción. Se saca a un módulo propio, sin ningún efecto
 * colateral, para poder testearlo sin ejecutar `main()` del script (que
 * corre al importarse el archivo). Tiene que imprimirse **después** de leer
 * la bandera `--apply`, nunca antes: decir "DRY-RUN" sin haber leído la
 * bandera es el bug de QPS-105.
 */
export function avisoDeModo(nombre: string, apply: boolean): string {
  return apply
    ? `[${nombre}] APPLY: escribe en Storage (producción). Cortá con Ctrl+C si no era lo que querías.`
    : `[${nombre}] DRY-RUN: sin --apply no se escribe nada en Storage.`
}
