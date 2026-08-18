import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import {
  PALM_LANDMARK,
  CHORDS,
  clamp01,
  yToFrequency,
  yToVolume,
  registerFactors,
  chordVoiceFrequencies,
  freqToMidi,
  quantizeToSemitone,
  frequencyToNote,
  computeHandCurl,
  isPianoChordHand,
  palmFaceOn,
  otherHand,
  assignHandSides,
  calibrationStatus,
  remapToRange,
  AxisTracker,
} from "./lib/theremin-core.js";

const APP_VERSION = "1.10.0 (2026-08-18)";
console.log("[theremin] script.js cargado — versión:", APP_VERSION);

/* ---------------------------------------------------------------------- */
/* Constants                                                              */
/* ---------------------------------------------------------------------- */

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const MIN_FREQ = 130.81; // C3
const MAX_FREQ = 1046.5; // C6

const STORAGE_KEY_HANDS = "theremin_hand_config";
const STORAGE_KEY_WAVEFORM = "theremin_waveform";
const STORAGE_KEY_MAXVOL = "theremin_max_volume";
const STORAGE_KEY_INSTRUMENT = "theremin_instrument";
const STORAGE_KEY_CONFIG = "theremin_gesture_config";
const STORAGE_KEY_REGISTER = "theremin_register_map";
const STORAGE_KEY_MODE = "theremin_piano_mode";
const STORAGE_KEY_CHORD = "theremin_chord_type";
const STORAGE_KEY_THEME = "theremin_theme";
const STORAGE_KEY_EFFECTS = "theremin_effects";
const STORAGE_KEY_DRAWER_WIDTH = "theremin_drawer_width";
const STORAGE_KEY_HAND_RANGES = "theremin_hand_ranges";

const GESTURE_DEFAULTS = {
  toneSmoothing: 0.25,
  volumeSmoothing: 0.25,
  minFreq: MIN_FREQ,
  maxFreq: MAX_FREQ,
  invertToneY: false,
  invertVolumeY: false,
  fistEnabled: true,
  fistOn: 0.7,
  fistOff: 0.5,
  fistSnap: 3.0,
  curlSmooth: 0.5,
  sensPos: 1.0,
  sensResp: 1.0,
  anticipationEnabled: true,
  anticipation: 0.15,
};

function loadGestureConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cfg = { ...GESTURE_DEFAULTS };
      for (const key of Object.keys(GESTURE_DEFAULTS)) {
        if (typeof parsed[key] === typeof cfg[key]) cfg[key] = parsed[key];
      }
      if (cfg.minFreq >= cfg.maxFreq) cfg.maxFreq = cfg.minFreq + 20;
      return cfg;
    }
  } catch (_) {}
  return { ...GESTURE_DEFAULTS };
}

function saveGestureConfig() {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(gestureConfig));
}

let gestureConfig = loadGestureConfig();

/* Instrument presets: each shapes the raw oscillator into a distinct timbre
   using a unison detuned voice, a filter, and a detune-based vibrato LFO —
   all built on native Web Audio nodes. */
const INSTRUMENTS = {
  theremin: {
    label: "Theremin clásico",
    waveform: "sine",
    mainGain: 0.8,
    unison: null,
    filter: { type: "allpass", frequency: 1000, Q: 0.0001 },
    vibrato: { depthCents: 0, rateHz: 5 },
  },
  otamatone: {
    label: "Otamatone",
    waveform: "sawtooth",
    mainGain: 0.55,
    unison: null,
    filter: { type: "bandpass", frequency: 950, Q: 5 },
    vibrato: { depthCents: 45, rateHz: 5.5 },
  },
  synthlead: {
    label: "Synth Lead",
    waveform: "square",
    mainGain: 0.6,
    unison: { type: "sawtooth", detuneCents: 8, gain: 0.4 },
    filter: { type: "lowpass", frequency: 3200, Q: 1 },
    vibrato: { depthCents: 10, rateHz: 5 },
  },
  organ: {
    label: "Órgano",
    waveform: "sine",
    mainGain: 0.55,
    unison: { type: "triangle", detuneCents: 1200, gain: 0.45 },
    filter: { type: "lowpass", frequency: 6500, Q: 0.7 },
    vibrato: { depthCents: 0, rateHz: 5 },
  },
  strings: {
    label: "Cuerdas",
    waveform: "sawtooth",
    mainGain: 0.55,
    unison: { type: "sawtooth", detuneCents: 12, gain: 0.45 },
    filter: { type: "lowpass", frequency: 2200, Q: 1.5 },
    vibrato: { depthCents: 15, rateHz: 4.5 },
  },
  choir: {
    label: "Coro de voces",
    waveform: "sawtooth",
    mainGain: 0.5,
    unison: { type: "sawtooth", detuneCents: 18, gain: 0.5 },
    filter: { type: "bandpass", frequency: 800, Q: 2.2 },
    vibrato: { depthCents: 25, rateHz: 5.2 },
  },
  flauta: {
    label: "Flauta",
    waveform: "triangle",
    mainGain: 0.6,
    unison: { type: "sine", detuneCents: 1200, gain: 0.25 },
    filter: { type: "lowpass", frequency: 2800, Q: 0.6 },
    vibrato: { depthCents: 8, rateHz: 4.5 },
  },
  campana: {
    label: "Campana",
    waveform: "sine",
    mainGain: 0.55,
    unison: { type: "sine", detuneCents: 2400, gain: 0.25 },
    filter: { type: "lowpass", frequency: 4000, Q: 0.5 },
    vibrato: { depthCents: 2, rateHz: 4 },
  },
};

const RAMP = 0.05; // audio param ramp time constant (seconds)

/* ---------------------------------------------------------------------- */
/* DOM references                                                        */
/* ---------------------------------------------------------------------- */

const screens = {
  loading: document.getElementById("screen-loading"),
  error: document.getElementById("screen-error"),
  setup: document.getElementById("screen-setup"),
  play: document.getElementById("screen-play"),
};

const el = {
  loadingText: document.getElementById("loading-text"),
  errorTitle: document.getElementById("error-title"),
  errorMessage: document.getElementById("error-message"),
  btnRetry: document.getElementById("btn-retry"),
  btnTheme: document.getElementById("btn-theme"),

  cfgToneSmoothing: document.getElementById("cfg-tone-smoothing"),
  cfgToneSmoothingVal: document.getElementById("cfg-tone-smoothing-val"),
  cfgVolumeSmoothing: document.getElementById("cfg-volume-smoothing"),
  cfgVolumeSmoothingVal: document.getElementById("cfg-volume-smoothing-val"),
  cfgMinFreq: document.getElementById("cfg-min-freq"),
  cfgMinFreqVal: document.getElementById("cfg-min-freq-val"),
  cfgMaxFreq: document.getElementById("cfg-max-freq"),
  cfgMaxFreqVal: document.getElementById("cfg-max-freq-val"),
  cfgInvertTone: document.getElementById("cfg-invert-tone"),
  cfgInvertToneVal: document.getElementById("cfg-invert-tone-val"),
  cfgInvertVolume: document.getElementById("cfg-invert-volume"),
  cfgInvertVolumeVal: document.getElementById("cfg-invert-volume-val"),
  cfgFistEnabled: document.getElementById("cfg-fist-enabled"),
  cfgFistEnabledVal: document.getElementById("cfg-fist-enabled-val"),
  cfgFistOn: document.getElementById("cfg-fist-on"),
  cfgFistOnVal: document.getElementById("cfg-fist-on-val"),
  cfgFistOff: document.getElementById("cfg-fist-off"),
  cfgFistOffVal: document.getElementById("cfg-fist-off-val"),
  cfgFistSnap: document.getElementById("cfg-fist-snap"),
  cfgFistSnapVal: document.getElementById("cfg-fist-snap-val"),
  cfgFistCurlSmooth: document.getElementById("cfg-fist-curlsmooth"),
  cfgFistCurlSmoothVal: document.getElementById("cfg-fist-curlsmooth-val"),
  cfgAnticipationEnabled: document.getElementById("cfg-anticipation-enabled"),
  cfgAnticipationEnabledVal: document.getElementById("cfg-anticipation-enabled-val"),
  cfgAnticipation: document.getElementById("cfg-anticipation"),
  cfgAnticipationVal: document.getElementById("cfg-anticipation-val"),

  configDrawer: document.getElementById("config-drawer"),
  configDrawerOverlay: document.getElementById("config-drawer-overlay"),
  drawerResizeHandle: document.getElementById("drawer-resize-handle"),
  btnOpenConfig: document.getElementById("btn-open-config"),
  btnDrawerClose: document.getElementById("btn-drawer-close"),
  btnConfigReset: document.getElementById("btn-config-reset"),
  appVersion: document.getElementById("app-version"),
  appVersionBadge: document.getElementById("app-version-badge"),

  presetNameInput: document.getElementById("preset-name-input"),
  btnPresetSave: document.getElementById("btn-preset-save"),
  btnPresetExport: document.getElementById("btn-preset-export"),
  btnPresetImport: document.getElementById("btn-preset-import"),
  presetImportInput: document.getElementById("preset-import-input"),
  presetList: document.getElementById("preset-list"),

  videoSetup: document.getElementById("video-setup"),
  overlaySetup: document.getElementById("overlay-setup"),
  labelLayerSetup: document.getElementById("label-layer-setup"),
  setupDetectStatus: document.getElementById("setup-detect-status"),
  calibProgress: document.getElementById("calib-progress"),
  calibProgressFill: document.getElementById("calib-progress-fill"),
  btnSwap: document.getElementById("btn-swap"),
  btnSetupConfig: document.getElementById("btn-setup-config"),
  labelLeft: document.getElementById("label-left"),
  labelRight: document.getElementById("label-right"),
  btnStart: document.getElementById("btn-start"),
  btnCalibrateLimits: document.getElementById("btn-calibrate-limits"),

  videoPlay: document.getElementById("video-play"),
  overlayPlay: document.getElementById("overlay-play"),
  labelLayerPlay: document.getElementById("label-layer-play"),
  noteReadout: document.getElementById("note-readout"),
  handsStatus: document.getElementById("hands-status"),

  instrumentSelect: document.getElementById("instrument-select"),
  registerButtons: Array.from(document.querySelectorAll(".register-bar")),
  chordControl: document.getElementById("chord-control"),
  chordButtons: Array.from(document.querySelectorAll(".chord-btn")),
  waveformSelect: document.getElementById("waveform-select"),
  maxVolume: document.getElementById("max-volume"),
  sensPos: document.getElementById("sens-pos"),
  sensResp: document.getElementById("sens-resp"),
  btnMute: document.getElementById("btn-mute"),
  btnMode: document.getElementById("btn-mode"),
  modeVal: document.getElementById("mode-val"),
  btnReconfigBar: document.getElementById("btn-reconfig-bar"),
  btnRecalibrate: document.getElementById("btn-recalibrate"),

  fxEchoEnabled: document.getElementById("fx-echo-enabled"),
  fxEchoWet: document.getElementById("fx-echo-wet"),
  fxEchoWetVal: document.getElementById("fx-echo-wet-val"),
  fxEchoTime: document.getElementById("fx-echo-time"),
  fxEchoTimeVal: document.getElementById("fx-echo-time-val"),
  fxEchoFeedback: document.getElementById("fx-echo-feedback"),
  fxEchoFeedbackVal: document.getElementById("fx-echo-feedback-val"),
  fxFlangerEnabled: document.getElementById("fx-flanger-enabled"),
  fxFlangerWet: document.getElementById("fx-flanger-wet"),
  fxFlangerWetVal: document.getElementById("fx-flanger-wet-val"),
  fxFlangerRate: document.getElementById("fx-flanger-rate"),
  fxFlangerRateVal: document.getElementById("fx-flanger-rate-val"),
  fxFlangerDepth: document.getElementById("fx-flanger-depth"),
  fxFlangerDepthVal: document.getElementById("fx-flanger-depth-val"),
  fxReverbEnabled: document.getElementById("fx-reverb-enabled"),
  fxReverbWet: document.getElementById("fx-reverb-wet"),
  fxReverbWetVal: document.getElementById("fx-reverb-wet-val"),
  fxReverbSize: document.getElementById("fx-reverb-size"),
  fxReverbSizeVal: document.getElementById("fx-reverb-size-val"),

  vizCanvas: document.getElementById("viz-canvas"),
};

