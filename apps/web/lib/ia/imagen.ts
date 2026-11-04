/** Q6-3 · Bytes de imagen a base64 sin copiarlos (un Buffer ya es un Uint8Array). */
export function aBase64(datos: Uint8Array): string {
  return Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength).toString('base64')
}
