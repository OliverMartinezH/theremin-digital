# Theremin — Completed Phases History

> **Current status:** Ver [[progress]]
> **Rules:** Ver [[AGENTS]]

---

> [!note] Accumulative file
> This file records all completed phases with date and time.
> It is automatically updated when a phase is completed in [[progress]].

---

*No phases completed yet.*

---

## 2026-08-18 — UI Rediseño y Tematización

- Título cambiado a "Theremin Digital"
- Setup rediseñado con imágenes de manos + iconos tono/volumen + botón ⇄ intercambiable
- Modo claro/oscuro con toggle y persistencia
- Paleta de colores refinada (slate base, magenta/cyan acentos)
- Video agrandado en ambas pantallas
- Botón reconfigurar agregado a barra inferior
- Pulido visual: bordes en imágenes, hover states, centrado de controles

## 2026-08-18 — Sensibilidad y reorganización de barras

- Controles de sensibilidad (Posición y Respuesta) en la barra inferior, persistidos en `theremin_gesture_config`
- Barra superior simplificada: solo título + tema; eliminados botones de configuración y reconfigurar
- `screen-config` reemplazada por drawer lateral de configuración (⚙️ en barra inferior)
- Drawer se cierra automáticamente al cambiar de pantalla; "Restablecer valores" sigue disponible
- Bug corregido: drawer y sliders de sensibilidad anidados dentro del handler de `btnConfigReset`
- `opencode.json` del proyecto deshabilita el MCP `robloxstudio-mcp` (requiere reiniciar opencode)

## 2026-08-18 — Gesto de puño pulido y Anticipación (inercia)

- Gesto de puño: corte instantáneo sostenido (volumen exacto 0 mientras cerrado), detección de snap fiable y release continuo sin salto al abrir
- Nueva clase `AxisTracker` (OOP, DRY): anticipación por velocidad de la mano aplicada a tono y volumen (`position + velocity × anticipation`)
- Asentamiento suave al frenar la mano; toggle habilitar + slider de anticipación (0–500 ms) en el drawer (⚙️)
- Persistencia de los nuevos parámetros en `theremin_gesture_config`

## 2026-08-18 — Menús reorganizados, efectos y presets rebalanceados

- Barra inferior simplificada: instrumento, registro didáctico (barras de colores grave/normal/agudo), volumen máx., sensibilidad, mute y botón de intercambio de mano de tono
- Onda, acorde y modo de juego movidos al drawer (grupo "Modo de juego"); mute se queda en la barra
- Botón 🤚/✋ intercambia la mano de tono en vivo (persistido en `theremin_hand_config`)
- Nueva cadena de efectos en el drawer: Eco (delay con feedback), Flanger (LFO sobre delay corto) y Reverb (convolver con impulso generado); nodos reutilizados, mezcla dry/wet con ramps sin clicks, persistidos en `theremin_effects`
- Instrumentos: rebalanceo de ganancia con `mainGain` por preset (evita clipping main+unison); nuevos presets Flauta y Campana

## 2026-08-18 — Drawer redimensionable, chanchito y setup

- Drawer de configuración: ancho por defecto 460px y handle de arrastre en el borde izquierdo (Pointer Events, clamp 340–720px / 90vw), ancho persistido en `theremin_drawer_width`
- Link de donación (chanchito): grupo "🐷 Sobre" en el drawer con link fijo a Mercado Pago, `target="_blank"` + `rel="noopener noreferrer"`, sin tracking/UTM
- Botón ⚙️ Opciones en la pantalla de setup que abre el drawer de configuración antes de comenzar a tocar; separación entre botones
- Fix: hover del botón "Comenzar a tocar" en tema claro (texto se volvía invisible; ahora oscuro sobre fondo claro)

## 2026-08-18 — Robustez de carga, acordeones, KISS/DRY, handedness y licencia GPLv3

- Loading colgada: timeout de 25 s en `boot()` con pantalla de error y "Reintentar"; marcas `[boot]` en consola; versión en consola y en el grupo "Sobre"; cache-busting `?v=` en `script.js` y `style.css`
- Causa raíz de la loading colgada: HTML cacheado sin el handle del drawer + `script.js` nuevo → `TypeError` (`el.drawerResizeHandle` null) que abortaba el módulo antes de `boot()`; guards de elementos opcionales en todo el código nuevo (degradación con gracia)
- Drawer de configuración en acordeones: grupos plegables con chevron ▾, uno abierto a la vez, estado persistido en `theremin_config_accordion`
- Fix gesto de puño deshabilitado: al desactivar "Habilitar gesto", cerrar la mano ya no atenúa el volumen (eliminado el factor `openness` en el branch deshabilitado)
- Volumen sostenido: si la mano de volumen sale de cámara, el volumen queda en su último valor en vez de silenciarse; el volumen depende solo de su propia mano
- Refactor KISS/DRY: `otherHand()`, `axisOpts()`, `frequencyToNote` reusa `freqToMidi`, listeners de efectos data-driven, eliminado estado muerto `smoothedY.volume`
- Handedness (causa raíz): MediaPipe asume imagen espejada; con el frame crudo los labels de lateralidad salen intercambiados → `trueHandedness` invierte el label para que `left` = mano izquierda anatómica
- Licencia GPLv3 aplicada con el skill `licencia`: `LICENSE` verbatim en la raíz + bloque "Acerca de/Licencia" en el grupo "🐷 Sobre"