/* ---------------------------------------------------------------------- */
/* App state                                                             */
/* ---------------------------------------------------------------------- */

const state = {
  stream: null,
  handLandmarker: null,
  activeScreen: "loading",
  toneHand: loadHandConfig() || "right", // 'left' | 'right'
  smoothedY: { tone: null },
  lastFreq: gestureConfig.minFreq,
  muted: false,
  volumeFistMuted: false,
  fistReleasing: false,
  volumeCurl: null,
  volumeCurlTimestamp: null,
  volumeCurlVelocity: 0,
  pianoMode: loadPianoMode(),
  chordType: loadChordType(),
  pianoKey: null, // last quantized MIDI key played in piano mode
  playingChord: false,
  lastPalmX: { left: null, right: null }, // for single-hand side disambiguation
  lastStrikeTime: 0, // performance.now() ms, for debouncing piano-mode strikeKey()
  calibration: { heldMs: 0, done: false, lastFrameTime: null }, // setup-screen hand calibration (informational only)
  limitsCapture: null, // { endAt, left: {minX,maxX,minY,maxY}, right: {...} } while "Calibrar mis límites" runs
};

const LIMITS_CAPTURE_MS = 6000;

// Both hands seen for this long (accumulated, see below) is reported as
// "calibrated" on the setup screen — gives assignHandSides' position
// continuity a solid starting point, but never blocks starting the app.
const CALIBRATION_HOLD_MS = 1500;
// Detection noise means a hand can drop out for a frame or two even while
// the user is holding steady, so progress accumulates while both hands are
// seen and only leaks away (faster than it fills) during a dropout, instead
// of resetting to zero on a single missed frame.
const CALIBRATION_DECAY_RATE = 3;

// A fast hand glide crosses many semitones per second; without this, each
// crossing would re-trigger strikeKey()'s attack envelope, and a rapid train
// of those sounds like crackling ("chicharreo") instead of a smooth glide.
// Below this interval a re-strike is suppressed — the oscillator frequency
// still glides continuously either way, only the amplitude re-attack is rate
// limited, so a hand that pauses on a new held note still gets struck.
const MIN_STRIKE_INTERVAL_MS = 70;

// Below this palmFaceOn value, the skeleton overlay flags the hand (amber)
// as approaching edge-on to the camera — tracking is about to get shaky.
const FACEON_WARN_THRESHOLD = 0.35;
// axisOpts() never distrusts a frame below this floor: even at the worst
// (edge-on) orientation, position still updates a little rather than
// freezing outright, which would itself feel like a bug.
const FACEON_SMOOTH_FLOOR = 0.2;

function maybeStrikeKey() {
  const now = performance.now();
  if (now - state.lastStrikeTime < MIN_STRIKE_INTERVAL_MS) return;
  state.lastStrikeTime = now;
  audio.strikeKey();
}

function loadPianoMode() {
  try {
    return localStorage.getItem(STORAGE_KEY_MODE) === "piano";
  } catch (_) {
    return false;
  }
}

function loadChordType() {
  const raw = localStorage.getItem(STORAGE_KEY_CHORD);
  return CHORDS[raw] ? raw : "mayor";
}

function loadHandConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HANDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.toneHand === "left" || parsed.toneHand === "right") return parsed.toneHand;
    }
  } catch (_) {}
  return null;
}

function saveHandConfig(toneHand) {
  localStorage.setItem(STORAGE_KEY_HANDS, JSON.stringify({ toneHand }));
}

function loadTheme() {
  return localStorage.getItem(STORAGE_KEY_THEME) || "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el.btnTheme.textContent = theme === "dark" ? "🌙" : "☀️";
}

el.btnTheme.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY_THEME, next);
  applyTheme(next);
});

applyTheme(loadTheme());

if (el.appVersion) el.appVersion.textContent = `Versión ${APP_VERSION}`;
if (el.appVersionBadge) {
  el.appVersionBadge.textContent = `v${APP_VERSION.split(" ")[0]}`;
  el.appVersionBadge.title = `Versión completa: ${APP_VERSION}`;
}

/* ---------------------------------------------------------------------- */
/* Screen management                                                     */
/* ---------------------------------------------------------------------- */

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
  state.activeScreen = name;
  closeDrawer();
}

/* ---------------------------------------------------------------------- */
/* Camera                                                                */
/* ---------------------------------------------------------------------- */

async function setupCamera() {
  console.log("[boot] setupCamera: pidiendo permiso + stream (getUserMedia)…");
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    console.log("[boot] getUserMedia OK");
  } catch (err) {
    console.warn("[boot] getUserMedia falló:", err);
    showCameraError(err);
    throw err;
  }

  el.videoSetup.srcObject = state.stream;
  el.videoPlay.srcObject = state.stream;

  await Promise.all([
    waitForVideoReady(el.videoSetup),
    waitForVideoReady(el.videoPlay),
  ]);
  console.log("[boot] videos listos");
}

function waitForVideoReady(video) {
  return new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.addEventListener("loadeddata", () => resolve(), { once: true });
  });
}

function showCameraError(err) {
  let title = "No se pudo acceder a la cámara";
  let message = "Verifica los permisos del navegador e inténtalo de nuevo.";

  if (err && err.name === "NotAllowedError") {
    message = "Denegaste el permiso de cámara. Habilítalo en la configuración del sitio y vuelve a intentar.";
  } else if (err && err.name === "NotFoundError") {
    title = "No se encontró ninguna cámara";
    message = "Conecta una cámara web y vuelve a intentarlo.";
  } else if (err && err.name === "NotReadableError") {
    message = "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
  }

  el.errorTitle.textContent = title;
  el.errorMessage.textContent = message;
  showScreen("error");
}

/* ---------------------------------------------------------------------- */
/* Hand landmark model                                                   */
/* ---------------------------------------------------------------------- */

async function setupHandLandmarker() {
  console.log("[boot] setupHandLandmarker: descargando WASM desde jsdelivr…");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  console.log("[boot] FilesetResolver WASM listo");

  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

  // MediaPipe's defaults (0.5 for all three) are tuned for a well-lit,
  // centered, static-image use case. For a live two-hand gesture instrument,
  // a hand at the edge of frame or partially out of view (common for
  // whichever hand isn't currently the visual focus) easily dips under that
  // bar and disappears entirely. Lowering the bar trades a little detection
  // precision for a lot fewer "hand vanished" moments.
  const HAND_DETECTION_OPTIONS = {
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  };

  try {
    console.log("[boot] creando HandLandmarker (GPU)…");
    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      ...HAND_DETECTION_OPTIONS,
    });
    console.log("[boot] HandLandmarker GPU OK");
  } catch (err) {
    // Some devices/browsers lack WebGL delegate support; fall back to CPU.
    console.warn("[boot] GPU falló, reintentando CPU:", err);
    console.log("[boot] creando HandLandmarker (CPU)…");
    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
      ...HAND_DETECTION_OPTIONS,
    });
    console.log("[boot] HandLandmarker CPU OK");
  }
}

/* ---------------------------------------------------------------------- */
/* Audio engine                                                          */
/* ---------------------------------------------------------------------- */

