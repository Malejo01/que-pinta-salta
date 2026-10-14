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

module.exports = getDefaultConfig(__dirname)
