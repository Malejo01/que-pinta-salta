// Declaración ambiental para los assets de imagen que importa la app
// (`assets/logo-circular.png`, usado en Bienvenida y en el espacio vacío
// con la marca de `components/Afiche.tsx`). Metro los resuelve en runtime
// a un número (el id del asset registrado); TypeScript necesita esta
// declaración para aceptar el import/require.
declare module '*.png' {
  const valor: number
  export default valor
}
