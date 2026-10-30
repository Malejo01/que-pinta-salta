// Corre typecheck, lint (web y app) y tests (web y app) y muestra SOLO los errores
// (tope ~40 líneas). Sale 0 si todo pasa, 1 si algo falla. Uso: `npm run check`
// (opcional `--rapido`: corta en el primer paso que falla).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MAX_LINES = 40;

export const STEPS = [
  { name: 'typecheck', kind: 'tsc', cmd: 'npm run typecheck' },
  { name: 'lint web', kind: 'eslint', cmd: 'npm run lint --workspace web' },
  { name: 'lint app', kind: 'eslint', cmd: 'npm run lint --workspace mobile' },
  { name: 'tests web', kind: 'vitest', cmd: 'npm run test --workspace web' },
  { name: 'tests app', kind: 'vitest', cmd: 'npm run test --workspace mobile' },
];

// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
const splitLines = (s) => stripAnsi(s).split(/\r?\n/);

const ESLINT_ERROR = /^\s+\d+:\d+\s+error\s/;
const VITEST_LINE =
  /\bFAIL\b|×|AssertionError|^\s*(?:Syntax|Type|Reference)?Error:|Tests\s+\d+ failed|Test Files\s+\d+ failed/;

/** Quita repetidos conservando el orden (vitest repite los FAIL en lista y en resumen). */
const unique = (arr) => [...new Set(arr)];

/** Líneas relevantes de error según el tipo de paso (tsc | eslint | vitest). */
export function filterErrorLines(kind, output) {
  const lines = splitLines(output);
  if (kind === 'tsc') return lines.filter((l) => /error TS\d+/.test(l)).map((l) => l.trim());
  if (kind === 'eslint') {
    const out = [];
    let file = null;
    let shown = false;
    for (const l of lines) {
      // Encabezado de archivo: ruta sola en su línea (no "ruta:12:3", no texto del mensaje).
      if (/^\S/.test(l) && /[\\/]/.test(l) && !/:\d+:\d+\s*$/.test(l) && !/^(npm|>)/.test(l)) {
        file = l.trim();
        shown = false;
      } else if (ESLINT_ERROR.test(l)) {
        if (file && !shown) {
          out.push(file);
          shown = true;
        }
        out.push(l.replace(/\s{2,}/g, '  ').trimEnd().slice(0, 160));
      }
    }
    return out;
  }
  if (kind === 'vitest') return unique(lines.filter((l) => VITEST_LINE.test(l)).map((l) => l.trim()));
  return [];
}

/** Cantidad de errores de un paso. */
export function countErrors(kind, output) {
  const lines = splitLines(output);
  if (kind === 'tsc') return lines.filter((l) => /error TS\d+/.test(l)).length;
  if (kind === 'eslint') return lines.filter((l) => ESLINT_ERROR.test(l)).length;
  if (kind === 'vitest') {
    const text = stripAnsi(output);
    const m = text.match(/Tests\s+(\d+) failed/);
    if (m) return Number(m[1]);
    const crosses = lines.filter((l) => /×/.test(l)).length;
    if (crosses > 0) return crosses;
    // Un archivo entero que no carga no deja "Tests N failed" ni "×".
    const f = text.match(/Test Files\s+(\d+) failed/);
    if (f) return Number(f[1]);
    return unique(lines.filter((l) => /\bFAIL\b/.test(l)).map((l) => l.trim())).length;
  }
  return 0;
}

/** Recorta a `max` líneas (incluido el aviso) si hay de más. */
export function trimLines(lines, max = MAX_LINES, hint = 'el paso a mano') {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max - 1);
  const hidden = lines.length - kept.length;
  return [...kept, `… (${hidden} líneas más; corré ${hint} para verlas)`];
}

/** results: [{ name, kind, ok, output }] */
export function buildSummary(results, max = MAX_LINES) {
  const lines = [];
  const owner = []; // comando del paso al que pertenece cada línea
  const push = (line, cmd) => {
    lines.push(line);
    owner.push(cmd);
  };
  for (const r of results) {
    const cmd = r.cmd ?? STEPS.find((s) => s.name === r.name)?.cmd;
    if (r.ok) {
      push(`✔ ${r.name}`, cmd);
      continue;
    }
    const n = countErrors(r.kind, r.output);
    // Si el paso falló y no se pudo contar nada, no decir "0 errores".
    push(`✘ ${r.name} (${n === 0 ? 'falló' : `${n} ${n === 1 ? 'error' : 'errores'}`})`, cmd);
    const detail = filterErrorLines(r.kind, r.output);
    if (detail.length === 0) push('  (sin detalle; corré el paso a mano para verlo)', cmd);
    for (const d of detail) push(`  ${d}`, cmd);
  }
  // El aviso remite al comando del primer paso con detalle oculto.
  const hiddenCmd = lines.length > max ? owner[max - 1] : undefined;
  return trimLines(lines, max, hiddenCmd ? `\`${hiddenCmd}\`` : undefined);
}

export function computeExitCode(results) {
  return results.every((r) => r.ok) ? 0 : 1;
}

function runStep(step) {
  const res = spawnSync(step.cmd, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    name: step.name,
    kind: step.kind,
    cmd: step.cmd,
    ok: res.status === 0 && !res.error,
    output: `${res.stdout ?? ''}\n${res.stderr ?? ''}${res.error ? `\n${res.error.message}` : ''}`,
  };
}

export function main(argv = process.argv.slice(2)) {
  const rapido = argv.includes('--rapido');
  const results = [];
  for (const step of STEPS) {
    const r = runStep(step);
    results.push(r);
    if (rapido && !r.ok) break;
  }
  console.log(buildSummary(results).join('\n'));
  return computeExitCode(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