## 2026-08-18 — Phase 5: framework de testing + 3 bugs corregidos

- Framework de testing definido: `node:test` (built-in, cero dependencias). `package.json` con `"type": "module"` y script `npm test`
- Lógica pura extraída a `lib/theremin-core.js` (sin DOM/localStorage/Web Audio) para poder testearla: `yToFrequency`, `yToVolume`, `registerFactorFor`, `freqToMidi`/`quantizeToSemitone`/`frequencyToNote`, `computeHandCurl`/`computePianoHand`/`isPianoChordHand`, `trueHandedness`/`assignHandSides`/`otherHand`, la clase `AxisTracker`, `CHORDS`; `script.js` ahora importa desde este módulo (elimina duplicación)
- `test/theremin-core.test.js`: 43 tests unitarios cubriendo mapeo Y→frecuencia/volumen, música (MIDI/notas), geometría de gestos (curl, spread, piano hand), handedness y `AxisTracker` (suavizado, anticipación, coast, reset)
- **Bug corregido:** handle de redimensionar el drawer (`.drawer-resize-handle`) tenía `class` pero no `id` en `index.html`; `script.js` buscaba `getElementById("drawer-resize-handle")` y fallaba en silencio (guard `if (el.drawerResizeHandle)`) — el arrastre para redimensionar nunca funcionó. Corregido agregando el `id`
- **Bug corregido:** el texto informativo "Invertir eje Y" (tono y volumen) mostraba la dirección invertida respecto al comportamiento real de `yToFrequency`/`yToVolume` — con la configuración por defecto (no invertido), subir la mano sube el tono/volumen ("Arriba = agudo/alto"), pero la UI mostraba "Abajo = agudo/alto" en ambos estados del toggle. Corregido en `script.js` (`updateConfigReadouts`) y en el texto estático de `index.html`
- **Inconsistencia corregida:** cambiar de registro (grave/normal/agudo) mientras se está en modo piano no cuantizaba a semitono ni retocaba el acorde (usaba `setFrequency` crudo); ahora `changeRegister` reutiliza la misma cuantización y `tuneChord`/`setFrequency` según corresponda
- Cache-busting de `script.js` en `index.html` actualizado a `?v=20260818j`; `APP_VERSION` a `1.2.4 (2026-08-18)`

## 2026-08-18 — Botón de preajustes + fix crítico de `tuneChord`

- Nueva sección "💾 Preajustes" en el drawer: input de nombre + botón "Guardar" para persistir la configuración completa (tono, volumen, efectos, instrumento, registro, modo, acorde, mano) en `localStorage` (`theremin_presets`); lista de preajustes con "Cargar" y 🗑️ (con confirmación); overwrite también pide confirmación. Verificado end-to-end con Playwright (guardar → persiste tras reload → cargar → eliminar), sin errores de consola.
- **Bug crítico corregido (reportado por consola del usuario):** `audio.tuneChord()` asumía 4 notas en la voz del acorde; para cualquier acorde con menos de 4 notas (Mayor, Menor, Sus4, Quinta — todos excepto "7ª") `voicing[i]` era `undefined` para las voces sobrantes, y `undefined / 12` → `NaN` → `AudioParam.setTargetAtTime` lanzaba `TypeError: ...non-finite` en cada frame (bucle `loop()`), rompiendo el audio por completo en modo piano con el acorde por defecto (Mayor). Corregido: las voces sin nota en la voicing ahora se saltan (su ganancia ya se pone en 0) en vez de calcular una frecuencia inválida
- Lógica de mapeo acorde→osciladores extraída a `chordVoiceFrequencies()` en `lib/theremin-core.js` (pura, testeable); 4 tests de regresión nuevos que verifican que ningún acorde de `CHORDS` produce `NaN`
- `APP_VERSION` a `1.2.5 (2026-08-18)`; cache-busting a `?v=20260818l`

## 2026-08-18 — Versión visible en la topbar

- Badge de versión (`v1.2.6`) siempre visible junto al título en la topbar, independiente de la pantalla activa; tooltip con la fecha completa. El texto largo "Versión X (fecha)" en el grupo "🐷 Sobre" del drawer se mantiene igual
- `APP_VERSION` a `1.2.6 (2026-08-18)`; cache-busting a `?v=20260818m`

## 2026-08-18 — El drawer de configuración ahora reserva espacio (reflow del recuadro de cámara)

