import { describe, expect, it } from 'vitest'
import { CONTACTO_EMAIL } from '@qps/core/contacto'
import {
  claveDeConsulta,
  consultasParaLugar,
  describirConsulta,
  type ConsultaGeocodificacion,
  direccionUtil,
  normalizarConsulta,
  REFERER,
  urlDeBusqueda,
  USER_AGENT,
  URL_POLITICA,
} from '@/lib/venues/geocodificacion/consultas'
import { ZONA_SALTA } from '@qps/core/mapa/zona'
import { ZONA_SALTA_CAPITAL } from '@/lib/venues/geocodificacion/localidades'

describe('normalizarConsulta', () => {
  it('minúsculas, sin tildes, espacios colapsados y recortados', () => {
    expect(normalizarConsulta('  Güemes   Norte  ')).toBe('guemes norte')
  })

  it('no toca la puntuación (las comas quedan)', () => {
    expect(normalizarConsulta('Balcarce, Salta, Argentina')).toBe('balcarce, salta, argentina')
  })
})

describe('direccionUtil', () => {
  it('false si la dirección está vacía, null o solo espacios', () => {
    expect(direccionUtil('', 'La Casona')).toBe(false)
    expect(direccionUtil(null, 'La Casona')).toBe(false)
    expect(direccionUtil(undefined, 'La Casona')).toBe(false)
    expect(direccionUtil('   ', 'La Casona')).toBe(false)
  })

  it('false si la dirección normalizada es igual al nombre normalizado', () => {
    expect(direccionUtil('La Casona', 'La Casona')).toBe(false)
    expect(direccionUtil('la casona', 'La Casona')).toBe(false)
  })

  for (const placeholder of ['Salta', 'Salta Capital', 'A confirmar', 'Sin dirección', 'SALTA', '  salta  ']) {
    it(`false para el placeholder "${placeholder}"`, () => {
      expect(direccionUtil(placeholder, 'La Casona')).toBe(false)
    })
  }

  it('true con una dirección real', () => {
    expect(direccionUtil('Balcarce 123', 'La Casona')).toBe(true)
  })
})