const audio = {
  ctx: null,
  osc1: null,
  osc2: null,
  osc3: null,
  osc4: null,
  oscGain1: null,
  oscGain2: null,
  oscGain3: null,
  oscGain4: null,
  envGain: null,
  filter: null,
  vibratoLfo: null,
  vibratoDepth: null,
  handGain: null,
  masterGain: null,
  dryGain: null,
  echoDelay: null,
  echoFeedback: null,
  echoFilter: null,
  echoWet: null,
  flangerDelay: null,
  flangerLfo: null,
  flangerDepth: null,
  flangerWet: null,
  reverbConvolver: null,
  reverbWet: null,
  limiter: null,
  analyser: null,
  ready: false,

  async init() {
    if (this.ready) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.osc1 = this.ctx.createOscillator();
    this.osc1.frequency.value = gestureConfig.minFreq;

    this.osc2 = this.ctx.createOscillator();
    this.osc2.frequency.value = gestureConfig.minFreq;

    this.osc3 = this.ctx.createOscillator();
    this.osc3.frequency.value = gestureConfig.minFreq;

    this.osc4 = this.ctx.createOscillator();
    this.osc4.frequency.value = gestureConfig.minFreq;

    this.oscGain1 = this.ctx.createGain();
    this.oscGain1.gain.value = 1;

    this.oscGain2 = this.ctx.createGain();
    this.oscGain2.gain.value = 0;

    this.oscGain3 = this.ctx.createGain();
    this.oscGain3.gain.value = 0;

    this.oscGain4 = this.ctx.createGain();
    this.oscGain4.gain.value = 0;

    this.envGain = this.ctx.createGain();
    this.envGain.gain.value = 1;

    this.filter = this.ctx.createBiquadFilter();

    this.vibratoLfo = this.ctx.createOscillator();
    this.vibratoLfo.type = "sine";
    this.vibratoLfo.frequency.value = 5;

    this.vibratoDepth = this.ctx.createGain();
    this.vibratoDepth.gain.value = 0; // cents

    this.handGain = this.ctx.createGain();
    this.handGain.gain.value = 0;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = state.muted ? 0 : 1;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1;

    this.echoDelay = this.ctx.createDelay(1);
    this.echoDelay.delayTime.value = 0.3;
    this.echoFeedback = this.ctx.createGain();
    this.echoFeedback.gain.value = 0.35;
    this.echoFilter = this.ctx.createBiquadFilter();
    this.echoFilter.type = "lowpass";
    this.echoFilter.frequency.value = 4000;
    this.echoWet = this.ctx.createGain();
    this.echoWet.gain.value = 0;

    this.flangerDelay = this.ctx.createDelay(0.02);
    this.flangerDelay.delayTime.value = 0.003;
    this.flangerLfo = this.ctx.createOscillator();
    this.flangerLfo.type = "sine";
    this.flangerLfo.frequency.value = 0.4;
    this.flangerDepth = this.ctx.createGain();
    this.flangerDepth.gain.value = 0;
    this.flangerWet = this.ctx.createGain();
    this.flangerWet.gain.value = 0;

    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = makeImpulseBuffer(this.ctx, 1.5, 3);
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0;

    // Dry + echo/flanger/reverb wet sends all sum additively into masterGain
    // with no headroom management, and resonant filters (otamatone Q=5, etc.)
    // can push a peak above unity gain on their own. Without this, that sum
    // hits the destination's hard clip and sounds like harsh digital
    // distortion ("chicharreo") instead of just getting a bit louder.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.osc1.connect(this.oscGain1);
    this.osc2.connect(this.oscGain2);
    this.osc3.connect(this.oscGain3);
    this.osc4.connect(this.oscGain4);
    this.oscGain1.connect(this.filter);
    this.oscGain2.connect(this.filter);
    this.oscGain3.connect(this.filter);
    this.oscGain4.connect(this.filter);
    this.filter.connect(this.envGain);
    this.envGain.connect(this.handGain);

    this.handGain.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);

    this.handGain.connect(this.echoDelay);
    this.echoDelay.connect(this.echoWet);
    this.echoWet.connect(this.masterGain);
    this.echoDelay.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoFilter);
    this.echoFilter.connect(this.echoDelay);

    this.handGain.connect(this.flangerDelay);
    this.flangerDelay.connect(this.flangerWet);
    this.flangerWet.connect(this.masterGain);
    this.flangerLfo.connect(this.flangerDepth);
    this.flangerDepth.connect(this.flangerDelay.delayTime);

    this.handGain.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbWet);
    this.reverbWet.connect(this.masterGain);

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.vibratoLfo.connect(this.vibratoDepth);
    this.vibratoDepth.connect(this.osc1.detune);
    this.vibratoDepth.connect(this.osc2.detune);
    this.vibratoDepth.connect(this.osc3.detune);
    this.vibratoDepth.connect(this.osc4.detune);

    this.osc1.start();
    this.osc2.start();
    this.osc3.start();
    this.osc4.start();
    this.vibratoLfo.start();
    this.flangerLfo.start();
    this.ready = true;

    applyEffects();
    applyInstrument(loadInstrument());
  },

  /* Piano mode: tune the four oscillators to a chord voicing and split the
     total voice gain evenly so a 3/4-note chord doesn't clip. */
  tuneChord(rootFreq, voicing) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const oscs = [this.osc1, this.osc2, this.osc3, this.osc4];
    const gains = [this.oscGain1, this.oscGain2, this.oscGain3, this.oscGain4];
    const voices = chordVoiceFrequencies(rootFreq, voicing, oscs.length);
    for (let i = 0; i < oscs.length; i++) {
      const voice = voices[i];
      // A voicing with fewer than 4 notes (every chord but "7ª") leaves the
      // unused oscillators with no assigned frequency: skip them (their gain
      // goes to 0 below) instead of feeding setTargetAtTime a NaN, which
      // throws "non-finite" and aborts every subsequent audio param update.
      if (voice) oscs[i].frequency.setTargetAtTime(voice.freq, now, RAMP);
      gains[i].gain.setTargetAtTime(voice ? voice.gain : 0, now, RAMP);
    }
  },

  /* Attack envelope on a fresh key press so chords/notes sound struck. A
     continuous hand glide quantized to semitones re-triggers this often, so
     it ramps down from wherever the gain currently is (instead of an
     instantaneous setValueAtTime jump) — that jump is a real discontinuity
     in the waveform, and a fast run of them is exactly what "chicharreo"
     sounds like. */
  strikeKey() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.envGain.gain.cancelScheduledValues(now);
    this.envGain.gain.setValueAtTime(this.envGain.gain.value, now);
    this.envGain.gain.linearRampToValueAtTime(0.0001, now + 0.008);
    this.envGain.gain.linearRampToValueAtTime(1, now + 0.008 + 0.02);
  },

  setFrequency(freq) {
    if (!this.ready) return;
    this.osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, RAMP);
    this.osc2.frequency.setTargetAtTime(freq, this.ctx.currentTime, RAMP);
  },

  setVolume(level01) {
    if (!this.ready) return;
    this.handGain.gain.setTargetAtTime(level01, this.ctx.currentTime, RAMP);
  },

  /* Instant, unramped cut for the fist gesture — no fade. */
  hardMute() {
    if (!this.ready) return;
    this.handGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.handGain.gain.setValueAtTime(0, this.ctx.currentTime);
  },

  setWaveform(type) {
    if (!this.ready) return;
    this.osc1.type = type;
  },

  setMuted(muted) {
    if (!this.ready) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  },
};

function loadWaveform() {
  return localStorage.getItem(STORAGE_KEY_WAVEFORM) || "sine";
}

function loadInstrument() {
  const saved = localStorage.getItem(STORAGE_KEY_INSTRUMENT);
  return saved && (saved === "custom" || INSTRUMENTS[saved]) ? saved : "theremin";
}

let registerMap = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTER);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
})();

function saveRegisterMap() {
  localStorage.setItem(STORAGE_KEY_REGISTER, JSON.stringify(registerMap));
}

// Per-hand-side comfortable reach, from the "Calibrar mis límites" exercise:
// { left?: {minX,maxX,minY,maxY}, right?: {...} }. Applied by role (tone/
// volume) via state.toneHand/otherHand, so it survives swapping hands.
let handRanges = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HAND_RANGES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
})();

function saveHandRanges() {
  localStorage.setItem(STORAGE_KEY_HAND_RANGES, JSON.stringify(handRanges));
}

// Octave min/max multipliers for the current instrument's register (both 1 = unchanged).
let currentInstrument = loadInstrument();
function getRegisterFactors() {
  return registerFactors(registerMap[currentInstrument]);
}

function getChordVoicing() {
  const type = CHORDS[state.chordType] ? state.chordType : "mayor";
  return CHORDS[type].semitones;
}

/* Re-tunes the four oscillators to the current chord on the last played key
   (used when the chord type changes or after init). */
function syncPianoVoices() {
  if (!audio.ready || !state.pianoMode) return;
  audio.tuneChord(state.lastFreq, getChordVoicing());
}

/* Routes the voice gains to either the normal unison pair or the piano chord
   voices, keeping envGain at 1 in normal mode. */
function applyVoiceRouting(preset) {
  if (!audio.ready) return;
  const now = audio.ctx.currentTime;

  if (state.pianoMode) {
    audio.oscGain1.gain.setTargetAtTime(0, now, 0.01);
    audio.oscGain2.gain.setTargetAtTime(0, now, 0.01);
    audio.oscGain3.gain.setTargetAtTime(0, now, 0.01);
    audio.oscGain4.gain.setTargetAtTime(0, now, 0.01);
    syncPianoVoices();
    return;
  }

  audio.envGain.gain.setTargetAtTime(1, now, 0.01);
  const mainGain = preset && preset.mainGain ? preset.mainGain : 1;
  audio.oscGain1.gain.setTargetAtTime(mainGain, now, RAMP);
  if (preset && preset.unison) {
    audio.osc2.type = preset.unison.type;
    audio.osc2.detune.setTargetAtTime(preset.unison.detuneCents, now, RAMP);
    audio.oscGain2.gain.setTargetAtTime(preset.unison.gain, now, RAMP);
  } else {
    audio.oscGain2.gain.setTargetAtTime(0, now, RAMP);
  }
  audio.oscGain3.gain.setTargetAtTime(0, now, RAMP);
  audio.oscGain4.gain.setTargetAtTime(0, now, RAMP);
}

/* Reconfigures the audio graph (waveform, unison voice, filter, vibrato) to
   match an instrument preset, or hands manual control back to the user via
   the "Personalizado" waveform selector. Ramps every param to avoid clicks. */
function applyInstrument(id) {
  const preset = id === "custom" ? null : INSTRUMENTS[id];
  currentInstrument = id;

  el.instrumentSelect.value = id;
  localStorage.setItem(STORAGE_KEY_INSTRUMENT, id);
  syncRegisterUI();

  if (!preset) {
    el.waveformSelect.disabled = false;
    audio.setWaveform(el.waveformSelect.value);
    if (audio.ready) {
      const now = audio.ctx.currentTime;
      audio.filter.type = "allpass";
      audio.filter.frequency.setTargetAtTime(1000, now, RAMP);
      audio.filter.Q.setTargetAtTime(0.0001, now, RAMP);
      audio.vibratoLfo.frequency.setTargetAtTime(5, now, RAMP);
      audio.vibratoDepth.gain.setTargetAtTime(0, now, RAMP);
    }
    applyVoiceRouting(null);
    return;
  }

  el.waveformSelect.disabled = true;
  el.waveformSelect.value = preset.waveform;
  audio.setWaveform(preset.waveform);
  localStorage.setItem(STORAGE_KEY_WAVEFORM, preset.waveform);

  if (audio.ready) {
    const now = audio.ctx.currentTime;
    audio.filter.type = preset.filter.type;
    audio.filter.frequency.setTargetAtTime(preset.filter.frequency, now, RAMP);
    audio.filter.Q.setTargetAtTime(preset.filter.Q, now, RAMP);
    audio.vibratoLfo.frequency.setTargetAtTime(preset.vibrato.rateHz, now, RAMP);
    audio.vibratoDepth.gain.setTargetAtTime(preset.vibrato.depthCents, now, RAMP);
  }
  applyVoiceRouting(preset);
}