- Antes, el drawer (`position: fixed`) simplemente se superponía al contenido sin que el layout reaccionara: al abrirlo o agrandarlo, tapaba directamente el recuadro de la cámara/visualización en vez de cederle espacio
- Ahora `.screen` reserva `padding-right` igual al ancho vivo del drawer (variable CSS `--drawer-space`, actualizada en `openDrawer`/`closeDrawer`/`applyDrawerWidth`): el layout centrado se desplaza a la izquierda consumiendo primero su propio margen libre; solo si no queda margen, el recuadro de cámara se encoge (mantiene `aspect-ratio`)
- Sincronizado en vivo durante el arrastre del handle (sin transición, 1:1 con el mouse vía clase `body.drawer-resizing`); transición suave (0.3s) al abrir/cerrar con los botones
- Verificado con Playwright: con el drawer cerrado el recuadro mide 860px de ancho; abierto al ancho por defecto (460px) se desplaza a la izquierda sin encogerse; arrastrado al máximo (720px) se encoge a 640×480 preservando el aspect-ratio 4:3
- `APP_VERSION` a `1.2.7 (2026-08-18)`; cache-busting a `?v=20260818n`

## 2026-08-18 — Renombrado "Sobre" → "Acerca de"

- Grupo del drawer renombrado de "🐷 Sobre" a "ℹ️ Acerca de" (el emoji 🐷 se reserva para el link de donación "Dona en Mercado Pago", que no cambia); actualizado también el filtro de `setupDrawerAccordions()` que mantiene este grupo siempre expandido (antes buscaba el texto "Sobre", ahora "Acerca de")
- `APP_VERSION` a `1.2.8 (2026-08-18)`; cache-busting a `?v=20260818o`

## 2026-08-18 — Licencia en su propio acordeón

- El bloque legal completo (GPLv3 en inglés, antes fijo dentro de "Acerca de") se movió a un nuevo grupo colapsable "📜 Licencia", con su propio chevron ▾ como el resto de los grupos del drawer
- "ℹ️ Acerca de" queda más corto: versión, link de donación, descripción, copyright y aviso corto de licencia; sigue siempre visible (no colapsable), igual que antes
- Cambio solo de HTML (reutiliza clases CSS/JS existentes); sin cambios en `script.js`/`style.css`, sin bump de versión

## 2026-08-18 — Limitador para evitar el "chicharreo" (clipping)

- Reportado: el sonido se escuchaba "chicharriento" (distorsión/crackle). Causa: la cadena de audio no tenía ningún limitador — la señal dry (siempre a ganancia 1) más los tres sends de efectos (eco/flanger/reverb, cada uno hasta 0.9 de mezcla) se sumaban de forma aditiva en `masterGain` sin control de headroom, y varios filtros resonantes (ej. Otamatone Q=5) pueden superar la ganancia unitaria en su frecuencia de resonancia — con volumen alto, ondas cuadrada/sierra e efectos activos era fácil superar 0dBFS y producir clipping duro en el destino
- Fix: `DynamicsCompressorNode` (`this.limiter`) insertado entre `masterGain` y `analyser`/destino, actuando como limitador (threshold -6dB, knee 0, ratio 20:1 —el máximo permitido por la spec—, attack 3ms, release 250ms; parámetros verificados contra la spec vía context7). Convierte el clipping duro en compresión suave, sin cambiar el timbre de los presets en uso normal
- Probado bajo el peor caso (instrumento Personalizado + onda cuadrada + volumen máx. 100% + eco/flanger/reverb al 90% de mezcla simultáneamente): sin errores de audio
- `APP_VERSION` a `1.2.9 (2026-08-18)`; cache-busting a `?v=20260818p`

## 2026-08-18 — Mano izquierda "se pierde": detección más permisiva + continuidad por posición

- Reportado: la mano izquierda se pierde seguido (la derecha siempre se mantiene); se corrige acercando las dos manos; funciona mejor del lado derecho de la cámara
- Pista clave del reporte: "se corrige acercando las manos" → con 2 manos detectadas, `assignHandSides()` ya ignoraba el clasificador de lateralidad de MediaPipe y usaba posición horizontal (robusto); con solo 1 mano visible, en cambio, dependía de `trueHandedness(modelLabel)` (el clasificador de MediaPipe, pensado para entrada espejada — con nuestro feed sin espejar es notablemente menos confiable para una sola mano aislada). Es probable que la mano no se "perdiera" sino que se **reasignara mal** al lado equivocado cuando quedaba sola en cuadro
- Fix 1: `assignHandSides()` ahora recibe la última posición horizontal conocida de cada lado (`prior`) y, si hay una sola mano detectada, la asigna por **continuidad de posición** (vecino más cercano) en vez de por el clasificador — solo cae al clasificador si todavía no se conoce la posición de ambos lados (ej. al arrancar). `state.lastPalmX` nuevo, actualizado en cada frame donde un lado tiene mano
- Fix 2: `HandLandmarker` usaba los umbrales de confianza por defecto de MediaPipe (0.5 para detección/presencia/tracking — pensados para imagen estática bien iluminada). Bajados a 0.3 los tres (`minHandDetectionConfidence`, `minHandPresenceConfidence`, `minTrackingConfidence`, verificados contra la spec vía context7) para que una mano parcialmente fuera de cuadro o con menor confianza no desaparezca tanto
- 3 tests de regresión nuevos para la continuidad por posición en `assignHandSides` (50/50 tests pasan)
- El sesgo "funciona mejor del lado derecho de la cámara" probablemente es del hardware/modelo (FOV, iluminación) y no algo corregible desde este código
- `APP_VERSION` a `1.3.0 (2026-08-18)`; cache-busting a `?v=20260818q`

