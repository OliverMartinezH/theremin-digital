# AGENTS.md — Reglas para el agente en Theremin

> **Contexto funcional:** Ver [[Proyecto Theremin]]
> **Estado actual:** Ver [[progress]]
> **Historial de decisiones:** Ver [[history]]

---

## 1. Contexto del proyecto

Theremin es una aplicación web client-side que usa cámara + MediaPipe para detectar manos y Web Audio API para síntesis de sonido. No hay backend, no hay build step. Todo vive en `index.html`, `style.css`, `script.js`. El detalle funcional está en [[Proyecto Theremin]]; este archivo define cómo se trabaja el código.

## 2. Principios arquitectónicos

* **Simplicity First (KISS):** No sobre-ingeniar. Mantener todo simple y mantenible.
* **Zero-build:** Sin bundlers, sin transpilación. Vanilla JS con módulos ES via CDN.
* **Audio-safe:** Nunca crear/destruir nodos de audio en caliente; reutilizar y ramp. Cortar sonido sin clicks.
* **Graceful degradation:** Si la cámara falla o no hay manos, la app no crashea; se silencia o muestra error claro.

## 3. Stack

* **Runtime:** HTML/CSS/JS vanilla (ES modules)
* **Detección de manos:** MediaPipe Tasks Vision v0.10.14 (CDN)
* **Audio:** Web Audio API nativa
* **Persistencia:** localStorage
* **UI:** CSS custom, tema oscuro, sin frameworks CSS
* **Testing:** `node:test` (built-in de Node, cero dependencias) sobre la lógica pura en `lib/theremin-core.js`; `npm test`

## 4. Reglas obligatorias

* Nunca exponer claves, tokens o datos sensibles en el código.
* Manejar errores de cámara (NotAllowedError, NotFoundError, NotReadableError) con mensajes claros en español.
* El audio nunca debe saturar: usar GainNode con volumen máximo configurable.
* Cualquier cambio en la cadena de audio debe usar `setTargetAtTime` o `linearRampToValueAtTime` para evitar clicks.

## 5. Testing Guidelines

* Framework: `node:test` + `node:assert/strict` (built-in de Node, sin dependencias externas). Correr con `npm test`.
* La lógica pura (sin DOM/localStorage/Web Audio) vive en `lib/theremin-core.js`, un módulo ES plano que `script.js` importa y que Node puede importar directamente para testear: mapeo (`yToFrequency`, `yToVolume`, `registerFactorFor`), música (`freqToMidi`, `quantizeToSemitone`, `frequencyToNote`), geometría de gestos (`computeHandCurl`, `computePianoHand`, `isPianoChordHand`), handedness (`trueHandedness`, `assignHandSides`, `otherHand`) y la clase `AxisTracker`.
* Al agregar lógica nueva sin dependencias del DOM, extraerla a `lib/theremin-core.js` en vez de definirla inline en `script.js`, para que quede testeable.
* El motor de audio (Web Audio API) y la detección de manos (MediaPipe) no son testeables con `node:test` (requieren navegador); se validan manualmente. Prioridad de cobertura automatizada: la lógica de mapeo y gestos.

## 6. Convenciones de código

* Idioma: español para UI y comentarios cuando sea natural; inglés para nombres de variables/funciones.
* Nombres descriptivos en inglés: `setupCamera`, `applyInstrument`, `computeHandCurl`.
* Constantes en SCREAMING_SNAKE_CASE.
* Funciones auxiliares en camelCase.
* Secciones del archivo separadas con bloques `/* --- */`.

## 7. Git

| Setting | Value |
|---------|-------|
| Auto-commit on session end | Yes |
| Pull before commit | Yes |

## 8. Reglas de modificación del proyecto

* Contexto funcional → [[Proyecto Theremin]]; estado → [[progress]]; historial de decisiones → [[history]].
* Los archivos de gobernanza solo se actualizan después de la aprobación del usuario.
