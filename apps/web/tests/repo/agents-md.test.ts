import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// La raíz del repo está dos niveles arriba de apps/web (cwd de Vitest).
const raiz = path.resolve(process.cwd(), '..', '..')
const agentsPath = path.join(raiz, 'AGENTS.md')
const claudePath = path.join(raiz, 'CLAUDE.md')
const reglasDir = path.join(raiz, '.agents', 'rules')

const leer = (p: string) => readFileSync(p, 'utf8')

function archivosPublicos(): string[] {
  const lista = [agentsPath]
  if (existsSync(claudePath)) lista.push(claudePath)
  if (existsSync(reglasDir)) {
    for (const f of readdirSync(reglasDir)) {
      if (f.endsWith('.md')) lista.push(path.join(reglasDir, f))
    }
  }
  return lista
}

const prohibidos: Array<[string, RegExp]> = [
  ['ruta de disco', /\b[A-Za-z]:[\\/]/],
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/],
  ['clave sk-', /\bsk-[A-Za-z0-9_-]{8,}/],
  ['token eyJ', /\beyJ[A-Za-z0-9_-]{8,}/],
  ['KEY=valor', /\b[A-Z][A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)\s*=\s*\S+/],
  ['.env con valor', /\.env[\w.*]*\s*=\s*\S+/],
  ['ruta /Users o /home', /(?:^|[\s"'`(])\/(?:Users|home)\/[^\s/]+/],
  ['clave AIza', /\bAIza[\w-]{8,}/],
  ['token ghp_/ghs_', /\bgh[ps]_[A-Za-z0-9]{8,}/],
  ['api_key/secret/token=valor', /\b(?:api[_-]?key|secret|token)\s*=\s*["']?[\w-]{4,}/i],
]

describe('AGENTS.md', () => {
  it('existe y no pasa de 60 líneas', () => {
    expect(existsSync(agentsPath)).toBe(true)
    const lineas = leer(agentsPath).replace(/\n$/, '').split('\n').length
    expect(lineas).toBeLessThanOrEqual(60)
  })

  it('nombra los comandos de verificación y las ramas', () => {
    const t = leer(agentsPath)
    expect(t).toContain('npm run check')
    expect(t).toContain('npm run typecheck')
    expect(t).toContain('gemini/')
    expect(t).toContain('ronda/')
  })

  it.each([
    ['ruta de disco', 'ver C:\\Users\\alguien\\proyecto'],
    ['email', 'escribir a alguien@ejemplo.com'],
    ['clave sk-', 'usa sk-abcdefghij12345'],
    ['token eyJ', 'jwt eyJhbGciOiJIUzI1NiJ9'],
    ['KEY=valor', 'SERVICE_ROLE_KEY=valorfalso123'],
    ['.env con valor', '.env.local = algo'],
    ['ruta /Users o /home', 'copiar de /Users/alguien/repo'],
    ['ruta /Users o /home', 'ver /home/alguien/repo'],
    ['clave AIza', 'AIzaSyFAKEFAKEFAKE1234'],
    ['token ghp_/ghs_', 'ghp_abcdefgh12345678'],
    ['token ghp_/ghs_', 'ghs_abcdefgh12345678'],
    ['api_key/secret/token=valor', 'API_KEY=abc1234'],
    ['api_key/secret/token=valor', 'Secret = "abcd1234"'],
    ['api_key/secret/token=valor', 'token=zzzz9999'],
  ])('el detector prohíbe %s: %s', (nombre, texto) => {
    const re = prohibidos.find(([n]) => n === nombre)![1]
    expect(texto).toMatch(re)
  })

  it.each(prohibidos)('los archivos de reglas no tienen %s', (_n, re) => {
    for (const f of archivosPublicos()) {
      expect(leer(f), path.basename(f)).not.toMatch(re)
    }
  })
})

// CLAUDE.md lo agrega el dueño del repo aparte: este chequeo corre solo si el archivo existe.
describe.runIf(existsSync(claudePath))('CLAUDE.md', () => {
  it('empieza importando @AGENTS.md', () => {
    const primera = leer(claudePath).split('\n').find((l) => l.trim() !== '')
    expect(primera?.trim()).toBe('@AGENTS.md')
  })
})

describe('.agents/rules/google.md', () => {
  const google = path.join(reglasDir, 'google.md')
  // Es opcional: solo se verifica si existe.
  it.runIf(existsSync(google))('tiene frontmatter con trigger: always_on', () => {
    const m = leer(google).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    expect(m).not.toBeNull()
    expect(m![1]).toMatch(/^trigger:\s*always_on\s*$/m)
  })
})