## 2026-08-18 — "Chicharreo" específico del modo piano (dos causas)

- Reportado: sigue sonando chicharriento, pero puntualmente en modo piano (el limitador general ya estaba puesto). Dos causas encontradas en la lógica de piano, no en la cadena de ganancia:
  1. `strikeKey()` reinicia el envelope con un salto instantáneo (`setValueAtTime(0.0001, now)`) cada vez que la mano cruza a un semitono nuevo — y durante un barrido continuo eso pasa muchas veces por segundo, produciendo una ráfaga de clicks (= chicharreo). Fix: ancla en el valor actual y rampea (8 ms abajo + 20 ms arriba) en vez de saltar; además, nuevo debounce `maybeStrikeKey()` (mínimo 70 ms entre golpes) para que un barrido rápido no reintente el ataque en cada semitono — la frecuencia sigue glisando cuadro a cuadro igual, solo se limita el reataque de amplitud
  2. Bug más severo: al pasar de "acorde" (mano abierta/extendida) a "nota simple" en modo piano, el código usaba `audio.setFrequency()`, que solo toca la frecuencia de osc1/osc2 y **nunca las ganancias** de oscGain2/3/4 — dejaba sonando indefinidamente la voz sobrante del último acorde (ej. la 3ª o 5ª) a una altura ya desactualizada, disonando contra la nota nueva. Fix: nota simple ahora usa `audio.tuneChord(freq, [0])`, que sí recalcula las 4 ganancias cada vez (reutiliza `chordVoiceFrequencies`, ya cubierto por tests) — aplicado tanto en `updatePlayAudio()` como en `changeRegister()`
- 1 test de regresión nuevo para la voz única `[0]` en `chordVoiceFrequencies` (51/51 tests pasan)
- Probado con Playwright: ciclos rápidos de acorde/registro/instrumento/modo piano en secuencia, sin errores
- `APP_VERSION` a `1.3.1 (2026-08-18)`; cache-busting a `?v=20260818r`

## 2026-08-18 — Calibración inicial de manos en la pantalla de setup

- Antes, "Comenzar a tocar" se habilitaba de inmediato al llegar a la cámara, sin importar si se detectaba alguna mano; `state.lastPalmX` (usado para la continuidad de posición de `assignHandSides`, ver fix anterior de la mano izquierda) podía arrancar sin ningún dato
- Ahora exige mantener **ambas manos visibles 1.5s continuos** antes de habilitar el botón: `calibrationStatus()` (pura, testeable, en `lib/theremin-core.js`) decide el texto de estado y el progreso 0-1 según cuántas manos hay y cuánto tiempo llevan sostenidas; `updateSetupCalibration()` en `script.js` aplica eso al DOM (texto, barra de progreso nueva `#calib-progress`, y `disabled` del botón). Una vez calibrado queda "pegado" (`state.calibration.done`) por el resto de la sesión
- Barra de progreso visual nueva bajo el texto de estado (`.calib-progress`/`.calib-progress-fill`, usa el color `--ok` ya definido pero sin uso hasta ahora)
- 6 tests de regresión nuevos para `calibrationStatus` (57/57 tests pasan)
- Verificado con Playwright: sin manos reales (dispositivo de cámara falso), "Comenzar a tocar" permanece deshabilitado indefinidamente (antes se habilitaba igual) — confirma que el gate funciona
- `APP_VERSION` a `1.4.0 (2026-08-18)`; cache-busting a `?v=20260818s`

## 2026-08-18 — Revertido el bloqueo de "Comenzar a tocar"; mano de tono por defecto = derecha

