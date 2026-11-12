# CLAUDE.md — reglas para agentes de código en este repo

## Builds de Vercel (ahorro de Build CPU)

- No pedir previews de Vercel salvo que haga falta revisar UI; para eso, poner `[preview]` en el último commit. La verificación la hace GitHub Actions (`.github/workflows/ci.yml`: typecheck, lint, tests unitarios, build y base).
- `main` construye solo si cambió algo de la web (`apps/web`, `packages`, `package.json`, `package-lock.json`, `turbo.json`, `vercel.json`). Los cambios de `apps/mobile/**`, `eas.json` y `docs/` no construyen la web.
- La regla vive en `scripts/vercel-ignore.sh` (Ignored Build Step, `ignoreCommand` de `apps/web/vercel.json`). Sus casos se prueban con `bash scripts/vercel-ignore.test.sh`. Ante la duda (sin commit anterior o clone superficial) construye.
- Varios merges seguidos a `main` cancelan builds a medias pero igual gastan CPU: si hay que mergear varios PRs, mejor juntarlos en uno de integración.
