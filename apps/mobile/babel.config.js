// Babel de la app. Hasta ahora no existía este archivo y Expo aplicaba
// `babel-preset-expo` por su cuenta: el preset es el mismo, lo único que se
// suma es el plugin de abajo.
//
// Por qué hace falta el plugin: `@supabase/supabase-js` 2.106.0 carga
// `@opentelemetry/api` de forma opcional con un `import()` cuyo especificador
// es una variable (`import(OTEL_PKG)`, en el módulo `shared/tracing`). Metro
// solo reescribe los `import()` con especificador literal, así que ese queda
// tal cual en el bundle, y Hermes no sabe compilar `import()`:
//
//   error: Invalid expression encountered
//       if (otelModulePromise === null) otelModulePromise = import(
//
// Resultado: `expo export --platform android` falla en cuanto algo importa
// `@supabase/supabase-js` (verificado en la R24: el bundle de la fase 0
// compilaba porque nadie lo importaba todavía).
//
// El paquete envuelve esa carga en `try/catch` y sigue sin trazas cuando el
// módulo no está (`extractTraceContext` devuelve `null`), y
// `@opentelemetry/api` **no está instalado**. Así que reemplazar la llamada
// por una promesa rechazada deja exactamente el mismo comportamiento que hoy
// en Node, sin tocar `package.json` ni agregar dependencias.
//
// Solo se tocan los `import()` con especificador no literal y solo dentro de
// `node_modules`: en el código de la app, un `import()` así sigue rompiendo el
// build, que es lo que queremos.
function importDinamicoNoAnalizable({ types: t }) {
  const esLiteral = (nodo) => nodo != null && nodo.type === 'StringLiteral'

  const enDependencia = (estado) => {
    const archivo = estado.file.opts.filename
    return typeof archivo === 'string' && /[/\\]node_modules[/\\]/.test(archivo)
  }

  // `Promise.reject(new Error(...))`: la misma forma que tiene hoy un
  // `import()` que no resuelve, y el llamador ya la maneja.
  const promesaRechazada = () =>
    t.callExpression(
      t.memberExpression(t.identifier('Promise'), t.identifier('reject')),
      [
        t.newExpression(t.identifier('Error'), [
          t.stringLiteral('import() dinamico no soportado por Hermes'),
        ]),
      ],
    )

  return {
    name: 'qps-import-dinamico-no-analizable',
    visitor: {
      // Forma que entiende Metro: CallExpression con callee de tipo Import.
      CallExpression(path, estado) {
        if (path.node.callee.type !== 'Import') return
        if (esLiteral(path.node.arguments[0])) return
        if (!enDependencia(estado)) return
        path.replaceWith(promesaRechazada())
      },
      // Forma nueva de Babel (`createImportExpressions`), por si el parser la
      // emite: el especificador vive en `source`.
      ImportExpression(path, estado) {
        if (esLiteral(path.node.source)) return
        if (!enDependencia(estado)) return
        path.replaceWith(promesaRechazada())
      },
    },
  }
}

module.exports = function (api) {
  api.cache(true)

  return {
    presets: ['babel-preset-expo'],
    plugins: [importDinamicoNoAnalizable],
  }
}
