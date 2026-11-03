/**
 * Q5-2 · Barrios y zonas de Salta Capital para «Elegí tu barrio» (decisión 10
 * de Mauro: lista corta, 15 a 25, en un archivo de datos versionado y
 * editable). Cada punto es APROXIMADO (el centro del barrio, a ojo sobre el
 * mapa): sirve para ordenar lugares por cercanía, nunca para ubicar a nadie.
 *
 * Se usa solo en el navegador: el barrio elegido no va a la URL, al servidor
 * ni a ningún almacenamiento (propuesta §4.6).
 *
 * Para sumar o corregir uno: editar esta lista (nombre visible, id estable en
 * minúsculas sin tildes, punto con 4 decimales). El test
 * tests/lugares-chicos/barrios.test.ts controla que haya entre 15 y 25, que
 * los ids no se repitan y que todos caigan dentro de Capital.
 */
export const VERSION_BARRIOS = 1

export interface Barrio {
  id: string
  nombre: string
  lat: number
  lng: number
}

export const BARRIOS_SALTA_CAPITAL: readonly Barrio[] = [
  { id: 'centro', nombre: 'Centro', lat: -24.7883, lng: -65.4106 },
  { id: 'tres-cerritos', nombre: 'Tres Cerritos', lat: -24.7686, lng: -65.4003 },
  { id: 'grand-bourg', nombre: 'Grand Bourg', lat: -24.7642, lng: -65.4372 },
  { id: 'castanares', nombre: 'Castañares', lat: -24.7468, lng: -65.4007 },
  { id: 'san-lorenzo-chico', nombre: 'Portezuelo y San Lorenzo Chico', lat: -24.7745, lng: -65.4552 },
  { id: 'limache', nombre: 'Limache', lat: -24.8185, lng: -65.4148 },
  { id: 'santa-ana', nombre: 'Santa Ana', lat: -24.8297, lng: -65.4386 },
  { id: 'parque-la-vega', nombre: 'Parque La Vega', lat: -24.7652, lng: -65.4105 },
  { id: 'el-tribuno', nombre: 'El Tribuno', lat: -24.8222, lng: -65.4302 },
  { id: 'solidaridad', nombre: 'Solidaridad', lat: -24.8366, lng: -65.4167 },
  { id: 'villa-san-lorenzo', nombre: 'Villa San Lorenzo (Capital)', lat: -24.7612, lng: -65.4501 },
  { id: 'ciudad-del-milagro', nombre: 'Ciudad del Milagro', lat: -24.7524, lng: -65.4196 },
  { id: 'san-carlos', nombre: 'San Carlos', lat: -24.8094, lng: -65.4005 },
  { id: 'villa-las-rosas', nombre: 'Villa Las Rosas', lat: -24.8105, lng: -65.4237 },
  { id: 'parque-tres-cerritos', nombre: 'Parque Tres Cerritos', lat: -24.7735, lng: -65.3925 },
  { id: 'bancario', nombre: 'Barrio Bancario', lat: -24.7769, lng: -65.4302 },
  { id: 'hernando-de-lerma', nombre: 'Hernando de Lerma', lat: -24.7994, lng: -65.4245 },
  { id: 'villa-cristina', nombre: 'Villa Cristina', lat: -24.7841, lng: -65.4266 },
  { id: 'parque-bicentenario', nombre: 'Zona Parque Bicentenario', lat: -24.8006, lng: -65.3888 },
  { id: 'el-huaico', nombre: 'El Huaico', lat: -24.7389, lng: -65.4089 },
]

export function barrioPorId(id: string | null | undefined): Barrio | null {
  if (!id) return null
  return BARRIOS_SALTA_CAPITAL.find((b) => b.id === id) ?? null
}
