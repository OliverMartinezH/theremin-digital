# Proyecto Theremin

> **Reglas de desarrollo:** Ver [[AGENTS]]
> **Estado actual:** Ver [[progress]]
> **Historial de decisiones:** Ver [[history]]

---

## Visión

Un theremin virtual web que usa la cámara del dispositivo y detección de manos en tiempo real para controlar tono y volumen con gestos, con visualización generativa reactiva al sonido.

## Objetivo del producto

Permitir a cualquier persona tocar un instrumento musical con las manos frente a la cámara, sin hardware especial, como una experiencia creativa y accesible.

## Actores

* **Usuario intérprete:** Controla tono y volumen con las manos, elige instrumento/onda/acorde, configura parámetros de gesto.
* **Usuario espectador:** Ve la visualización (modo pasivo, futuro).

## Reglas de negocio

* Una mano controla el tono (altura vertical) y la otra el volumen.
* La configuración de qué mano controla qué se guarda en localStorage.
* El gesto de puño silencia el volumen (configurable).
* El modo piano cuantiza notas a semitonos y permite acordes.
* Los instrumentos predefinidos configuran timbre, filtro y vibrato automáticamente.

## Restricciones

* No se usan frameworks pesados (React/Vue).
* No se crean modelos custom de detección de manos.
* Debe funcionar en Chrome/Edge de escritorio como mínimo.
* El audio debe cortarse sin clicks ni saturación.

## Módulos

* **Detección de manos:** MediaPipe Tasks Vision vía CDN.
* **Síntesis de audio:** Web Audio API nativa (OscillatorNode + GainNode + BiquadFilterNode + AnalyserNode).
* **Visualización:** Canvas 2D con requestAnimationFrame, reactiva al AnalyserNode.
* **UI/Config:** HTML/CSS vanilla, tema oscuro, pantallas (loading → setup → play).

## Roadmap

1. MVP funcional (detección + audio + visualización)
2. Mejoras UX (config avanzada, registros, instrumentos)
3. Modo piano con acordes
4. Testing y pulido