describe('consultasParaLugar', () => {
  const resumen = (cs: ConsultaGeocodificacion[]) => cs.map(describirConsulta)

  it('con calle + número: estructurada, nombre+ciudad, nombre, y la de toda la provincia', () => {
    const consultas = consultasParaLugar({ nombre: 'La Casona', direccion: 'Balcarce 123' })
    expect(consultas).toEqual([
      {
        tipo: 'estructurada',
        calle: 'Balcarce',
        numero: '123',
        ciudad: 'Salta',
        alcance: 'ciudad',
        zona: ZONA_SALTA_CAPITAL,
        donde: 'Salta Capital',
      },
      { tipo: 'libre', q: 'La Casona, Salta Capital', alcance: 'ciudad', zona: ZONA_SALTA_CAPITAL, donde: 'Salta Capital' },
      { tipo: 'libre', q: 'La Casona', alcance: 'ciudad', zona: ZONA_SALTA_CAPITAL, donde: 'Salta Capital' },
      { tipo: 'libre', q: 'Balcarce 123, Salta, Argentina', alcance: 'provincia', zona: ZONA_SALTA, donde: 'provincia de Salta' },
    ])
  })

  it('Babylon, "Necochea 719" sin ciudad: la primera es estructurada en la capital y va acotada (bounded=1)', () => {
    const [primera, ...resto] = consultasParaLugar({ nombre: 'Babylon', direccion: 'Necochea 719' })
    expect(primera).toMatchObject({ tipo: 'estructurada', calle: 'Necochea', numero: '719', ciudad: 'Salta', alcance: 'ciudad' })
    expect(primera.zona).toEqual(ZONA_SALTA_CAPITAL)
    expect(new URL(urlDeBusqueda(primera, { email: 'a@b.c' })).searchParams.get('bounded')).toBe('1')
    // Lo único que no está acotado a la ciudad es la última.
    expect(resto.map((c) => c.alcance)).toEqual(['ciudad', 'ciudad', 'provincia'])
  })

  it('sin número ("Avenida Jhon F. Kennedy", Coco Club): sin estructurada; nombre, nombre+ciudad, calle sin número en la ciudad y provincia', () => {
    const consultas = consultasParaLugar({ nombre: 'Coco Club', direccion: 'Avenida Jhon F. Kennedy' })
    expect(consultas).toHaveLength(4)
    expect(consultas.some((c) => c.tipo === 'estructurada')).toBe(false)
    expect(resumen(consultas)).toEqual([
      'Coco Club, Salta Capital [en Salta Capital]',
      'Coco Club [en Salta Capital]',
      'Avenida John F. Kennedy, Salta (sin número) [en Salta Capital]',
      'Avenida John F. Kennedy, Salta, Argentina [toda la provincia]',
    ])
    expect(consultas[2]).toMatchObject({ tipo: 'libre', soloCalle: true, alcance: 'ciudad' })
    expect(consultas[0]).not.toHaveProperty('soloCalle')
  })

  it('"s/n" y "Ruta 9" (útiles pero sin número de puerta): tampoco hay estructurada, hay la de calle sin número', () => {
    for (const direccion of ['Calle Larga s/n', 'Ruta 9']) {
      const consultas = consultasParaLugar({ nombre: 'Peña de Prueba', direccion })
      expect(consultas.some((c) => c.tipo === 'estructurada'), direccion).toBe(false)
      expect(consultas.filter((c) => c.tipo === 'libre' && c.soloCalle), direccion).toHaveLength(1)
    }
  })

  it('la estructurada y la de calle sin número se excluyen: nunca hay las dos', () => {
    for (const direccion of ['Balcarce 123', 'Avenida John F. Kennedy', 'Marcelino Freyre 1438-1498']) {
      const consultas = consultasParaLugar({ nombre: 'Lugar de Prueba', direccion })
      const estructuradas = consultas.filter((c) => c.tipo === 'estructurada').length
      const soloCalle = consultas.filter((c) => c.tipo === 'libre' && c.soloCalle).length
      expect(estructuradas + soloCalle, direccion).toBe(1)
    }
  })

  it('con la dirección rara que no se reconoce: va como vino', () => {
    const consultas = consultasParaLugar({ nombre: 'Lugar de Prueba', direccion: 'Pasaje Inventado, Barrio Ficticio' })
    expect(consultas.at(-1)).toMatchObject({ q: 'Pasaje Inventado, Barrio Ficticio, Salta, Argentina', alcance: 'provincia' })
  })

  it('normaliza la dirección antes de armar la consulta ("San martin 484", "Av. Uruguay 750, Salta")', () => {
    const [a] = consultasParaLugar({ nombre: 'Lugar de Prueba', direccion: 'San martin 484' })
    expect(a).toMatchObject({ tipo: 'estructurada', calle: 'San Martín', numero: '484' })
    const [b] = consultasParaLugar({ nombre: 'Lugar de Prueba', direccion: 'Av. Uruguay 750, Salta' })
    expect(b).toMatchObject({ tipo: 'estructurada', calle: 'Avenida Uruguay', numero: '750' })
  })

  it('sin dirección útil (placeholder, vacía, undefined, igual al nombre): nombre+ciudad, nombre y provincia por nombre', () => {
    for (const direccion of ['Salta', 'A confirmar', '', undefined, 'La Casona']) {
      const consultas = consultasParaLugar({ nombre: 'La Casona', direccion })
      expect(resumen(consultas), String(direccion)).toEqual([
        'La Casona, Salta Capital [en Salta Capital]',
        'La Casona [en Salta Capital]',
        'La Casona, Salta, Argentina [toda la provincia]',
      ])
    }
  })

  it('un placeholder con tildes/mayúsculas ("SALTA CAPITAL") tampoco cuenta como dirección', () => {
    expect(consultasParaLugar({ nombre: 'La Casona', direccion: 'SALTA CAPITAL' })).toHaveLength(3)
  })

  it('Cachi: el nombre manda la búsqueda al rectángulo de Cachi, no al de la capital', () => {
    const consultas = consultasParaLugar({ nombre: 'Museo Arqueológico de Cachi' })
    expect(consultas[0]).toMatchObject({ q: 'Museo Arqueológico de Cachi, Cachi', alcance: 'ciudad', donde: 'Cachi' })
    expect(consultas[0].zona).not.toEqual(ZONA_SALTA_CAPITAL)
    expect(consultas.at(-1)?.alcance).toBe('provincia')
  })

  it('Orán: "Campo Municipal de Deportes, Oran, Argentina" -> estructurada o libre en Orán, con el city oficial', () => {
    const consultas = consultasParaLugar({ nombre: 'Campo Municipal de Deportes', direccion: 'Oran, Argentina' })
    expect(consultas[0]).toMatchObject({ alcance: 'ciudad', donde: 'Orán' })
    expect(consultas.every((c) => c.alcance === 'provincia' || c.donde === 'Orán')).toBe(true)
  })

  it('Orán estructurada: el city es el oficial ("San Ramón de la Nueva Orán")', () => {
    const [primera] = consultasParaLugar({ nombre: 'Club de Prueba', direccion: 'Calle Falsa 123, Orán' })
    expect(primera).toMatchObject({ tipo: 'estructurada', ciudad: 'San Ramón de la Nueva Orán', donde: 'Orán' })
  })

  it('máximo 4 consultas y ninguna repetida (por clave)', () => {
    for (const caso of [
      { nombre: 'La Casona', direccion: 'Balcarce 123' },
      { nombre: 'La Casona', direccion: 'Salta, Argentina' },
      { nombre: 'La Casona', direccion: 'Salta' },
      { nombre: 'La Casona' },
      { nombre: 'Coco Club', direccion: 'Avenida Jhon F. Kennedy' },
      { nombre: 'Cachi', direccion: 'Cachi' },
    ]) {
      const consultas = consultasParaLugar(caso)
      expect(consultas.length).toBeLessThanOrEqual(4)
      const claves = consultas.map(claveDeConsulta)
      expect(new Set(claves).size).toBe(consultas.length)
    }
  })

  it('sin repetidas: nombre igual a la ciudad ("Salta") no duplica la consulta', () => {
    const consultas = consultasParaLugar({ nombre: 'Salta Capital' })
    const claves = consultas.map(claveDeConsulta)
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('claveDeConsulta y describirConsulta', () => {
  const [estructurada, libre, , provincia] = consultasParaLugar({ nombre: 'La Casona', direccion: 'Balcarce 123' })

  it('empieza con el prefijo v2 y distingue tipo, texto y alcance', () => {
    const claves = [estructurada, libre, provincia].map(claveDeConsulta)
    for (const c of claves) expect(c.startsWith('v2 |')).toBe(true)
    expect(new Set(claves).size).toBe(3)
  })

  it('la misma frase en la ciudad y en la provincia tiene claves distintas', () => {
    const enCiudad: ConsultaGeocodificacion = { ...libre, q: 'La Casona' } as ConsultaGeocodificacion
    const enProvincia: ConsultaGeocodificacion = { ...provincia, q: 'La Casona' } as ConsultaGeocodificacion
    expect(claveDeConsulta(enCiudad)).not.toBe(claveDeConsulta(enProvincia))
  })

  it('no distingue mayúsculas ni tildes', () => {
    const a = { ...libre, q: 'Güemes Bar' } as ConsultaGeocodificacion
    const b = { ...libre, q: 'guemes   bar' } as ConsultaGeocodificacion
    expect(claveDeConsulta(a)).toBe(claveDeConsulta(b))
  })

  it('describirConsulta marca estructurada, ciudad y provincia', () => {
    expect(describirConsulta(estructurada)).toBe('Balcarce 123, Salta (estructurada) [en Salta Capital]')
    expect(describirConsulta(libre)).toBe('La Casona, Salta Capital [en Salta Capital]')
    expect(describirConsulta(provincia)).toBe('Balcarce 123, Salta, Argentina [toda la provincia]')
  })
})

describe('urlDeBusqueda', () => {
  const email = 'alguien@ejemplo.com'
  const libreCiudad: ConsultaGeocodificacion = {
    tipo: 'libre',
    q: 'La Casona, Salta Capital',
    alcance: 'ciudad',
    zona: ZONA_SALTA_CAPITAL,
    donde: 'Salta Capital',
  }
  const libreProvincia: ConsultaGeocodificacion = {
    tipo: 'libre',
    q: 'La Casona, Salta, Argentina',
    alcance: 'provincia',
    zona: ZONA_SALTA,
    donde: 'provincia de Salta',
  }
  const estructurada: ConsultaGeocodificacion = {
    tipo: 'estructurada',
    calle: 'Necochea',
    numero: '719',
    ciudad: 'Salta',
    alcance: 'ciudad',
    zona: ZONA_SALTA_CAPITAL,
    donde: 'Salta Capital',
  }
  const params = (c: ConsultaGeocodificacion) => new URL(urlDeBusqueda(c, { email })).searchParams

  it('apunta a nominatim.openstreetmap.org/search', () => {
    const url = new URL(urlDeBusqueda(libreCiudad, { email }))
    expect(url.hostname).toBe('nominatim.openstreetmap.org')
    expect(url.pathname).toBe('/search')
  })

  it('en todas: format=jsonv2, countrycodes=ar, limit=3, addressdetails=1, accept-language=es y el email', () => {
    for (const c of [libreCiudad, libreProvincia, estructurada]) {
      const p = params(c)
      expect(p.get('format')).toBe('jsonv2')
      expect(p.get('countrycodes')).toBe('ar')
      expect(p.get('limit')).toBe('3')
      expect(p.get('addressdetails')).toBe('1')
      expect(p.get('accept-language')).toBe('es')
      expect(p.get('email')).toBe(email)
    }
  })

  it('libre en la ciudad: q, viewbox de la capital (lngMin,latMax,lngMax,latMin) y bounded=1', () => {
    const p = params(libreCiudad)
    expect(p.get('q')).toBe('La Casona, Salta Capital')
    expect(p.get('viewbox')).toBe('-65.5,-24.7,-65.33,-24.86')
    expect(p.get('bounded')).toBe('1')
  })

  it('libre en la provincia: viewbox de la provincia y SIN bounded', () => {
    const p = params(libreProvincia)
    expect(p.get('q')).toBe('La Casona, Salta, Argentina')
    expect(p.get('viewbox')).toBe('-68.7,-21.8,-62.2,-26.6')
    expect(p.has('bounded')).toBe(false)
  })

  it('estructurada: street="<número> <calle>", city, state=Salta, country=Argentina, bounded=1 y NO q', () => {
    const p = params(estructurada)
    expect(p.get('street')).toBe('719 Necochea')
    expect(p.get('city')).toBe('Salta')
    expect(p.get('state')).toBe('Salta')
    expect(p.get('country')).toBe('Argentina')
    expect(p.has('q')).toBe(false)
    expect(p.get('bounded')).toBe('1')
    expect(p.get('viewbox')).toBe('-65.5,-24.7,-65.33,-24.86')
  })

  it('una libre no manda street/city/state/country', () => {
    const p = params(libreCiudad)
    for (const k of ['street', 'city', 'state', 'country']) expect(p.has(k)).toBe(false)
  })

  it('la libre de calle sin número va por q y acotada a la ciudad', () => {
    const [, , soloCalle] = consultasParaLugar({ nombre: 'Coco Club', direccion: 'Avenida Jhon F. Kennedy' })
    const p = params(soloCalle)
    expect(p.get('q')).toBe('Avenida John F. Kennedy, Salta')
    expect(p.get('bounded')).toBe('1')
  })
})

describe('USER_AGENT, REFERER y URL_POLITICA', () => {
  it('el User-Agent trae el sitio y el contacto (no es el de una biblioteca)', () => {
    expect(USER_AGENT).toContain('QuePintaSalta')
    expect(USER_AGENT).toContain('quepintasalta.com.ar')
    expect(USER_AGENT).toContain(CONTACTO_EMAIL)
    expect(USER_AGENT.toLowerCase()).not.toContain('node-fetch')
    expect(USER_AGENT.toLowerCase()).not.toContain('axios')
    expect(USER_AGENT.toLowerCase()).not.toContain('undici')
  })

  it('REFERER es el sitio, URL_POLITICA es la política de Nominatim', () => {
    expect(REFERER).toBe('https://www.quepintasalta.com.ar')
    expect(URL_POLITICA).toBe('https://operations.osmfoundation.org/policies/nominatim/')
  })
})