function loadMaxVolume() {
  const raw = localStorage.getItem(STORAGE_KEY_MAXVOL);
  const v = raw !== null ? parseFloat(raw) : 0.5;
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

/* ---------------------------------------------------------------------- */
/* Mapping helpers                                                       */
/* ---------------------------------------------------------------------- */

// Pure mapping/gesture/music-theory logic lives in lib/theremin-core.js
// (imported above) so it can be unit tested without the DOM. These small
// wrappers just bind it to the live gestureConfig/register state.

function toneMappingOpts() {
  return {
    inverted: gestureConfig.invertToneY,
    minFreq: gestureConfig.minFreq,
    maxFreq: gestureConfig.maxFreq,
    sensPos: gestureConfig.sensPos,
    ...getRegisterFactors(),
  };
}

function volumeMappingOpts() {
  return { inverted: gestureConfig.invertVolumeY, sensPos: gestureConfig.sensPos };
}

// Maps a raw palm Y through that physical side's "Calibrar mis límites"
// range, if any (falls back to the raw value untouched when uncalibrated —
// see remapToRange). Looked up by physical side, not by role, so swapping
// which hand is tone/volume keeps using the correct side's calibration.
function remapHandY(side, rawY) {
  const range = handRanges[side];
  return remapToRange(rawY, range && { min: range.minY, max: range.maxY });
}

/* ---------------------------------------------------------------------- */
/* AxisTracker instances (tone / volume)                                 */
/* ---------------------------------------------------------------------- */

// EMA factor for the velocity estimate. Higher = snappier but noisier.
const VELOCITY_SMOOTH = 0.3;

const toneTracker = new AxisTracker();
const volumeTracker = new AxisTracker();

/* ---------------------------------------------------------------------- */
/* Drawing: hand skeleton overlay                                        */
/* ---------------------------------------------------------------------- */

function resizeCanvasToVideo(canvas, video) {
  if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

function drawHandSkeleton(ctx, landmarks, color) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
  }
  ctx.stroke();

  ctx.fillStyle = color;
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function positionLabel(labelEl, landmark, container) {
  if (!landmark) {
    labelEl.style.display = "none";
    return;
  }
  labelEl.style.display = "block";
  const leftPercent = (1 - landmark.x) * 100; // pre-mirrored, layer counter-mirrors visually
  const topPercent = landmark.y * 100;
  labelEl.style.left = `${leftPercent}%`;
  labelEl.style.top = `${topPercent}%`;
}

function ensureLabel(layer, className, text) {
  let labelEl = layer.querySelector(`.${className}`);
  if (!labelEl) {
    labelEl = document.createElement("div");
    labelEl.className = `hand-label ${className}`;
    labelEl.textContent = text;
    layer.appendChild(labelEl);
  }
  return labelEl;
}

/* ---------------------------------------------------------------------- */
/* Setup screen logic                                                    */
/* ---------------------------------------------------------------------- */

function applySelectedOption() {
  const leftIsTone = state.toneHand === "left";
  el.labelLeft.querySelector(".role-icon").textContent = leftIsTone ? "🎵" : "🔊";
  el.labelLeft.querySelector(".role-text").textContent = leftIsTone ? "TONO" : "VOLUMEN";
  el.labelLeft.className = leftIsTone ? "role-label role-tone" : "role-label role-volume";
  el.labelRight.querySelector(".role-icon").textContent = leftIsTone ? "🔊" : "🎵";
  el.labelRight.querySelector(".role-text").textContent = leftIsTone ? "VOLUMEN" : "TONO";
  el.labelRight.className = leftIsTone ? "role-label role-volume" : "role-label role-tone";
}

el.btnSwap.addEventListener("click", () => {
  state.toneHand = state.toneHand === "left" ? "right" : "left";
  saveHandConfig(state.toneHand);
  applySelectedOption();
});

if (el.btnSetupConfig) el.btnSetupConfig.addEventListener("click", openDrawer);

el.btnStart.addEventListener("click", () => {
  audio.init().catch((err) => console.error("No se pudo iniciar el audio:", err));
  showScreen("play");
});

el.btnReconfigBar.addEventListener("click", () => {
  state.toneHand = state.toneHand === "left" ? "right" : "left";
  saveHandConfig(state.toneHand);
  syncToneHandUI();
});

if (el.btnRecalibrate) {
  el.btnRecalibrate.addEventListener("click", () => {
    // Back to the setup screen for a fresh calibration hold — also clears
    // the position-continuity data assignHandSides relies on for a lone
    // hand, and the tone/volume smoothing trackers, so nothing stale from
    // the previous session carries over.
    state.calibration = { heldMs: 0, done: false, lastFrameTime: null };
    state.lastPalmX = { left: null, right: null };
    toneTracker.reset();
    volumeTracker.reset();
    applySelectedOption();
    syncToneHandUI();
    showScreen("setup");
  });
}

el.btnRetry.addEventListener("click", async () => {
  showScreen("loading");
  try {
    await setupCamera();
    afterCameraReady();
  } catch (_) {
    // showCameraError already handled the screen switch
  }
});

/* ---------------------------------------------------------------------- */
/* Configuration screen logic                                            */
/* ---------------------------------------------------------------------- */

function updateConfigReadouts() {
  el.cfgToneSmoothingVal.textContent = gestureConfig.toneSmoothing.toFixed(2);
  el.cfgVolumeSmoothingVal.textContent = gestureConfig.volumeSmoothing.toFixed(2);
  el.cfgMinFreqVal.textContent = `${Math.round(gestureConfig.minFreq)} Hz`;
  el.cfgMaxFreqVal.textContent = `${Math.round(gestureConfig.maxFreq)} Hz`;
  // yToFrequency: y=0 is the top of frame; raw = inverted ? y : 1-y, and freq
  // grows with raw. So NOT inverted (default) means top => raw=1 => agudo.
  el.cfgInvertToneVal.textContent = gestureConfig.invertToneY ? "Abajo = agudo" : "Arriba = agudo";
  // Same direction as tone (see above): NOT inverted (default) => top = alto.
  el.cfgInvertVolumeVal.textContent = gestureConfig.invertVolumeY ? "Abajo = alto" : "Arriba = alto";
  el.cfgFistEnabledVal.textContent = gestureConfig.fistEnabled ? "Activo" : "Inactivo";
  el.cfgFistOnVal.textContent = gestureConfig.fistOn.toFixed(2);
  el.cfgFistOffVal.textContent = gestureConfig.fistOff.toFixed(2);
  el.cfgFistSnapVal.textContent = gestureConfig.fistSnap.toFixed(1);
  el.cfgFistCurlSmoothVal.textContent = gestureConfig.curlSmooth.toFixed(2);
  el.cfgAnticipationEnabledVal.textContent = gestureConfig.anticipationEnabled ? "Activo" : "Inactivo";
  el.cfgAnticipationVal.textContent = gestureConfig.anticipation === 0 ? "Off" : `${Math.round(gestureConfig.anticipation * 1000)} ms`;
}

function populateConfigUI() {
  el.cfgToneSmoothing.value = String(gestureConfig.toneSmoothing);
  el.cfgVolumeSmoothing.value = String(gestureConfig.volumeSmoothing);
  el.cfgMinFreq.value = String(gestureConfig.minFreq);
  el.cfgMaxFreq.value = String(gestureConfig.maxFreq);
  el.cfgInvertTone.setAttribute("aria-checked", String(gestureConfig.invertToneY));
  el.cfgInvertVolume.setAttribute("aria-checked", String(gestureConfig.invertVolumeY));
  el.cfgFistEnabled.setAttribute("aria-checked", String(gestureConfig.fistEnabled));
  el.cfgFistOn.value = String(gestureConfig.fistOn);
  el.cfgFistOff.value = String(gestureConfig.fistOff);
  el.cfgFistSnap.value = String(gestureConfig.fistSnap);
  el.cfgFistCurlSmooth.value = String(gestureConfig.curlSmooth);
  el.cfgAnticipationEnabled.setAttribute("aria-checked", String(gestureConfig.anticipationEnabled));
  el.cfgAnticipation.value = String(gestureConfig.anticipation);
  updateConfigReadouts();
}

el.btnConfigReset.addEventListener("click", () => {
  gestureConfig = { ...GESTURE_DEFAULTS };
  saveGestureConfig();
  populateConfigUI();
  el.sensPos.value = String(gestureConfig.sensPos);
  el.sensResp.value = String(gestureConfig.sensResp);
  Object.assign(fx, structuredClone(FX_DEFAULTS));
  lastReverbSize = fx.reverb.size;
  saveEffects();
  populateEffectsUI();
  applyEffects();
});

/* ---------------------------------------------------------------------- */
/* Drawer (config)                                                        */
/* ---------------------------------------------------------------------- */

/* Reserves horizontal space for the open drawer on the main screen (via a
   CSS var read as padding-right) so the centered camera/viz layout shifts
   left into its own empty margin first, instead of the drawer just
   overlapping it. Kept in sync with the live width while resizing. */
function updateDrawerSpace() {
  const open = el.configDrawer.classList.contains("open");
  const px = open ? el.configDrawer.getBoundingClientRect().width : 0;
  document.documentElement.style.setProperty("--drawer-space", `${px}px`);
}

function openDrawer() {
  populateConfigUI();
  populateEffectsUI();
  el.sensPos.value = String(gestureConfig.sensPos);
  el.sensResp.value = String(gestureConfig.sensResp);
  el.configDrawer.classList.add("open");
  el.configDrawerOverlay.classList.remove("hidden");
  updateDrawerSpace();
}

function closeDrawer() {
  el.configDrawer.classList.remove("open");
  el.configDrawerOverlay.classList.add("hidden");
  updateDrawerSpace();
}

el.btnOpenConfig.addEventListener("click", openDrawer);
el.btnDrawerClose.addEventListener("click", closeDrawer);
el.configDrawerOverlay.addEventListener("click", closeDrawer);

/* ---------------------------------------------------------------------- */
/* Drawer resizing (Pointer Events + localStorage)                        */
/* ---------------------------------------------------------------------- */

const DRAWER_WIDTH_MIN = 340;

function drawerWidthMax() {
  return Math.min(720, Math.floor(window.innerWidth * 0.9));
}

function loadDrawerWidth() {
  const saved = parseInt(localStorage.getItem(STORAGE_KEY_DRAWER_WIDTH), 10);
  if (Number.isFinite(saved) && saved >= DRAWER_WIDTH_MIN) {
    return Math.min(saved, drawerWidthMax());
  }
  return 460;
}

function applyDrawerWidth(width) {
  el.configDrawer.style.width = `${width}px`;
  updateDrawerSpace();
}

applyDrawerWidth(loadDrawerWidth());

if (el.drawerResizeHandle) {
  el.drawerResizeHandle.addEventListener("pointerdown", (e) => {
    const startX = e.clientX;
    const startWidth = el.configDrawer.getBoundingClientRect().width;
    el.configDrawer.classList.add("resizing");
    document.body.classList.add("drawer-resizing");
    el.drawerResizeHandle.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const width = Math.min(drawerWidthMax(), Math.max(DRAWER_WIDTH_MIN, startWidth + (startX - ev.clientX)));
      applyDrawerWidth(width);
    };
    const onUp = () => {
      el.drawerResizeHandle.releasePointerCapture(e.pointerId);
      el.drawerResizeHandle.removeEventListener("pointermove", onMove);
      el.drawerResizeHandle.removeEventListener("pointerup", onUp);
      el.drawerResizeHandle.removeEventListener("pointercancel", onUp);
      el.configDrawer.classList.remove("resizing");
      document.body.classList.remove("drawer-resizing");
      localStorage.setItem(STORAGE_KEY_DRAWER_WIDTH, String(el.configDrawer.getBoundingClientRect().width));
    };

    el.drawerResizeHandle.addEventListener("pointermove", onMove);
    el.drawerResizeHandle.addEventListener("pointerup", onUp);
    el.drawerResizeHandle.addEventListener("pointercancel", onUp);
  });
}