- Reportado: el botón "Comenzar a tocar" quedaba deshabilitado (dos veces seguidas, incluso tras un primer intento de hacerlo más tolerante con un "leaky bucket" en vez de reset estricto en cada frame sin las dos manos). Decisión: la calibración **nunca debe bloquear** el botón — la calidad de detección varía demasiado por cámara/iluminación como para condicionar el arranque de la app a eso
- `afterCameraReady()` vuelve a habilitar el botón de inmediato; `updateSetupCalibration()` ya no toca `btnStart.disabled`, solo actualiza el texto de estado y la barra de progreso (informativos, no bloqueantes) — sigue alimentando `state.lastPalmX` en segundo plano para la continuidad de posición de `assignHandSides`
- Eliminado el enlace "Continuar sin calibrar" (`#btn-calib-skip`) y `CALIBRATION_SKIP_AFTER_MS`: ya no tienen sentido si el botón nunca se bloquea
- `calibrationStatus()` en `lib/theremin-core.js` y sus tests no cambiaron (la lógica de progreso/texto sigue siendo válida, solo dejó de gatear el botón)
- Mano de tono por defecto cambiada de "left" a "right" en `state.toneHand` (`loadHandConfig() || "right"`) — solo afecta instalaciones nuevas / sin `theremin_hand_config` guardado; si ya tenías una preferencia guardada en este navegador, un clic en ⇄ (setup) o 🤚/✋ (barra de juego) la deja en "right" de forma persistente
- Verificado con Playwright: con cero manos detectadas todo el tiempo, el botón queda habilitado desde el primer instante y se llega a la pantalla de juego sin bloqueos
- `APP_VERSION` a `1.4.2 (2026-08-18)`; cache-busting a `?v=20260818u`

## 2026-08-18 — Dos registros combinados (Grave-Normal, Normal-Agudo) + orden del drawer

- Nuevos registros "Grave-Normal" y "Normal-Agudo": en vez de solo desplazar el rango una octava entera (como grave/normal/agudo), abarcan desde el extremo grave de una banda hasta el extremo agudo de la siguiente — el rango de tono se AMPLÍA (4 octavas en vez de las 3 originales) en lugar de solo desplazarse
- Para esto, `REGISTER_OCTAVES` (un solo shift por registro) se reemplazó por `REGISTERS` (`minOctaves`/`maxOctaves` independientes por registro) en `lib/theremin-core.js`; `registerFactorFor()` → `registerFactors()` devuelve `{minFactor, maxFactor}` en vez de un solo factor; `yToFrequency()` recibe `minFactor`/`maxFactor` en vez de `registerFactor` único (mismo resultado que antes cuando ambos factores son iguales — sin regresión para grave/normal/agudo)
- Barras nuevas en la UI (`#register-bars`) con degradado de color entre las dos bandas que combinan, intercaladas: Grave, Grave-Normal, Normal, Normal-Agudo, Agudo
- 5 tests de regresión nuevos para `registerFactors` (61/61 tests pasan)
- Orden del drawer: "📜 Licencia" pasa a ir antes que "ℹ️ Acerca de", que ahora queda como el último grupo, justo antes del botón "Restablecer valores"
- `APP_VERSION` a `1.5.0 (2026-08-18)`; cache-busting a `?v=20260818v`

## 2026-08-18 — Bug real: `assignHandSides` con 2 manos tenía izquierda/derecha invertidos

- Reportado: con tono seleccionado en la mano derecha, la app "lo dibuja" (comportamiento/etiqueta) en la izquierda
- Causa raíz confirmada por geometría: una cámara que mira al usuario ve las cosas igual que otra persona que lo mira de frente — si el usuario levanta su mano DERECHA real, en el frame crudo (sin espejar) esa mano cae del lado de **x pequeño** (izquierda de la imagen), igual que la mano derecha de alguien que te mira de frente aparece a TU izquierda. El comentario/código anterior de `assignHandSides()` (rama de 2 manos) asumía exactamente lo contrario ("el lado izquierdo de la imagen es la mano izquierda anatómica"), contradiciendo directamente la lógica de `trueHandedness()` dos funciones más arriba en el mismo archivo, que sí aplica correctamente esta inversión para el caso de 1 mano
- Fix: `sorted[0]` (palmX menor) → `right`; `sorted[1]` (palmX mayor) → `left` (antes al revés). El caso de 1 mano con continuidad de posición (`prior`) no necesitó cambios — es simétrico/no depende de la convención, solo compara distancias, y hereda la corrección automáticamente vía `state.lastPalmX`
- Test de regresión existente corregido (afirmaba la convención vieja/incorrecta) con comentario explicando la geometría; 61/61 tests pasan
- `APP_VERSION` a `1.5.1 (2026-08-18)`; cache-busting a `?v=20260818w`

## 2026-08-18 — Efectos en mini-acordeón + botón de recalibrar manos

- Cada efecto (Eco, Flanger, Reverb) dentro del grupo "✨ Efectos" pasa a ser su propio mini-acordeón: el header (chevron + nombre) solo expande/colapsa los parámetros (mezcla, tiempo/velocidad, feedback/profundidad/tamaño); el switch de activar/desactivar es un elemento hermano independiente — un click nunca dispara el otro. Colapsado por defecto, mostrando solo nombre + switch
- Eliminados los textos "Activo"/"Inactivo" junto a cada switch (el propio switch ya comunica el estado visualmente); `updateEffectsReadouts()` y los `el.*` correspondientes se limpiaron
- Nuevo botón 🎯 "Volver a calibrar manos" en la barra inferior de la pantalla de juego: vuelve a la pantalla de setup y limpia `state.calibration`, `state.lastPalmX` (continuidad de posición de `assignHandSides`) y los `AxisTracker` de tono/volumen, para un reinicio limpio
- Verificado con Playwright: switch y expandir/colapsar son independientes (clickear uno no afecta al otro); el botón de recalibrar navega correctamente de vuelta al setup
- `APP_VERSION` a `1.6.0 (2026-08-18)`; cache-busting a `?v=20260818x`

