// CommonJS puro (no pasa por tsc: `tsconfig.json` solo incluye `**/*.ts` y
// `**/*.tsx`, y `expo/tsconfig.base` excluye `metro.config.js` a mano). Lo
// prueba `tests/metro-config.test.ts` cargándolo con `createRequire`.
//
// Envuelve `transformer.getTransformOptions` de Metro para forzar
// `transform.inlineRequires = true` sin tocar nada más (ni
// `experimentalImportSupport`, que Expo ya deja en `true`).
//
// Firma real de `getTransformOptions` (no la inventamos: está en
// node_modules/metro-config/src/types.js.flow, líneas 46-59):
//
//   type GetTransformOptionsOpts = { dev: boolean, hot: true, platform: ?string }
//   type GetTransformOptions = (
//     entryPoints: ReadonlyArray<string>,
//     options: GetTransformOptionsOpts,
//     getDependenciesOf: (absoluteFilePath: string) => Promise<Array<string>>,
//   ) => Promise<Partial<ExtraTransformOptions>>
//
// Es asíncrona: la de Expo (node_modules/@expo/metro-config/build/
// ExpoMetroConfig.js, líneas 343-348) es `async () => ({ transform: {...} })`.
// Por eso acá siempre se hace `await` del resultado antes de tocarlo; nunca
// se asume que `getTransformOptions(...)` devuelve el objeto de una.
//
// @param {(...args: unknown[]) => Promise<Record<string, unknown>>} getTransformOptions
// @returns {(...args: unknown[]) => Promise<Record<string, unknown>>}
function conInlineRequires(getTransformOptions) {
  return async function (entryPoints, options, getDependenciesOf) {
    // La original puede devolver `transform` con cosas adentro, `transform`
    // vacío, o no devolver `transform` en absoluto (ninguno de los tres
    // casos puede hacer `{ ...resultado.transform }` fallar: si no hay
    // `transform`, el spread de `undefined` da `{}`).
    const resultado = (await getTransformOptions(entryPoints, options, getDependenciesOf)) || {}

    return {
      ...resultado,
      transform: {
        ...resultado.transform,
        inlineRequires: true,
      },
    }
  }
}

module.exports = { conInlineRequires }
