# Registro de rondas

Acá anota Claude una línea por tarea. Google (Antigravity, Jules, Gemini) anota en su propio log local (`ops/revisiones/gemini-log.md`). Línea base de tokens: [tokens-baseline.md](tokens-baseline.md).

## 1. Protocolo

1. Máximo 5 tareas por ronda.
2. Una tarea por sesión.
3. Dos fallos seguidos (dos vueltas de arreglo sin pasar la verificación): se para, la tarea queda **Bloqueada** y decide una persona.
4. Al cerrar la ronda, resumen de 10 líneas (ver sección 3).
5. Una línea por tarea, con tokens y con quién la hizo (Claude, o Google: Antigravity/Jules/Gemini).

Los tokens salen del informe de uso de la corrida (lo agrega el script de la corrida nocturna); se comparan contra la línea base.

## 2. Formato de la línea

`fecha · ronda · tarea · quién (modelo) · tokens · vueltas · PR · estado`

Estados: **hecha**, **Bloqueada**, **sin terminar**.

Ejemplo inventado (no es un dato real):

`AAAA-MM-DD · R80 · 80-a · Claude (Sonnet) · 41 k tokens · 1 vuelta · PR #NNN · hecha`

## 3. Resumen de cierre (10 líneas)

1. Ronda y fecha.
2. Qué cambió (en una frase).
3. PR (número y estado).
4. Tareas hechas.
5. Tareas Bloqueadas y motivo.
6. Tareas sin terminar.
7. Tokens totales por modelo.
8. Vueltas de arreglo usadas.
9. Quién hizo qué (Claude / Google).
10. Qué sigue.

## 4. Registro

| Fecha | Ronda | Tarea | Quién (modelo) | Tokens | Vueltas | PR | Estado |
|---|---|---|---|---|---|---|---|