## 2026-08-18 — Calibración de "mis límites" (rango personal, no de pantalla)

- Iteración de diseño en vivo: primero se probó un punto animado en CSS visitando las 4 esquinas de la cámara ("límites de pantalla"); el usuario aclaró que quería calibrar SUS propios límites de alcance (distintos por persona/distancia a la cámara), no una geometría fija — se descartó el punto decorativo (`.calib-target`, sin lógica JS, fácil de revertir) y se construyó la función real
- Nuevo botón "🎯 Calibrar mis límites" en el setup: al hacer click, durante 6 s registra el mínimo/máximo X/Y observado del palm landmark de cada mano (izquierda/derecha) mientras el usuario las mueve a su propio alcance cómodo (arriba/abajo/cerca/lejos) — sin gatear nada, cancela solo por tiempo
- Nueva función pura `remapToRange(value, range, minSpread=0.15)` en `lib/theremin-core.js`: remapea un valor crudo [0,1] al rango calibrado → [0,1]; sin calibración (o rango muy angosto, <15% de spread) es un passthrough — nunca obliga a calibrar
- `handRanges` (por lado físico: `left`/`right`, no por rol) persistido en `theremin_hand_ranges`; aplicado en `updatePlayAudio()` vía `remapHandY(side, rawY)` ANTES de alimentar los `AxisTracker` de tono/volumen — se busca por `state.toneHand`/`otherHand()`, así que sigue funcionando correctamente si el usuario intercambia manos después
- 5 tests de regresión nuevos para `remapToRange` (66/66 tests pasan)
- Verificado con Playwright: click inicia el contador (botón se deshabilita, texto de cuenta atrás), termina a los 6s y reactiva el botón; sin manos reales no guarda nada (comportamiento correcto, no un bug)
- `APP_VERSION` a `1.7.0 (2026-08-18)`; cache-busting a `?v=20260818z`

## 2026-08-18 — Decisiones sin cambio de código: doble calibración y detección de antebrazos

- **Correr "Calibrar mis límites" dos veces:** hoy cada corrida SOBREESCRIBE `handRanges[side]` (no fusiona), así que repetirlo no acumula nada — la segunda corrida simplemente descarta la primera. Si se pide de nuevo, la mejora concreta sería fusionar por unión (mínimo de mínimos, máximo de máximos) en vez de sobreescribir, para que correr varias veces solo ensanche el rango, nunca lo resetee. No implementado aún (pendiente de confirmación)
- **Detección por antebrazo (`PoseLandmarker`/`HolisticLandmarker`) + última posición conocida:** evaluado y descartado por ahora. Verificado contra la API real (`/google-ai-edge/mediapipe`): sí expone codo/muñeca/hombro, pero (1) ya tenemos "última posición conocida" vía `AxisTracker.coast()` y la continuidad de posición de `assignHandSides`; (2) no ayuda a los gestos de puño/acorde de piano, que necesitan landmarks de dedos que un modelo de pose no tiene; (3) correr un segundo modelo cada frame ~duplica el costo de inferencia (o, usando `HolisticLandmarker` en un solo pipeline, ese modelo hace *más* trabajo total que solo-manos, no menos) — mal trade-off de latencia para un instrumento en tiempo real. Alternativa más barata si el dropout de manos sigue siendo un problema real: extender/mejorar el comportamiento de `coast()` en vez de agregar un segundo modelo de ML

## 2026-08-18 — Detección de orientación de mano (perpendicular a la cámara) + presets como archivo