/* ---------------------------------------------------------------------- */
/* Drawer accordions                                                      */
/* ---------------------------------------------------------------------- */

function setupDrawerAccordions() {
  const groups = [...document.querySelectorAll(".config-drawer .config-group")]
    .filter((g) => !g.querySelector("h3")?.textContent.includes("Acerca de"));
  if (!groups.length) return;

  const key = "theremin_config_accordion";
  let openIndex = parseInt(localStorage.getItem(key), 10);
  if (!Number.isInteger(openIndex) || openIndex < 0 || openIndex >= groups.length) {
    openIndex = 0;
  }

  const applyOpen = (i) => {
    groups.forEach((group, idx) => {
      const open = idx === i;
      group.classList.toggle("open", open);
      const header = group.querySelector(".accordion-header");
      if (header) header.setAttribute("aria-expanded", String(open));
    });
    localStorage.setItem(key, String(i));
  };

  groups.forEach((group, i) => {
    const title = group.querySelector("h3");
    if (!title) return;
    const titleText = title.textContent;
    title.remove();

    const body = document.createElement("div");
    body.className = "accordion-body";
    while (group.firstChild) body.appendChild(group.firstChild);

    const header = document.createElement("button");
    header.type = "button";
    header.className = "accordion-header";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = titleText;
    const chevron = document.createElement("span");
    chevron.className = "accordion-chevron";
    chevron.textContent = "▾";
    header.append(titleSpan, chevron);

    group.prepend(header);
    group.appendChild(body);
    header.addEventListener("click", () => {
      const willOpen = !group.classList.contains("open");
      applyOpen(willOpen ? i : -1);
    });
  });

  applyOpen(openIndex);
}

setupDrawerAccordions();

/* ---------------------------------------------------------------------- */
/* Sensitivity sliders (bottom bar)                                       */
/* ---------------------------------------------------------------------- */

el.sensPos.value = String(gestureConfig.sensPos);
el.sensResp.value = String(gestureConfig.sensResp);

el.sensPos.addEventListener("input", () => {
  gestureConfig.sensPos = parseFloat(el.sensPos.value);
  saveGestureConfig();
});

el.sensResp.addEventListener("input", () => {
  gestureConfig.sensResp = parseFloat(el.sensResp.value);
  saveGestureConfig();
});

