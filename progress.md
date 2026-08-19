# Theremin — Progress Log

> **History:** Ver [[history]]
> **Rules:** Ver [[AGENTS]]
> **Project map:** Ver [[Proyecto Theremin]]

---

## 1. Project Status

* **Project:** Theremin (HTML/CSS/JS vanilla + MediaPipe + Web Audio)
* **Current Phase:** Core implementation
* **Last milestone:** MVP funcional completo

---

## 2. Implementation Checklist

### Phase 0: Infraestructura
- [x] **0.1.** Crear estructura del proyecto (index.html, style.css, script.js)
- [x] **0.2.** Configurar servidor estático local

### Phase 1: Detección de manos
- [x] **1.1.** Integrar MediaPipe Tasks Vision via CDN
- [x] **1.2.** Implementar setup de cámara con manejo de errores
- [x] **1.3.** Detección de ambas manos con handedness

### Phase 2: Motor de audio
- [x] **2.1.** Cadena de audio: OscillatorNode → GainNode → Filter → Analyser → MasterGain
- [x] **2.2.** Mapeo Y → frecuencia y Y → volumen
- [x] **2.3.** Selector de forma de onda (sine, square, sawtooth, triangle)
- [x] **2.4.** Sistema de instrumentos predefinidos (theremin, otamatone, synthlead, organ, strings, choir, flauta, campana) con `mainGain` por preset
- [x] **2.5.** Modo piano con acordes (mayor, menor, 7ª, sus4, quinta)
- [x] **2.6.** Registro por instrumento (grave/normal/agudo)
- [x] **2.7.** Gesto de puño para silenciar con velocity detection
- [x] **2.8.** Cadena de efectos (eco, flanger, reverb) con buses dry/wet

### Phase 3: UI y UX
- [x] **3.1.** Pantalla de loading con spinner
- [x] **3.2.** Pantalla de error con mensajes claros
- [x] **3.3.** Pantalla de setup (configuración de manos)
- [x] **3.4.** Pantalla de juego con overlay de manos
- [x] **3.5.** Panel de configuración avanzada (suavizado, frecuencias, umbrales)
- [x] **3.6.** Barra de controles (instrumento, registro didáctico, volumen, mute, sensibilidad, intercambio de mano de tono)
- [x] **3.7.** Persistencia de todas las configuraciones en localStorage
- [x] **3.8.** Drawer: grupo "Modo de juego" (modo, onda, acorde) + grupo "Efectos" (eco, flanger, reverb)
- [x] **3.9.** Drawer: grupo "🖐️ Instrucciones" con los gestos básicos (tono/volumen, puño, acorde en piano, auto-mute, calibración)

### Phase 4: Visualización
- [x] **4.1.** Canvas generativo reactivo al AnalyserNode
- [x] **4.2.** Onda circular con color según frecuencia (cyan → magenta)
- [x] **4.3.** Centro pulsante según amplitud

### Phase 5: Testing y pulido
- [x] **5.1.** Definir framework de testing (`node:test`, cero dependencias, `npm test`)
- [x] **5.2.** Tests unitarios para funciones de mapeo (`yToFrequency`, `yToVolume`, registro, música/MIDI)
- [x] **5.3.** Tests para lógica de gestos (`computeHandCurl`, `computePianoHand`, `isPianoChordHand`, handedness, `AxisTracker`)
- [ ] **5.4.** Testing cross-browser (Chrome, Edge, Firefox)

---

## 3. Recent Iterations