- Reportado: el momento crítico de detección es cuando la mano queda perpendicular a la cámara (de canto) — el usuario preguntó si se puede bajar la sensibilidad automáticamente al acercarse a ese ángulo ("azimuth")
- Verificado contra la API real (`/google-ai-edge/mediapipe`): `HandLandmarkerResult.worldLandmarks` son coordenadas 3D reales en metros, con ejes alineados a la cámara (+x derecha, +y arriba, -z hacia la escena) — esto permite calcular la orientación real de la palma (no solo inferirla de la confianza del clasificador, idea descartada por ser menos directa)
- Nueva función pura `palmFaceOn(worldLandmarks)` en `lib/theremin-core.js`: producto cruz de dos vectores del borde de la palma (muñeca→índice, muñeca→meñique) da el vector normal de la palma; cuánto ese normal apunta a lo largo del eje Z de la cámara (vs. de lado en X/Y) es qué tan "de frente" está la palma — 1 = de frente (mejor tracking), 0 = de canto/perpendicular (el punto débil reportado)
- Aplicado en dos lugares: (1) `axisOpts()` ahora recibe `faceOn` y atenúa `smoothPos` proporcionalmente (con un piso `FACEON_SMOOTH_FLOOR=0.2` para nunca congelar del todo) — la posición confía menos en cada frame justo cuando el tracking empieza a ponerse inestable, en vez de reaccionar a la vibración a plena fuerza; (2) el esqueleto dibujado en el overlay se pinta ámbar (`FACEON_WARN_THRESHOLD=0.35`) cuando una mano se acerca al ángulo perpendicular, como aviso visual antes de que la detección realmente se pierda
- 5 tests de regresión nuevos para `palmFaceOn` con geometría verificable a mano (normal alineado con Z → 1, normal en el plano XY → 0, puntos colineales → 0) (71/71 tests pasan)
- **Presets como archivo:** nuevos botones "⬇️ Exportar"/"⬆️ Importar" en el grupo Preajustes — descarga todos los preajustes como `theremin-presets.json` (Blob + link de descarga temporal, sin permisos especiales) y los vuelve a cargar desde un archivo (`<input type="file">` + merge por nombre, con el mismo `confirm()` de sobrescritura ya usado al guardar). Complementa `localStorage` (que solo persiste en este navegador/dispositivo) con algo portátil/respaldable
- Verificado con Playwright: guardar → exportar → borrar `localStorage` → recargar (lista vacía, confirma el borrado) → importar el archivo exportado → el preajuste reaparece correctamente
- `APP_VERSION` a `1.9.0 (2026-08-18)`; cache-busting a `?v=20260818z2`

## 2026-08-18 — Preajustes conocidos para cada efecto

- Investigado en internet (búsqueda acotada, ver fuentes en la respuesta al usuario) valores típicos/reconocibles: slapback ~70-150ms con feedback casi nulo; dub ~300-500ms con feedback alto; flanger clásico (tipo Van Halen) ~0.1-0.2Hz muy lento vs. uno "jet" más rápido; reverb de habitación ≤0.5s de decay vs. sala/hall 1.8-2.2s
- `FX_PRESETS` nuevo en `script.js` (dato estático, junto a `FX_DEFAULTS`/`INSTRUMENTS`, no en `lib/` porque no hay lógica pura que testear): 3 preajustes por efecto (Eco: Slapback/Clásico/Dub; Flanger: Sutil/Clásico/Intenso; Reverb: Habitación/Sala/Catedral), valores mapeados a los rangos de sliders ya existentes, no copiados literalmente de un plugin
- Botones nuevos (`.fx-preset-btn`, estilo píldora) dentro de cada mini-acordeón de efecto, arriba de los sliders; aplicar un preajuste también activa el switch del efecto (si no, sería fácil elegir un preajuste y olvidar prenderlo)
- Verificado con Playwright: click en "Dub" pone wet=0.45/time=0.4/feedback=0.6, prende el switch, y persiste en `theremin_effects` — todo correcto
- `APP_VERSION` a `1.10.0 (2026-08-18)`; cache-busting a `?v=20260818z3`

## 2026-08-18 — Bug: quedaba sonando un tono al volver a la pantalla de setup

- Reportado: sin tocar nada quedaba sonando un pitido en la pantalla de inicio
- Causa: los osciladores de Web Audio corren de forma continua sin importar qué pantalla esté activa — solo `updatePlayAudio()` (que corre exclusivamente en la pantalla "play") actualiza tono/volumen. El botón nuevo "🎯 Volver a calibrar manos" llama `showScreen("setup")` pero nunca silenciaba el audio, así que lo que sonara en el instante justo antes de tocarlo quedaba sonando indefinidamente (nada volvía a tocar `handGain` una vez fuera de "play")
- Fix: `showScreen()` corta el audio (`audio.hardMute()`, sin fade — el usuario ya no está tocando activamente) cada vez que se sale de la pantalla "play" hacia cualquier otra, sin importar por qué botón/camino se llegó ahí — más robusto que parchear solo el botón de recalibrar
- Verificado con Playwright: ciclos rápidos play↔setup vía el botón de recalibrar, sin errores (71/71 tests siguen pasando, sin cambios en la lógica pura)
- `APP_VERSION` a `1.10.1 (2026-08-18)`; cache-busting a `?v=20260818z4`

## 2026-08-18 — Publicado en GitHub Pages + link en el portafolio + silenciado automático por inactividad