el.cfgToneSmoothing.addEventListener("input", () => {
  gestureConfig.toneSmoothing = parseFloat(el.cfgToneSmoothing.value);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgVolumeSmoothing.addEventListener("input", () => {
  gestureConfig.volumeSmoothing = parseFloat(el.cfgVolumeSmoothing.value);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgMinFreq.addEventListener("input", () => {
  let min = parseFloat(el.cfgMinFreq.value);
  const max = gestureConfig.maxFreq;
  if (min >= max) min = Math.max(40, max - 20);
  gestureConfig.minFreq = min;
  el.cfgMinFreq.value = String(min);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgMaxFreq.addEventListener("input", () => {
  let max = parseFloat(el.cfgMaxFreq.value);
  const min = gestureConfig.minFreq;
  if (max <= min) max = Math.min(2000, min + 20);
  gestureConfig.maxFreq = max;
  el.cfgMaxFreq.value = String(max);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgInvertTone.addEventListener("click", () => {
  gestureConfig.invertToneY = !gestureConfig.invertToneY;
  el.cfgInvertTone.setAttribute("aria-checked", String(gestureConfig.invertToneY));
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgInvertVolume.addEventListener("click", () => {
  gestureConfig.invertVolumeY = !gestureConfig.invertVolumeY;
  el.cfgInvertVolume.setAttribute("aria-checked", String(gestureConfig.invertVolumeY));
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgFistEnabled.addEventListener("click", () => {
  gestureConfig.fistEnabled = !gestureConfig.fistEnabled;
  el.cfgFistEnabled.setAttribute("aria-checked", String(gestureConfig.fistEnabled));
  if (!gestureConfig.fistEnabled) state.volumeFistMuted = false;
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgFistOn.addEventListener("input", () => {
  let v = parseFloat(el.cfgFistOn.value);
  v = Math.min(Math.max(v, gestureConfig.fistOff + 0.05), 0.95);
  gestureConfig.fistOn = v;
  el.cfgFistOn.value = String(v);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgFistOff.addEventListener("input", () => {
  let v = parseFloat(el.cfgFistOff.value);
  v = Math.max(Math.min(v, gestureConfig.fistOn - 0.05), 0.2);
  gestureConfig.fistOff = v;
  el.cfgFistOff.value = String(v);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgFistSnap.addEventListener("input", () => {
  gestureConfig.fistSnap = parseFloat(el.cfgFistSnap.value);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgFistCurlSmooth.addEventListener("input", () => {
  gestureConfig.curlSmooth = parseFloat(el.cfgFistCurlSmooth.value);
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgAnticipationEnabled.addEventListener("click", () => {
  gestureConfig.anticipationEnabled = !gestureConfig.anticipationEnabled;
  el.cfgAnticipationEnabled.setAttribute("aria-checked", String(gestureConfig.anticipationEnabled));
  saveGestureConfig();
  updateConfigReadouts();
});

el.cfgAnticipation.addEventListener("input", () => {
  gestureConfig.anticipation = parseFloat(el.cfgAnticipation.value);
  saveGestureConfig();
  updateConfigReadouts();
});

/* ---------------------------------------------------------------------- */
/* Effects (echo, flanger, reverb)                                       */
/* ---------------------------------------------------------------------- */

const FX_DEFAULTS = {
  echo: { enabled: false, wet: 0.4, time: 0.3, feedback: 0.35 },
  flanger: { enabled: false, wet: 0.5, rate: 0.4, depth: 0.002 },
  reverb: { enabled: false, wet: 0.35, size: 1.5 },
};

// Known/classic reference points (slapback ~70-150ms near-zero feedback, dub
// ~300-500ms with heavy feedback; slow ~0.1-0.2Hz flanger sweep vs. a faster
// "jet" one; room reverb ≤0.5s decay vs. hall's 1.8-2.2s), mapped onto our
// own slider ranges rather than copied as literal plugin defaults.
const FX_PRESETS = {
  echo: {
    slapback: { wet: 0.3, time: 0.1, feedback: 0.08 },
    clasico: { wet: 0.35, time: 0.35, feedback: 0.3 },
    dub: { wet: 0.45, time: 0.4, feedback: 0.6 },
  },
  flanger: {
    sutil: { wet: 0.3, rate: 0.5, depth: 0.001 },
    clasico: { wet: 0.5, rate: 0.15, depth: 0.003 },
    intenso: { wet: 0.6, rate: 2.5, depth: 0.005 },
  },
  reverb: {
    habitacion: { wet: 0.25, size: 0.5 },
    sala: { wet: 0.35, size: 2.0 },
    catedral: { wet: 0.45, size: 4.0 },
  },
};

const fx = (() => {
  const base = structuredClone(FX_DEFAULTS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EFFECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of ["echo", "flanger", "reverb"]) {
        if (parsed[key] && typeof parsed[key] === "object") {
          base[key] = { ...base[key], ...parsed[key] };
        }
      }
    }
  } catch (_) {}
  return base;
})();

let lastReverbSize = fx.reverb.size;

function saveEffects() {
  localStorage.setItem(STORAGE_KEY_EFFECTS, JSON.stringify(fx));
}

function makeImpulseBuffer(ctx, duration, decay) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * duration));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function applyEffects() {
  if (!audio.ready) return;
  const now = audio.ctx.currentTime;
  const { echo, flanger, reverb } = fx;

  audio.echoDelay.delayTime.setTargetAtTime(echo.time, now, RAMP);
  audio.echoFeedback.gain.setTargetAtTime(echo.feedback, now, RAMP);
  audio.echoWet.gain.setTargetAtTime(echo.enabled ? echo.wet : 0, now, RAMP);

  audio.flangerLfo.frequency.setTargetAtTime(flanger.rate, now, RAMP);
  audio.flangerDepth.gain.setTargetAtTime(flanger.enabled ? flanger.depth : 0, now, RAMP);
  audio.flangerWet.gain.setTargetAtTime(flanger.enabled ? flanger.wet : 0, now, RAMP);

  if (reverb.size !== lastReverbSize) {
    audio.reverbConvolver.buffer = makeImpulseBuffer(audio.ctx, reverb.size, 3);
    lastReverbSize = reverb.size;
  }
  audio.reverbWet.gain.setTargetAtTime(reverb.enabled ? reverb.wet : 0, now, RAMP);
}

function updateEffectsReadouts() {
  el.fxEchoWetVal.textContent = `${Math.round(fx.echo.wet * 100)}%`;
  el.fxEchoTimeVal.textContent = `${fx.echo.time.toFixed(2)} s`;
  el.fxEchoFeedbackVal.textContent = fx.echo.feedback.toFixed(2);
  el.fxFlangerWetVal.textContent = `${Math.round(fx.flanger.wet * 100)}%`;
  el.fxFlangerRateVal.textContent = `${fx.flanger.rate.toFixed(1)} Hz`;
  el.fxFlangerDepthVal.textContent = `${(fx.flanger.depth * 1000).toFixed(1)} ms`;
  el.fxReverbWetVal.textContent = `${Math.round(fx.reverb.wet * 100)}%`;
  el.fxReverbSizeVal.textContent = `${fx.reverb.size.toFixed(1)} s`;
}

function populateEffectsUI() {
  if (!el.fxEchoEnabled) return;
  el.fxEchoEnabled.setAttribute("aria-checked", String(fx.echo.enabled));
  el.fxEchoWet.value = String(fx.echo.wet);
  el.fxEchoTime.value = String(fx.echo.time);
  el.fxEchoFeedback.value = String(fx.echo.feedback);
  el.fxFlangerEnabled.setAttribute("aria-checked", String(fx.flanger.enabled));
  el.fxFlangerWet.value = String(fx.flanger.wet);
  el.fxFlangerRate.value = String(fx.flanger.rate);
  el.fxFlangerDepth.value = String(fx.flanger.depth * 1000);
  el.fxReverbEnabled.setAttribute("aria-checked", String(fx.reverb.enabled));
  el.fxReverbWet.value = String(fx.reverb.wet);
  el.fxReverbSize.value = String(fx.reverb.size);
  updateEffectsReadouts();
}

function toggleFx(toggleEl, key) {
  fx[key].enabled = toggleEl.getAttribute("aria-checked") !== "true";
  toggleEl.setAttribute("aria-checked", String(fx[key].enabled));
  saveEffects();
  applyEffects();
  updateEffectsReadouts();
}

if (el.fxEchoEnabled && el.fxFlangerEnabled && el.fxReverbEnabled) {
  const fxToggles = [
    [el.fxEchoEnabled, "echo"],
    [el.fxFlangerEnabled, "flanger"],
    [el.fxReverbEnabled, "reverb"],
  ];
  for (const [toggleEl, key] of fxToggles) {
    toggleEl.addEventListener("click", () => toggleFx(toggleEl, key));
  }

  const fxSliders = [
    [el.fxEchoWet, "echo", "wet"],
    [el.fxEchoTime, "echo", "time"],
    [el.fxEchoFeedback, "echo", "feedback"],
    [el.fxFlangerWet, "flanger", "wet"],
    [el.fxFlangerRate, "flanger", "rate"],
    [el.fxFlangerDepth, "flanger", "depth", (v) => parseFloat(v) / 1000],
    [el.fxReverbWet, "reverb", "wet"],
    [el.fxReverbSize, "reverb", "size"],
  ];
  for (const [input, fxKey, prop, parse = parseFloat] of fxSliders) {
    input.addEventListener("input", () => {
      fx[fxKey][prop] = parse(input.value);
      saveEffects();
      applyEffects();
      updateEffectsReadouts();
    });
  }

  populateEffectsUI();

  // Each effect's params live in a mini-accordion: the switch only enables/
  // disables (above), and this header (chevron + name) only expands/
  // collapses the params — the two are independent, siblings, not nested.
  for (const header of document.querySelectorAll(".fx-header")) {
    header.addEventListener("click", () => {
      const item = header.closest(".fx-item");
      const open = item.classList.toggle("open");
      header.setAttribute("aria-expanded", String(open));
    });
  }

  // Quick-apply known/classic effect presets (see FX_PRESETS above).
  // Applying one also enables the effect — picking "Dub" and having to
  // separately remember to flip the switch would be an easy miss.
  for (const btn of document.querySelectorAll(".fx-preset-btn")) {
    btn.addEventListener("click", () => {
      const preset = FX_PRESETS[btn.dataset.fx]?.[btn.dataset.preset];
      if (!preset) return;
      Object.assign(fx[btn.dataset.fx], preset, { enabled: true });
      saveEffects();
      applyEffects();
      populateEffectsUI();
    });
  }
}

/* ---------------------------------------------------------------------- */
/* Presets (guardar/cargar configuraciones completas)                    */
/* ---------------------------------------------------------------------- */

const STORAGE_KEY_PRESETS = "theremin_presets";

function loadPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESETS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function savePresets() {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
}

let presets = loadPresets();

// Snapshot of every "how you play" setting — everything a preset should
// restore. Purely visual/per-device prefs (theme, drawer width) are excluded
// on purpose: those belong to the browser, not to a performance preset.
function buildPresetSnapshot() {
  return {
    gestureConfig: { ...gestureConfig },
    fx: structuredClone(fx),
    instrument: currentInstrument,
    waveform: el.waveformSelect.value,
    maxVolume: parseFloat(el.maxVolume.value),
    registerMap: { ...registerMap },
    pianoMode: state.pianoMode,
    chordType: state.chordType,
    toneHand: state.toneHand,
  };
}

function applyPresetSnapshot(snapshot) {
  gestureConfig = { ...GESTURE_DEFAULTS };
  if (snapshot.gestureConfig && typeof snapshot.gestureConfig === "object") {
    for (const key of Object.keys(GESTURE_DEFAULTS)) {
      if (typeof snapshot.gestureConfig[key] === typeof GESTURE_DEFAULTS[key]) {
        gestureConfig[key] = snapshot.gestureConfig[key];
      }
    }
  }
  if (gestureConfig.minFreq >= gestureConfig.maxFreq) gestureConfig.maxFreq = gestureConfig.minFreq + 20;
  saveGestureConfig();

  for (const key of ["echo", "flanger", "reverb"]) {
    const saved = snapshot.fx && snapshot.fx[key];
    fx[key] = saved && typeof saved === "object" ? { ...FX_DEFAULTS[key], ...saved } : { ...FX_DEFAULTS[key] };
  }
  lastReverbSize = fx.reverb.size;
  saveEffects();

  registerMap = snapshot.registerMap && typeof snapshot.registerMap === "object" ? { ...snapshot.registerMap } : {};
  saveRegisterMap();

  state.pianoMode = !!snapshot.pianoMode;
  localStorage.setItem(STORAGE_KEY_MODE, state.pianoMode ? "piano" : "theremin");

  state.chordType = CHORDS[snapshot.chordType] ? snapshot.chordType : "mayor";
  localStorage.setItem(STORAGE_KEY_CHORD, state.chordType);

  if (snapshot.toneHand === "left" || snapshot.toneHand === "right") {
    state.toneHand = snapshot.toneHand;
    saveHandConfig(state.toneHand);
  }

  const maxVol = Number.isFinite(snapshot.maxVolume) ? Math.min(1, Math.max(0, snapshot.maxVolume)) : loadMaxVolume();
  el.maxVolume.value = String(maxVol);
  localStorage.setItem(STORAGE_KEY_MAXVOL, el.maxVolume.value);

  el.waveformSelect.value = typeof snapshot.waveform === "string" ? snapshot.waveform : loadWaveform();
  localStorage.setItem(STORAGE_KEY_WAVEFORM, el.waveformSelect.value);

  applyInstrument(snapshot.instrument === "custom" || INSTRUMENTS[snapshot.instrument] ? snapshot.instrument : currentInstrument);
  applyEffects();

  populateConfigUI();
  populateEffectsUI();
  el.sensPos.value = String(gestureConfig.sensPos);
  el.sensResp.value = String(gestureConfig.sensResp);
  syncModeUI();
  syncToneHandUI();
  syncRegisterUI();
}

function renderPresetList() {
  if (!el.presetList) return;
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  el.presetList.innerHTML = "";

  if (!names.length) {
    const empty = document.createElement("p");
    empty.className = "preset-empty";
    empty.textContent = "Sin preajustes guardados todavía.";
    el.presetList.appendChild(empty);
    return;
  }

  for (const name of names) {
    const item = document.createElement("li");
    item.className = "preset-item";

    const label = document.createElement("span");
    label.className = "preset-name";
    label.textContent = name;
    label.title = name;

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn-preset-load";
    loadBtn.textContent = "Cargar";
    loadBtn.addEventListener("click", () => applyPresetSnapshot(presets[name]));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-preset-delete";
    delBtn.textContent = "🗑️";
    delBtn.title = `Eliminar "${name}"`;
    delBtn.addEventListener("click", () => {
      if (!confirm(`¿Eliminar el preajuste "${name}"?`)) return;
      delete presets[name];
      savePresets();
      renderPresetList();
    });

    item.append(label, loadBtn, delBtn);
    el.presetList.appendChild(item);
  }
}

if (el.btnPresetSave && el.presetNameInput) {
  el.btnPresetSave.addEventListener("click", () => {
    const name = el.presetNameInput.value.trim();
    if (!name) {
      el.presetNameInput.focus();
      return;
    }
    if (presets[name] && !confirm(`Ya existe un preajuste "${name}". ¿Sobrescribirlo?`)) return;

    presets[name] = buildPresetSnapshot();
    savePresets();
    el.presetNameInput.value = "";
    renderPresetList();
  });

  el.presetNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") el.btnPresetSave.click();
  });

  renderPresetList();
}

// Export/import as real files: localStorage only persists in this browser
// on this device — a plain JSON download/upload works everywhere (no extra
// permissions) and lets presets move between browsers, computers, or just
// get backed up.
if (el.btnPresetExport) {
  el.btnPresetExport.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "theremin-presets.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

if (el.btnPresetImport && el.presetImportInput) {
  el.btnPresetImport.addEventListener("click", () => el.presetImportInput.click());

  el.presetImportInput.addEventListener("change", async () => {
    const file = el.presetImportInput.files[0];
    el.presetImportInput.value = ""; // allow re-selecting the same file later
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("el archivo no tiene el formato esperado");

      let imported = 0;
      for (const [name, snapshot] of Object.entries(parsed)) {
        if (!name || !snapshot || typeof snapshot !== "object") continue;
        if (presets[name] && !confirm(`Ya existe un preajuste "${name}". ¿Sobrescribirlo?`)) continue;
        presets[name] = snapshot;
        imported++;
      }
      if (imported > 0) {
        savePresets();
        renderPresetList();
      }
    } catch (err) {
      alert(`No se pudo importar el archivo: ${err.message}`);
    }
  });
}

populateConfigUI();

/* ---------------------------------------------------------------------- */
/* Play screen controls                                                  */
/* ---------------------------------------------------------------------- */

el.waveformSelect.value = loadWaveform();
el.waveformSelect.addEventListener("change", () => {
  // Only reachable when instrument === "custom" (select is disabled otherwise).
  audio.setWaveform(el.waveformSelect.value);
  localStorage.setItem(STORAGE_KEY_WAVEFORM, el.waveformSelect.value);
});

el.instrumentSelect.addEventListener("change", () => {
  applyInstrument(el.instrumentSelect.value);
});

function syncRegisterUI() {
  const reg = registerMap[currentInstrument] !== undefined ? registerMap[currentInstrument] : "normal";
  el.registerButtons.forEach((b) => b.classList.toggle("selected", b.dataset.register === reg));
}

function changeRegister(reg) {
  registerMap[currentInstrument] = reg;
  saveRegisterMap();
  if (state.smoothedY.tone !== null && state.smoothedY.tone !== undefined) {
    let freq = yToFrequency(state.smoothedY.tone, toneMappingOpts());
    if (state.pianoMode) {
      freq = quantizeToSemitone(freq);
      state.pianoKey = freqToMidi(freq);
    }
    state.lastFreq = freq;
    // Keeps the same voicing (chord vs. single note) the hand was already
    // playing instead of guessing hand posture without fresh landmarks.
    // In piano mode this always goes through tuneChord (even for a single
    // note, as voicing [0]) so a stale extra chord voice never keeps
    // droning on — setFrequency only ever touches osc1/osc2, never gains.
    if (state.pianoMode) {
      audio.tuneChord(freq, state.playingChord ? getChordVoicing() : [0]);
    } else {
      audio.setFrequency(freq);
    }
  }
  syncRegisterUI();
}

el.registerButtons.forEach((b) => {
  b.addEventListener("click", () => changeRegister(b.dataset.register));
});

applyInstrument(loadInstrument());

el.maxVolume.value = String(loadMaxVolume());
el.maxVolume.addEventListener("input", () => {
  localStorage.setItem(STORAGE_KEY_MAXVOL, el.maxVolume.value);
});

el.btnMute.addEventListener("click", () => {
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  el.btnMute.textContent = state.muted ? "🔇" : "🔊";
  el.btnMute.setAttribute("aria-pressed", String(state.muted));
});

function syncToneHandUI() {
  el.btnReconfigBar.title = `Intercambiar mano de tono (ahora: ${state.toneHand === "left" ? "izquierda" : "derecha"})`;
  el.btnReconfigBar.textContent = state.toneHand === "left" ? "🤚" : "✋";
}

function syncModeUI() {
  const piano = state.pianoMode;
  el.btnMode.textContent = piano ? "🎹 Piano" : "📻 Theremin";
  el.btnMode.setAttribute("aria-pressed", String(piano));
  el.btnMode.title = piano ? "Modo theremin" : "Modo piano";
  if (el.modeVal) el.modeVal.textContent = piano ? "Piano" : "Theremin";
  if (el.chordControl) el.chordControl.classList.toggle("disabled", !piano);
  el.chordButtons.forEach((b) => b.classList.toggle("selected", b.dataset.chord === state.chordType));
}

el.btnMode.addEventListener("click", () => {
  state.pianoMode = !state.pianoMode;
  localStorage.setItem(STORAGE_KEY_MODE, state.pianoMode ? "piano" : "theremin");
  if (audio.ready) applyInstrument(currentInstrument);
  syncModeUI();
});

el.chordButtons.forEach((b) => {
  b.addEventListener("click", () => {
    state.chordType = b.dataset.chord;
    localStorage.setItem(STORAGE_KEY_CHORD, state.chordType);
    if (audio.ready && state.pianoMode && state.playingChord) {
      audio.tuneChord(state.lastFreq, getChordVoicing());
      audio.strikeKey();
    }
    syncModeUI();
  });
});

syncModeUI();

/* ---------------------------------------------------------------------- */
/* Visualization (reacts to real AnalyserNode data)                      */
/* ---------------------------------------------------------------------- */

const vizCtx = el.vizCanvas.getContext("2d");
let timeData = null;
let freqData = null;

function resizeVizCanvas() {
  const rect = el.vizCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.vizCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  el.vizCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

window.addEventListener("resize", resizeVizCanvas);

function drawVisualization() {
  const w = el.vizCanvas.width;
  const h = el.vizCanvas.height;
  if (w === 0 || h === 0) return;

  vizCtx.fillStyle = "rgba(11, 14, 20, 0.25)";
  vizCtx.fillRect(0, 0, w, h);

  if (!audio.ready) return;

  if (!timeData || timeData.length !== audio.analyser.fftSize) {
    timeData = new Uint8Array(audio.analyser.fftSize);
    freqData = new Uint8Array(audio.analyser.frequencyBinCount);
  }
  audio.analyser.getByteTimeDomainData(timeData);
  audio.analyser.getByteFrequencyData(freqData);

  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  const amplitude = sum / freqData.length / 255; // 0..1

  const freq = audio.ready ? audio.osc1.frequency.value : gestureConfig.minFreq;
  const t = clamp01(Math.log2(freq / gestureConfig.minFreq) / Math.log2(gestureConfig.maxFreq / gestureConfig.minFreq));
  const hue = 190 + t * 130; // cyan -> magenta

  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(w, h) * 0.22;

  vizCtx.beginPath();
  const n = timeData.length;
  const step = Math.max(1, Math.floor(n / 256));
  let first = true;
  for (let i = 0; i < n; i += step) {
    const v = (timeData[i] - 128) / 128; // -1..1
    const angle = (i / n) * Math.PI * 2;
    const r = baseRadius + v * baseRadius * 0.9 * (0.3 + amplitude);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (first) {
      vizCtx.moveTo(x, y);
      first = false;
    } else {
      vizCtx.lineTo(x, y);
    }
  }
  vizCtx.closePath();
  vizCtx.strokeStyle = `hsl(${hue}, 90%, 65%)`;
  vizCtx.lineWidth = 2 + amplitude * 4;
  vizCtx.shadowColor = `hsl(${hue}, 90%, 60%)`;
  vizCtx.shadowBlur = 12 * amplitude;
  vizCtx.stroke();

  vizCtx.beginPath();
  vizCtx.arc(cx, cy, baseRadius * 0.35 * (0.5 + amplitude), 0, Math.PI * 2);
  vizCtx.fillStyle = `hsla(${hue}, 90%, 60%, ${0.15 + amplitude * 0.4})`;
  vizCtx.fill();
}

/* ---------------------------------------------------------------------- */
/* Main detection + render loop                                          */
/* ---------------------------------------------------------------------- */

function processFrame(video, overlayCanvas, labelLayer, timestampMs, isPlayScreen) {
  resizeCanvasToVideo(overlayCanvas, video);
  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (video.readyState < 2) return { left: null, right: null, faceOn: { left: 1, right: 1 }, count: 0 };

  const result = state.handLandmarker.detectForVideo(video, timestampMs);

  const hands = { left: null, right: null };
  const faceOn = { left: 1, right: 1 };
  let count = 0;

  if (result.landmarks && result.landmarks.length) {
    const detections = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      detections.push({
        landmarks: result.landmarks[i],
        worldLandmarks: result.worldLandmarks[i],
        modelLabel: result.handednesses[i][0].categoryName, // 'Left' | 'Right'
        palmX: result.landmarks[i][PALM_LANDMARK].x,
      });
    }

    const assigned = assignHandSides(detections, state.lastPalmX);

    for (const side of ["left", "right"]) {
      const det = assigned[side];
      if (det) {
        hands[side] = det.landmarks;
        faceOn[side] = palmFaceOn(det.worldLandmarks);
        state.lastPalmX[side] = det.palmX;
        count++;
      }
    }

    for (const side of ["left", "right"]) {
      if (hands[side]) {
        // A hand turning edge-on to the camera is exactly where tracking
        // gets unreliable (see palmFaceOn/updatePlayAudio's use of it below)
        // — flag it visually before it actually drops out, not after.
        const color =
          faceOn[side] < FACEON_WARN_THRESHOLD
            ? "#fbbf24"
            : side === state.toneHand
              ? "#4fd1ff"
              : "#ff6ec7";
        drawHandSkeleton(ctx, hands[side], color);
      }
    }
  }

  // Labels
  const toneLabel = ensureLabel(labelLayer, "tone", "TONO 🎵");
  const volumeLabel = ensureLabel(labelLayer, "volume", "VOLUMEN 🔊");
  if (state.toneHand) {
    positionLabel(toneLabel, hands[state.toneHand]?.[PALM_LANDMARK], labelLayer);
    positionLabel(volumeLabel, hands[otherHand(state.toneHand)]?.[PALM_LANDMARK], labelLayer);
  } else {
    toneLabel.style.display = "none";
    volumeLabel.style.display = "none";
  }

  return { ...hands, faceOn, count };
}

/* Tracks how long both hands have been continuously visible on the setup
   screen and reflects it in the status text + progress bar; enables
   "Comenzar a tocar" only once the hold completes (calibrationStatus in
   lib/theremin-core.js decides the text/progress, this just supplies the
   elapsed time and applies the result to the DOM). */
// Purely informational: shows progress toward a good calibration (helps
// assignHandSides' position continuity start with real data) but never
// blocks "Comenzar a tocar" — detection quality varies a lot by camera/
// lighting, and gating the button on it means anyone with imperfect
// tracking would be flatly unable to start the app.
function updateSetupCalibration(count, now) {
  const cal = state.calibration;
  // Clamp dt so a backgrounded tab (huge gap between frames) can't insta-fill.
  const dt = cal.lastFrameTime === null ? 0 : Math.min(now - cal.lastFrameTime, 100);
  cal.lastFrameTime = now;

  if (!cal.done) {
    cal.heldMs =
      count === 2
        ? Math.min(CALIBRATION_HOLD_MS, cal.heldMs + dt)
        : Math.max(0, cal.heldMs - dt * CALIBRATION_DECAY_RATE);
  }

  const status = calibrationStatus(count, cal.heldMs, cal.done, CALIBRATION_HOLD_MS);
  if (status.ready && !cal.done) cal.done = true;

  el.setupDetectStatus.textContent = status.text;
  if (el.calibProgressFill) el.calibProgressFill.style.width = `${status.progress * 100}%`;
  if (el.calibProgress) el.calibProgress.classList.toggle("visible", count > 0 && !cal.done);
}

/* "Calibrar mis límites": the user moves each hand through *their own*
   comfortable reach (not the screen's corners) for a few seconds; this just
   tracks the min/max palm X/Y actually observed per side. remapToRange()
   (lib/theremin-core.js) uses the result later to map that personal range to
   the full pitch/volume span instead of the raw camera frame. */
function startLimitsCapture() {
  state.limitsCapture = { endAt: performance.now() + LIMITS_CAPTURE_MS, left: null, right: null };
  if (el.btnCalibrateLimits) el.btnCalibrateLimits.disabled = true;
}

function updateLimitsCapture(hands, now) {
  const cap = state.limitsCapture;

  for (const side of ["left", "right"]) {
    const landmarks = hands[side];
    if (!landmarks) continue;
    const { x, y } = landmarks[PALM_LANDMARK];
    if (!cap[side]) {
      cap[side] = { minX: x, maxX: x, minY: y, maxY: y };
    } else {
      const r = cap[side];
      r.minX = Math.min(r.minX, x);
      r.maxX = Math.max(r.maxX, x);
      r.minY = Math.min(r.minY, y);
      r.maxY = Math.max(r.maxY, y);
    }
  }

  const remainingMs = cap.endAt - now;
  el.setupDetectStatus.textContent = `🎯 Moviendo tus manos a tus límites… ${Math.max(0, remainingMs / 1000).toFixed(1)}s`;

  if (remainingMs > 0) return;

  for (const side of ["left", "right"]) {
    if (cap[side]) handRanges[side] = cap[side];
  }
  saveHandRanges();
  state.limitsCapture = null;
  if (el.btnCalibrateLimits) el.btnCalibrateLimits.disabled = false;
}

if (el.btnCalibrateLimits) {
  el.btnCalibrateLimits.addEventListener("click", startLimitsCapture);
}

function loop() {
  requestAnimationFrame(loop);
  if (!state.handLandmarker) return;

  const now = performance.now();

  if (state.activeScreen === "setup") {
    const hands = processFrame(el.videoSetup, el.overlaySetup, el.labelLayerSetup, now, false);
    if (state.limitsCapture) {
      updateLimitsCapture(hands, now);
    } else {
      updateSetupCalibration(hands.count, now);
    }
  } else if (state.activeScreen === "play") {
    const hands = processFrame(el.videoPlay, el.overlayPlay, el.labelLayerPlay, now, true);
    updatePlayAudio(hands);
    el.handsStatus.textContent = `Manos: ${hands.count}/2`;
  }

  if (state.activeScreen === "play") {
    resizeVizCanvasIfNeeded();
    drawVisualization();
  }
}

let lastVizSize = "";
function resizeVizCanvasIfNeeded() {
  const rect = el.vizCanvas.getBoundingClientRect();
  const key = `${rect.width}x${rect.height}`;
  if (key !== lastVizSize) {
    lastVizSize = key;
    resizeVizCanvas();
  }
}

// faceOn (0..1, from palmFaceOn) softens position smoothing as a hand turns
// edge-on to the camera: readings get noisier right as tracking gets
// unreliable, so trust each frame less (smaller smoothPos) instead of
// reacting to jitter at full strength. 1 = no attenuation (default).
function axisOpts(smoothing, faceOn = 1) {
  const trust = Math.max(FACEON_SMOOTH_FLOOR, faceOn);
  return {
    smoothPos: Math.min(0.95, smoothing * gestureConfig.sensResp * trust),
    smoothVel: VELOCITY_SMOOTH,
    anticipation: gestureConfig.anticipationEnabled ? gestureConfig.anticipation : 0,
  };
}

function updatePlayAudio(hands) {
  if (!state.toneHand) return;

  const toneLandmarks = hands[state.toneHand];
  const volumeLandmarks = hands[otherHand(state.toneHand)];
  const maxVol = parseFloat(el.maxVolume.value);
  const toneOpts = axisOpts(gestureConfig.toneSmoothing, hands.faceOn?.[state.toneHand]);

  let toneY = null;
  if (toneLandmarks) {
    if (toneTracker.coasting) toneTracker.reset();
    toneY = toneTracker.update(remapHandY(state.toneHand, toneLandmarks[PALM_LANDMARK].y), performance.now(), toneOpts);
    toneTracker.coasting = false;
  } else if (gestureConfig.anticipationEnabled && toneTracker.position !== null) {
    // Fill missing hand data with an inferred position: keep gliding at the
    // last velocity (as if the arm kept going up) so the note keeps climbing
    // instead of freezing. clamp01 in update() caps the glide at the bounds.
    toneY = toneTracker.coast(performance.now(), toneOpts);
    toneTracker.coasting = true;
  } else {
    toneTracker.reset();
  }

  if (toneY !== null) {
    state.smoothedY.tone = toneY;
    state.lastFreq = yToFrequency(state.smoothedY.tone, toneMappingOpts());

    if (state.pianoMode) {
      const quantized = quantizeToSemitone(state.lastFreq);
      state.lastFreq = quantized;
      const key = freqToMidi(quantized);
      const keyChanged = key !== state.pianoKey;
      state.pianoKey = key;

      if (toneLandmarks && isPianoChordHand(toneLandmarks)) {
        state.playingChord = true;
        audio.tuneChord(quantized, getChordVoicing());
        if (keyChanged) maybeStrikeKey();
      } else {
        state.playingChord = false;
        // tuneChord with a single-note voicing (not setFrequency): it always
        // recomputes all 4 oscillator gains from the voicing, so switching
        // out of chord posture can't leave a stale chord voice (e.g. osc3/4
        // from the last chord) droning on at its old, now-unrelated pitch —
        // setFrequency only ever touched osc1/osc2's frequency, never gains.
        audio.tuneChord(quantized, [0]);
        if (keyChanged) maybeStrikeKey();
      }
    } else {
      state.pianoKey = null;
      state.playingChord = false;
      audio.setFrequency(state.lastFreq);
    }
  }

  if (volumeLandmarks) {
    const rawY = remapHandY(otherHand(state.toneHand), volumeLandmarks[PALM_LANDMARK].y);
    const smoothedVolume = volumeTracker.update(
      rawY,
      performance.now(),
      axisOpts(gestureConfig.volumeSmoothing, hands.faceOn?.[otherHand(state.toneHand)])
    );

    const curl = computeHandCurl(volumeLandmarks);

    if (gestureConfig.fistEnabled) {
      const now = performance.now();
      let rawVelocity = 0;
      if (state.volumeCurl !== null) {
        const dt = Math.max((now - state.volumeCurlTimestamp) / 1000, 1 / 120);
        rawVelocity = (curl - state.volumeCurl) / dt;
        state.volumeCurlVelocity += (rawVelocity - state.volumeCurlVelocity) * gestureConfig.curlSmooth;
      }
      state.volumeCurl = curl;
      state.volumeCurlTimestamp = now;

      const wasFistMuted = state.volumeFistMuted;
      if (state.volumeFistMuted) {
        if (curl < gestureConfig.fistOff) {
          state.volumeFistMuted = false;
          state.fistReleasing = true;
        }
      } else if (curl > gestureConfig.fistOn) {
        state.volumeFistMuted = true;
        state.fistReleasing = false;
      }

      // Snapping shut fast still cuts instantly (hard mute). Closing slowly
      // fades through the openness multiplier until the fist threshold; while
      // the fist is held closed the volume stays exactly at 0 (a residual
      // openness level would leak a faint hum back after the hard cut). On
      // release the volume starts at 0 and rises continuously in proportion
      // to how open the hand becomes (releaseFactor), so opening slowly
      // returns the volume slowly with no jump.
      const fastClose = Math.max(rawVelocity, state.volumeCurlVelocity) > gestureConfig.fistSnap;
      const justSnappedShut = state.volumeFistMuted && !wasFistMuted && fastClose;

      if (justSnappedShut) {
        audio.hardMute();
      } else if (state.volumeFistMuted) {
        audio.setVolume(0);
      } else {
        const openness = clamp01(1 - curl);
        let releaseFactor = 1;
        if (state.fistReleasing) {
          releaseFactor = clamp01((gestureConfig.fistOff - curl) / gestureConfig.fistOff);
          if (releaseFactor >= 1) state.fistReleasing = false;
        }
        const level = yToVolume(smoothedVolume, volumeMappingOpts()) * maxVol * openness * releaseFactor;
        audio.setVolume(level);
      }
    } else {
      state.volumeFistMuted = false;
      state.fistReleasing = false;
      const level = yToVolume(smoothedVolume, volumeMappingOpts()) * maxVol;
      audio.setVolume(level);
    }
  } else {
    // Mano de volumen fuera de cámara: mantener el último volumen, no silenciar.
    volumeTracker.reset();
    state.volumeFistMuted = false;
    state.fistReleasing = false;
  }

  const note = frequencyToNote(state.lastFreq);
  if (state.playingChord) {
    const chord = CHORDS[state.chordType] || CHORDS.mayor;
    el.noteReadout.textContent = `${note} ${chord.label} — ${state.lastFreq.toFixed(1)} Hz`;
  } else {
    el.noteReadout.textContent = `${state.lastFreq.toFixed(1)} Hz — ${note}`;
  }

  const volumeLabel = el.labelLayerPlay.querySelector(".volume");
  if (volumeLabel) {
    volumeLabel.classList.toggle("fist-muted", state.volumeFistMuted);
    volumeLabel.textContent = state.volumeFistMuted ? "VOLUMEN 🔊 ✊" : "VOLUMEN 🔊";
  }

  const toneLabel = el.labelLayerPlay.querySelector(".tone");
  if (toneLabel) {
    toneLabel.textContent = state.playingChord ? "ACORDE 🎹" : "TONO";
  }
}

/* ---------------------------------------------------------------------- */
/* Boot sequence                                                         */
/* ---------------------------------------------------------------------- */

function afterCameraReady() {
  applySelectedOption();
  syncToneHandUI();
  state.calibration = { heldMs: 0, done: false, lastFrameTime: null };
  el.btnStart.disabled = false;
  showScreen("setup");
  requestAnimationFrame(loop);
}

async function boot() {
  showScreen("loading");
  console.log("[boot] boot() iniciado — APP_VERSION:", APP_VERSION);
  let bootTimedOut = false;
  const deadline = setTimeout(() => {
    if (state.activeScreen !== "error") {
      bootTimedOut = true;
      console.warn("[boot] TIMEOUT 25s — carga demasiado lenta");
      el.errorTitle.textContent = "La carga está tardando demasiado";
      el.errorMessage.textContent =
        "No se pudo descargar el modelo de detección o acceder a la cámara. Revisa tu conexión (el modelo se descarga de Google) y confirma el permiso de cámara, y vuelve a intentar.";
      showScreen("error");
    }
  }, 25000);

  try {
    el.loadingText.textContent = "Cargando modelo de detección de manos…";
    console.log("[boot] antes de setupHandLandmarker");
    await setupHandLandmarker();
    console.log("[boot] setupHandLandmarker terminado");

    el.loadingText.textContent = "Solicitando acceso a la cámara…";
    console.log("[boot] antes de setupCamera");
    await setupCamera();
    console.log("[boot] setupCamera terminado");

    clearTimeout(deadline);
    if (bootTimedOut) return;
    afterCameraReady();
    console.log("[boot] afterCameraReady OK");
  } catch (err) {
    clearTimeout(deadline);
    if (state.activeScreen !== "error") {
      el.errorTitle.textContent = "Ocurrió un error al iniciar";
      el.errorMessage.textContent = String(err && err.message ? err.message : err);
      showScreen("error");
    }
    console.error("[boot] error:", err);
  }
}

boot();