* MVP funcional completo: detección de manos, 6 instrumentos, modo piano con acordes, visualización generativa, configuración avanzada.
* Título de la app cambiado a "Theremin Digital".
* Pantalla de setup rediseñada: imágenes de manos separadas (assets/mano-izq.png, assets/mano-der.png) con iconos de tono/volumen y botón ⇄ para intercambiar roles.
* Modo claro/oscuro con toggle 🌙/☀️ en la topbar, persistencia en localStorage.
* Paleta de colores refinada: modo oscuro (slate-900 base, acentos magenta/cyan) y modo claro (slate-50 base, teal/blue).
* Sección de video agrandada (760px setup, 860px play).
* Botón "Comenzar a tocar" en azul (accent-volume) con hover legible en ambos temas.
* Botón 🖐️ "Reconfigurar manos" agregado a la barra inferior de controles.
* Botón ⇄ de intercambio centrado verticalmente y más visible.
* Imágenes de mano con borde sutil redondeado.
* Controles de sensibilidad (sensPos/sensResp) en la barra inferior: escalan el rango de movimiento y la velocidad de respuesta; persistidos en `theremin_gesture_config`.
* Barra superior simplificada: solo título + tema 🌙/☀️. Eliminados `btn-config` y `btn-reconfigure`.
* `screen-config` reemplazada por drawer lateral (⚙️ en barra inferior); `closeDrawer()` al cambiar de pantalla.
* Bug corregido: código de drawer y sliders de sensibilidad anidado por error dentro del handler de `btnConfigReset` (rompía ⚙️ y sliders hasta pulsar "Restablecer").
* Gesto de puño corregido: corte sostenido en 0 mientras el puño está cerrado (antes el `openness` residual dejaba un zumbido tras el `hardMute`); detección de snap con velocidad cruda + suavizada.
* Release continuo del puño: `releaseFactor = (fistOff - curl) / fistOff`, el volumen vuelve desde 0 en proporción a la apertura, sin salto.
* Anticipación/inercia por velocidad: clase `AxisTracker` (OOP, DRY) compartida por tono y volumen — EMA de posición + EMA de velocidad, proyecta `position + velocity × anticipation`. Asentamiento suave al frenar. Toggle habilitar + slider (0–500 ms) en el drawer, persistidos en `theremin_gesture_config`.
* Menús reorganizados: barra inferior queda con instrumento, registro didáctico (barras de colores grave=amarillo / normal=verde / agudo=rojo), volumen máx., sensibilidad, mute e intercambio de mano de tono; onda, acorde y modo se mueven al drawer (grupo "Modo de juego").
* Botón 🤚/✋ intercambia la mano de tono en vivo (persistido en `theremin_hand_config`); ya no redirige a setup.
* Efectos en vivo (grupo "Efectos" del drawer): Eco (delay + feedback + filtro), Flanger (LFO modulando un delay corto) y Reverb (convolver con impulso generado por tamaño). Nodos creados una sola vez en `init`; mezcla dry/wet con ramps (sin clicks). Persistidos en `theremin_effects`.
* Instrumentos: rebalanceo de ganancia (`mainGain` por preset, main + unison ≈ 1.0) para evitar clipping; nuevos presets Flauta y Campana.
* Drawer redimensionable: ancho por defecto aumentado a 460px y handle de arrastre en el borde izquierdo (Pointer Events con `setPointerCapture`, clamp 340–720px / 90vw); ancho persistido en `theremin_drawer_width`.
* Link de donación (chanchito): grupo "🐷 Sobre" al final del drawer con link fijo a Mercado Pago (`https://link.mercadopago.cl/olivermartinez`), `target="_blank"` + `rel="noopener noreferrer"`, sin tracking/UTM.
* Botón ⚙️ Opciones en pantalla de setup que abre el drawer; separación de botones en setup; fix de hover del botón "Comenzar a tocar" en tema claro (texto oscuro sobre fondo claro).
* Loading colgada: timeout de 25 s en `boot()` → pantalla de error con mensaje claro y botón "Reintentar" (nunca más spinner infinito); marcas `[boot]` paso a paso en consola; versión visible en consola y en el grupo "🐷 Sobre" (`APP_VERSION`); cache-busting `?v=` en `script.js` y `style.css`.
* Causa raíz de la loading colgada: HTML en caché del navegador desactualizado (sin el handle del drawer) + `script.js` nuevo → `el.drawerResizeHandle` null → `TypeError` que abortaba el módulo antes de `boot()`. Fix: guards de elementos opcionales en todo el código nuevo (degrada con gracia ante HTML viejo).
* Drawer en acordeones: grupos plegables con chevron ▾ (Tono, Volumen, Anticipación, Modo de juego, Efectos, Puño), uno abierto a la vez, estado persistido en `theremin_config_accordion`; "🐷 Sobre" y "Restablecer valores" siempre visibles.
* Fix gesto de puño deshabilitado: al desactivar "Habilitar gesto", cerrar la mano ya no silencia (se eliminó el factor `openness` en el branch deshabilitado; antes el volumen se iba a ~0 igual).
* Volumen sostenido: si la mano de volumen sale de cámara, el volumen queda en su último valor en vez de silenciarse; el volumen ya no depende de que ambas manos estén presentes.
* Refactor KISS/DRY: helpers `otherHand()` y `axisOpts()`; `frequencyToNote` reusa `freqToMidi`; listeners de efectos data-driven (tabla); eliminado estado muerto `smoothedY.volume`; simplificado ternario de color redundante.
* Handedness (causa raíz): según la doc oficial, MediaPipe asume imagen espejada (selfie) para la lateralidad; como alimentamos el frame crudo sin espejar, los labels salían intercambiados. `trueHandedness` ahora invierte el label para que `hands.left` = mano izquierda anatómica.
* Licencia GPLv3 (skill `licencia`): archivo `LICENSE` con el texto GPLv3 verbatim en la raíz + bloque "Acerca de/Licencia" en el grupo "🐷 Sobre" (descripción, copyright © 2026 Oliver Martinez, aviso corto en español + texto legal en inglés con scroll y link a gnu.org, `target="_blank"` + `rel="noopener noreferrer"`).
* Framework de testing definido (`node:test` + `npm test`, cero dependencias); lógica pura movida a `lib/theremin-core.js` (mapeo Y→frecuencia/volumen, música/MIDI, geometría de gestos, handedness, `AxisTracker`) e importada desde `script.js`; 43 tests unitarios en `test/theremin-core.test.js`.
* Revisión completa de código: 2 bugs corregidos — handle de redimensionar el drawer sin `id` (el arrastre nunca funcionaba) y texto "Invertir eje Y" mostrando la dirección opuesta a la real en tono/volumen — más una inconsistencia (cambio de registro en modo piano no cuantizaba/retonaba el acorde).
* Botón de preajustes: nueva sección "💾 Preajustes" en el drawer para guardar/cargar/eliminar configuraciones completas con nombre, persistidas en `theremin_presets`.
* Bug crítico corregido (reportado desde la consola del usuario): `audio.tuneChord()` producía `NaN` para cualquier acorde de menos de 4 notas (todos salvo "7ª"), rompiendo el audio por completo en modo piano con el acorde por defecto (Mayor). Lógica extraída a `chordVoiceFrequencies()` en `lib/theremin-core.js` con tests de regresión.
* Versión visible en la topbar: badge `v1.2.6` junto al título, siempre visible (independiente del drawer/pantalla activa).
* Drawer de configuración: ahora reserva espacio (`padding-right` vía `--drawer-space`) al abrirse/redimensionarse, para que el recuadro de cámara se desplace/encoja en vez de quedar tapado por el drawer superpuesto.
* Limitador (`DynamicsCompressorNode`) agregado antes del destino de audio para evitar clipping duro ("chicharreo") cuando se combinan volumen alto, ondas cuadrada/sierra y efectos con mezcla alta.
* Mano izquierda que "se pierde": `assignHandSides()` ahora usa continuidad de posición (no el clasificador de MediaPipe) para la mano solitaria cuando solo una está en cuadro; umbrales de confianza de `HandLandmarker` bajados de 0.5 a 0.3.
* "Chicharreo" específico de modo piano: `strikeKey()` ya no salta instantáneo (rampa + debounce de 70ms) y la transición acorde→nota simple usa `tuneChord(freq, [0])` en vez de `setFrequency()`, para no dejar voces del acorde anterior sonando fuera de tono.
* Calibración inicial de manos: barra de progreso + texto de estado informativos en el setup (vía `calibrationStatus()`), pero **ya no bloquean** "Comenzar a tocar" — bloquearlo dejaba a cualquiera con detección imperfecta sin poder arrancar la app; revertido tras reportarse dos veces.
* Mano de tono por defecto: ahora "right" en vez de "left" (`state.toneHand`), solo afecta cuando no hay preferencia guardada en localStorage.
* Dos registros combinados nuevos: "Grave-Normal" y "Normal-Agudo", que amplían el rango de tono (abarcan dos bandas) en vez de solo desplazarlo una octava.
* Orden del drawer: "Acerca de" ahora es el último grupo, justo antes de "Restablecer valores" (antes iba "Licencia" al final).
* Bug real corregido: `assignHandSides()` con 2 manos detectadas tenía izquierda/derecha invertidos (contradecía la propia lógica de `trueHandedness()` en el mismo archivo) — causaba que el rol tono/volumen quedara pegado a la mano física equivocada.
* Efectos en mini-acordeón: cada efecto colapsado por defecto (solo nombre + switch); un header separado expande/colapsa los parámetros sin afectar el switch.
* Nuevo botón 🎯 "Volver a calibrar manos" en la barra inferior: vuelve al setup y limpia el estado de calibración/continuidad de posición.
* Calibración de "mis límites": botón en el setup que registra 6s el alcance cómodo real de cada mano (no las esquinas de la pantalla) y remapea el control de tono/volumen a ese rango personal (`remapToRange()`, `handRanges` en `theremin_hand_ranges`).
* Detección de orientación de mano (`palmFaceOn()`, desde `worldLandmarks` 3D): atenúa el suavizado de posición y avisa visualmente (esqueleto ámbar) cuando una mano se acerca a quedar perpendicular a la cámara, el punto débil de tracking reportado.
* Presets como archivo: botones "Exportar"/"Importar" en el grupo Preajustes, descarga/carga un JSON — complementa el guardado automático en localStorage con algo portátil entre navegadores/equipos.
* Preajustes conocidos por efecto (`FX_PRESETS`): Slapback/Clásico/Dub (Eco), Sutil/Clásico/Intenso (Flanger), Habitación/Sala/Catedral (Reverb) — valores investigados y mapeados a los rangos de sliders existentes.
* Bug corregido: volver a la pantalla de setup (botón "Volver a calibrar manos") dejaba un tono sonando indefinidamente — `showScreen()` ahora silencia el audio (`hardMute()`) al salir de "play" hacia cualquier otra pantalla.
* Publicado: GitHub Pages en https://olivermartinezh.github.io/theremin-digital/ y link agregado al portafolio (olivermartinezh.github.io), con capturas propias claro/oscuro.
* Silenciado automático por inactividad: si no se detecta ninguna mano por 8s en la pantalla de juego, se silencia (evita que quede sonando el último valor sostenido si el usuario se aleja).
* Apagado por abandono "divertido": desde el segundo 3 sin manos, tono y volumen bajan juntos con un glide ease-in (~3 octavas) hasta el silencio a los 8s, en vez de sostener y cortar de golpe.
* Grupo "🖐️ Instrucciones" agregado al drawer (primero, mismo patrón de acordeón): lista de gestos básicos — mano de tono/volumen + botón ⇄, puño = mute, postura de acorde en modo piano, auto-mute por inactividad, "Calibrar mis límites".