- **GitHub Pages:** habilitado para `theremin-digital` (rama `master`, raíz `/`, sin build — coherente con el proyecto zero-build). Sitio en vivo: https://olivermartinezh.github.io/theremin-digital/ (HTTPS, necesario para `getUserMedia`)
- **Link en el portafolio:** clonado `olivermartinezh.github.io`, agregada una tarjeta de proyecto nueva para Theremin Digital siguiendo exactamente el mismo patrón que la tarjeta existente (WebP to JPG Converter) — capturas propias claro/oscuro (`assets/screenshots/theremin-digital-{claro,oscuro}.jpg`, misma convención de nombres), chips de tecnologías, botones "Probar en vivo" (→ Pages) y "Ver repositorio" (→ GitHub). Verificado visualmente en ambos temas antes de subir
- **Repo `theremin-digital`:** primer commit hecho (no había ninguno) con el proyecto completo; excluidos de forma deliberada `.claude/` (config local, sin secretos pero no pensada para subir), y varios archivos sueltos sin usar en el código: una captura UUID, `hands.png`/`left-hand.png` (superados por `assets/mano-{izq,der}.png`) y 4 mp3 de coro sin referenciar en ningún lado (de 3 días antes que el resto, de un enfoque con muestras que se abandonó)
- **Bug corregido:** el audio quedaba sonando indefinidamente al salir de la pantalla de juego (ver commit `2be05f9`) — `showScreen()` ahora silencia (`hardMute()`) al salir de "play" hacia cualquier otra pantalla
- **Silenciado automático por inactividad:** si NINGUNA mano se detecta durante `INACTIVITY_MUTE_MS` (8s) en la pantalla de juego, se silencia — antes, el comportamiento de "mantener el último volumen" (cuando solo la mano de volumen sale de cuadro) podía dejar un tono sonando indefinidamente si el usuario simplemente se alejaba. Ausencias cortas de una sola mano no se ven afectadas; solo dispara tras ausencia sostenida de ambas manos. Reseteado en `showScreen()` cada vez que se sale de "play", para que el temporizador arranque limpio la próxima vez
- Verificado con Playwright: sin errores en ~9s con cero manos detectadas (cruza el umbral de 8s) en la pantalla de juego; 71/71 tests siguen pasando
- `APP_VERSION` a `1.10.1` (fix de mute) y `1.11.0` (auto-mute por inactividad), ambos `(2026-08-18)`; cache-busting hasta `?v=20260818z5`. Todo commiteado y pusheado a `theremin-digital` para que GitHub Pages quede con la última versión

## 2026-08-18 — Apagado por abandono "divertido": glide de tono+volumen antes del mute

- Pedido: en vez de sostener la última nota y cortar de golpe a los 8s, que el tono vaya bajando junto con el volumen desde el segundo 3 de abandono — un "power down" divertido
- Nueva ventana `ABANDON_EFFECT_START_MS` (3000) a `INACTIVITY_MUTE_MS` (8000, sin cambios): al cruzar los 3s sin ninguna mano, se captura el tono/volumen del momento (`state.abandonEffect`) y desde ahí un glide con curva ease-in (`t²` — se queda cerca de la nota original al principio, después se despeña) lleva el tono ~3 octavas abajo (piso `AUDIBLE_MIN`) y el volumen a 0, en simultáneo, aterrizando en silencio total justo en el mute existente de los 8s
- Implementado como una sobreescritura al final de `updatePlayAudio()` (después de la lógica normal de tono/volumen, antes de actualizar el readout) — así no compite con el coast/sustain existente cuando ambas manos faltan, y respeta modo piano (`tuneChord` con la voz/acorde que estuviera sonando) vs. theremin normal (`setFrequency`)
- Verificado con Playwright leyendo el propio indicador de Hz en pantalla a lo largo del tiempo: 130.8Hz (t=1s, antes del umbral) → 120.2Hz (t=4s) → 49.9Hz (t=6.5s) → 20.1Hz silenciado (t=9s, ya pasado el mute) — sin errores; 71/71 tests siguen pasando (cambio solo en `script.js`, sin lógica pura nueva)
- `APP_VERSION` a `1.12.0 (2026-08-18)`; cache-busting a `?v=20260818z6`

## 2026-08-18 — Sección de instrucciones en el drawer

- Pendiente del handoff anterior (propuesto tentativamente, "o no sé"): agregar dentro de la app un resumen de los gestos básicos, para no depender de que el usuario los recuerde o los deduzca
- Nuevo grupo "🖐️ Instrucciones" en el drawer de configuración, primero en el orden (antes de "🎵 Tono") — mismo patrón de acordeón que el resto de los grupos (`setupDrawerAccordions()` ya envuelve cualquier `.config-group` con `<h3>`, sin cambios de JS necesarios), con una lista de 5 puntos: mano de tono/volumen + botón ⇄, puño = mute, postura de acorde en modo piano (dedos separados), auto-mute por inactividad, y el botón "Calibrar mis límites"
- CSS nuevo (`.instructions-list`) reutiliza las variables de tema existentes (`--text-dim`, `--text`), sin agregar paleta nueva
- `npm test` → 71/71 pasan (sin cambios en `lib/`, solo HTML/CSS + versión)
- `APP_VERSION` a `1.13.0 (2026-08-18)`; cache-busting a `?v=20260818z7`
