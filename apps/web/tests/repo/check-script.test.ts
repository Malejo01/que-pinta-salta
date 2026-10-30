import { describe, expect, it } from 'vitest';
import * as check from '../../../../scripts/check.mjs';

const { filterErrorLines, countErrors, trimLines, buildSummary, computeExitCode } = check as unknown as {
  filterErrorLines: (kind: string, out: string) => string[];
  countErrors: (kind: string, out: string) => number;
  trimLines: (lines: string[], max?: number, hint?: string) => string[];
  buildSummary: (
    r: { name: string; kind: string; ok: boolean; output: string }[],
    max?: number,
  ) => string[];
  computeExitCode: (r: { ok: boolean }[]) => number;
};

const TSC = `web:typecheck: lib/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.
web:typecheck: lib/b.ts(9,1): error TS2304: Cannot find name 'foo'.
Tasks: 1 failed`;

const ESLINT = `
D:\\x\\apps\\web\\lib\\a.ts
  3:5  error    'x' is defined but never used  @typescript-eslint/no-unused-vars
  4:1  warning  Unexpected any                 @typescript-eslint/no-explicit-any

D:\\x\\apps\\web\\lib\\w.ts
  1:1  warning  Only a warning  some-rule

D:\\x\\apps\\web\\lib\\b.ts
  7:2  error  Bad thing  some-rule

✖ 4 problems (2 errors, 2 warnings)`;

const VITEST = ` FAIL  tests/a.test.ts > suma > suma dos
AssertionError: expected 1 to be 2
 × suma dos 2ms
 Test Files  1 failed | 3 passed (4)
      Tests  1 failed | 10 passed (11)`;

describe('check.mjs (funciones puras)', () => {
  it('tsc: deja solo las líneas error TS', () => {
    const l = filterErrorLines('tsc', TSC);
    expect(l).toHaveLength(2);
    expect(countErrors('tsc', TSC)).toBe(2);
  });

  it('eslint: muestra errores con su archivo y oculta warnings', () => {
    const l = filterErrorLines('eslint', ESLINT).join('\n');
    expect(l).toContain('lib\\a.ts');
    expect(l).toContain('lib\\b.ts');
    expect(l).toContain('no-unused-vars');
    expect(l).not.toContain('warning');
    expect(l).not.toContain('w.ts');
    expect(countErrors('eslint', ESLINT)).toBe(2);
  });

  it('vitest: FAIL, AssertionError, × y resumen', () => {
    const l = filterErrorLines('vitest', VITEST).join('\n');
    expect(l).toContain('FAIL');
    expect(l).toContain('AssertionError');
    expect(l).toContain('Tests  1 failed');
    expect(countErrors('vitest', VITEST)).toBe(1);
  });

  it('vitest: suite que falla entera (sin "Tests N failed") se cuenta y muestra el error', () => {
    const out = ` FAIL  tests/roto.test.ts [ tests/roto.test.ts ]
SyntaxError: Unexpected token '}'
 Test Files  2 failed | 3 passed (5)`;
    expect(countErrors('vitest', out)).toBe(2);
    expect(filterErrorLines('vitest', out).join('\n')).toContain("SyntaxError: Unexpected token '}'");
    const sinResumen = ` FAIL  tests/a.test.ts [ tests/a.test.ts ]\nTypeError: x is not a function\n FAIL  tests/b.test.ts [ tests/b.test.ts ]`;
    expect(countErrors('vitest', sinResumen)).toBe(2);
  });

  it('vitest: deduplica las líneas repetidas y conserva el orden', () => {
    const out = ` FAIL  tests/a.test.ts > x\nAssertionError: expected 1 to be 2\n FAIL  tests/a.test.ts > x\n × x 1ms`;
    expect(filterErrorLines('vitest', out)).toEqual([
      'FAIL  tests/a.test.ts > x',
      'AssertionError: expected 1 to be 2',
      '× x 1ms',
    ]);
  });

  it('resumen sin detalle ni conteo no dice "0 errores" y el aviso remite al comando del paso', () => {
    const s = buildSummary([{ name: 'tests web', kind: 'vitest', ok: false, output: 'se rompió algo raro' }]);
    expect(s[0]).toBe('✘ tests web (falló)');
    expect(s[1]).toContain('sin detalle');
    const muchas = Array.from({ length: 60 }, (_, i) => `lib/f${i}.ts(1,1): error TS1000: e${i}`).join('\n');
    const t = buildSummary([{ name: 'typecheck', kind: 'tsc', ok: false, output: muchas }]);
    expect(t).toHaveLength(40);
    expect(t[39]).toContain('corré `npm run typecheck` para verlas');
  });

  it('recorta a 40 líneas con aviso', () => {
    const many = Array.from({ length: 60 }, (_, i) => `l${i}`);
    const out = trimLines(many, 40, 'npm run check');
    expect(out).toHaveLength(40);
    expect(out[39]).toMatch(/^… \(21 líneas más; corré npm run check para verlas\)$/);
    expect(trimLines(['a', 'b'], 40)).toEqual(['a', 'b']);
  });

  it('resumen y exit code', () => {
    const results = [
      { name: 'typecheck', kind: 'tsc', ok: false, output: TSC },
      { name: 'lint web', kind: 'eslint', ok: true, output: '' },
    ];
    const s = buildSummary(results);
    expect(s[0]).toBe('✘ typecheck (2 errores)');
    expect(s).toContain('✔ lint web');
    expect(computeExitCode(results)).toBe(1);
    expect(computeExitCode([{ ok: true }, { ok: true }])).toBe(0);
  });
});
