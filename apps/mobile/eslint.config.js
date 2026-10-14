// ESLint de la app (QPS-139): la config oficial de Expo para el SDK 57, en
// formato plano. La web tiene la suya (apps/web/eslint.config.mjs).
const expoConfig = require('eslint-config-expo/flat')
const { defineConfig } = require('eslint/config')

module.exports = defineConfig([
  expoConfig,
  {
    // Generados: nunca se editan ni se versionan (ver .gitignore).
    ignores: ['android/*', 'ios/*', 'dist/*', '.expo/*', 'expo-env.d.ts'],
  },
])