---

## 4. Next Immediate Step

> [!tip] Handoff (2026-08-18, fin de sesión)
> **Estado:** grupo "🖐️ Instrucciones" implementado en el drawer (`APP_VERSION` → `1.13.0`, cache-busting `?v=20260818z7`); pendiente de commit/push. `npm test` → 71/71 pasan. GitHub Pages en vivo en https://olivermartinezh.github.io/theremin-digital/ (aún en `v1.12.0` hasta el próximo push). Link agregado al portafolio (`olivermartinezh.github.io`, commit `993e1ea`).
>
> **Pendiente, sin decidir todavía (preguntar al usuario al retomar):**
> - Fusionar en vez de sobreescribir al correr "Calibrar mis límites" más de una vez (ver historial 2026-08-18, sección "podríamos aumentar la calibración a 2 veces") — evaluado, no implementado, esperando que el usuario confirme si lo quiere.
> - `handRanges` (calibración de límites) captura rango horizontal (X) por mano pero no lo aplica a ningún control todavía — no existe un eje horizontal continuo en la app hoy. Queda documentado por si surge un uso futuro.
>
> **Descartado explícitamente (no reabrir sin nueva razón):** backend Supabase para preajustes compartidos (rompe el "sin backend" del proyecto); detección por antebrazo/pose (`PoseLandmarker`/`HolisticLandmarker`, ver historial) — doble costo de inferencia sin ganancia real sobre lo que ya hay; librería `ruview` (WiFi CSI, hardware distinto, no aplica a un stack basado en cámara).
>
> **Backlog más antiguo, todavía válido:** Phase 5.4 — testing cross-browser manual (Chrome, Edge, Firefox); la lógica core ya tiene cobertura unitaria automatizada, falta solo la verificación manual en navegadores reales.
