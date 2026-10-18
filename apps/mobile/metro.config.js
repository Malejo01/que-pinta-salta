// Metro con la configuración por defecto de Expo: desde el SDK 52 detecta el
// monorepo (npm workspaces) solo, y resuelve @qps/core desde packages/.
//
// Una sola React (verificado en la fase 0 de la R24, 13/10): el SDK 57 pide
// react 19.2.3 exacta y la web usa 19.2.6. npm deja la de la app en
// apps/mobile/node_modules, y react-native y las librerías nativas quedan en la
// raíz. Aun así, la configuración por defecto resuelve `react` primero desde
// apps/mobile: el bundle de `export:android` trae solo la 19.2.3. Se comprueba
// en cada cierre buscando la versión en el bundle (plan de la R24).
const { getDefaultConfig } = require('expo/metro-config')
const { conInlineRequires } = require('./scripts/metro/inline-requires')

// `inlineRequires` (46-g, arranque en frío): Expo trae `inlineRequires: false`
// (@expo/metro-config/build/ExpoMetroConfig.js); con eso, al abrir la app se
// evalúan todos los módulos del bundle, se usen o no. `conInlineRequires`
// pisa solo `transform.inlineRequires`, deja `experimentalImportSupport` (y
// todo lo demás) como lo trae Expo. Para revertir: sacar las dos líneas de
// `require` de arriba que no estaban y volver a dejar `module.exports =
// getDefaultConfig(__dirname)` sin envolver `getTransformOptions`.
const config = getDefaultConfig(__dirname)
config.transformer.getTransformOptions = conInlineRequires(config.transformer.getTransformOptions)

module.exports = config
