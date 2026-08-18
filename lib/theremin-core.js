/* ---------------------------------------------------------------------- */
/* Theremin core: pure logic (mapping, gesture geometry, music theory).   */
/* No DOM, no Web Audio, no localStorage — safe to unit test in Node and  */
/* to import from the browser as a plain ES module.                      */
/* ---------------------------------------------------------------------- */

export const PALM_LANDMARK = 9; // middle-finger MCP, stable "palm center" point

export const AUDIBLE_MIN = 20;
export const AUDIBLE_MAX = 12000;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Register shifts the pitch range by whole octaves. The three base bands
// (grave/normal/agudo) shift both ends together, preserving the span each
// instrument's minFreq/maxFreq covers. The two combined bands instead shift
// each end independently, spanning from one band's low end to the other
// band's high end — covering both ranges at once instead of just shifting.
export const REGISTERS = {
  grave: { label: "Grave", minOctaves: -1, maxOctaves: -1 },
  normal: { label: "Normal", minOctaves: 0, maxOctaves: 0 },
  agudo: { label: "Agudo", minOctaves: 1, maxOctaves: 1 },
  "grave-normal": { label: "Grave-Normal", minOctaves: -1, maxOctaves: 0 },
  "normal-agudo": { label: "Normal-Agudo", minOctaves: 0, maxOctaves: 1 },
};

// Chord voicings (intervals in semitones above the root).
export const CHORDS = {
  mayor: { label: "Mayor", semitones: [0, 4, 7] },
  menor: { label: "Menor", semitones: [0, 3, 7] },
  septima: { label: "7ª", semitones: [0, 4, 7, 10] },
  sus4: { label: "Sus4", semitones: [0, 5, 7] },
  quinta: { label: "Quinta", semitones: [0, 7] },
};

// "Piano hand" posture thresholds: open palm + spread fingers.
export const PIANO_OPEN_MAX = 0.45; // computeHandCurl (0 = fully open, 1 = fist)
export const PIANO_SPREAD_MIN = 0.4; // fingertip spread normalized by hand size

export const FIST_FINGERS = [
  { mcp: 5, tip: 8 },
  { mcp: 9, tip: 12 },
  { mcp: 13, tip: 16 },
  { mcp: 17, tip: 20 },
];
// tip-to-wrist / mcp-to-wrist distance ratio: ~2.0 for a fully extended
// finger, ~1.0 (or less) fully curled into the palm.
export const CURL_OPEN_RATIO = 2.0;
export const CURL_CLOSED_RATIO = 1.0;

// Fingertips used for the "spread fingers" piano gesture.
export const PIANO_TIPS = [8, 12, 16, 20];

/* ---------------------------------------------------------------------- */
/* Mapping helpers                                                       */
/* ---------------------------------------------------------------------- */

export function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Remaps a raw normalized coordinate (camera-frame Y or X, 0..1) through a
 * user-calibrated comfortable range, so *their* observed min/max reach maps
 * to the full 0..1 output instead of the raw camera frame's edges. With no
 * range (not calibrated yet, or too narrow to trust) it's a passthrough —
 * calibration is additive, never required.
 * @param {number} value raw normalized [0,1] coordinate
 * @param {{min: number, max: number} | null | undefined} range observed
 * comfortable bounds from the calibration exercise
 * @param {number} minSpread minimum (max-min) to trust the range at all —
 * guards against a near-static capture producing a hair-trigger mapping
 */
export function remapToRange(value, range, minSpread = 0.15) {
  if (!range || !(range.max - range.min >= minSpread)) return clamp01(value);
  return clamp01((value - range.min) / (range.max - range.min));
}

/**
 * Maps a normalized hand-Y (0 = top, 1 = bottom of frame) to a frequency in
 * Hz, honoring inversion, position sensitivity and the current register.
 * minFactor/maxFactor let a register widen the span asymmetrically (see
 * REGISTERS' combined bands) instead of just shifting it uniformly.
 * @param {number} y normalized [0,1] hand Y position
 * @param {{inverted?: boolean, minFreq: number, maxFreq: number, sensPos?: number, minFactor?: number, maxFactor?: number}} opts
 */
export function yToFrequency(y, { inverted = false, minFreq, maxFreq, sensPos = 1, minFactor = 1, maxFactor = 1 } = {}) {
  const raw = inverted ? clamp01(y) : 1 - clamp01(y);
  const t = clamp01((raw - 0.5) * sensPos + 0.5);
  const effectiveMin = minFreq * minFactor;
  const effectiveMax = maxFreq * maxFactor;
  const freq = effectiveMin * Math.pow(effectiveMax / effectiveMin, t);
  return Math.min(AUDIBLE_MAX, Math.max(AUDIBLE_MIN, freq));
}

/**
 * Maps a normalized hand-Y to a volume level in [0,1], honoring inversion and
 * position sensitivity.
 * @param {number} y normalized [0,1] hand Y position
 * @param {{inverted?: boolean, sensPos?: number}} opts
 */
export function yToVolume(y, { inverted = false, sensPos = 1 } = {}) {
  const raw = inverted ? clamp01(y) : 1 - clamp01(y);
  return clamp01((raw - 0.5) * sensPos + 0.5);
}

/** Octave min/max multipliers for a named register (both 1 = "normal"/unrecognized). */
export function registerFactors(registerName) {
  const reg = REGISTERS[registerName];
  if (!reg) return { minFactor: 1, maxFactor: 1 };
  return { minFactor: Math.pow(2, reg.minOctaves), maxFactor: Math.pow(2, reg.maxOctaves) };
}

/* ---------------------------------------------------------------------- */
/* Music theory                                                          */
/* ---------------------------------------------------------------------- */

export function freqToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function quantizeToSemitone(freq) {
  const midi = freqToMidi(freq);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToNote(freq) {
  const midi = freqToMidi(freq);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Maps a chord voicing (semitone offsets above the root) onto a fixed number
 * of oscillator "voices", splitting gain evenly across the notes actually
 * used. Voices beyond the voicing's length come back as `null` (silent) —
 * the caller must leave their frequency alone and just zero their gain,
 * since `null / 12` is NaN and would make an AudioParam reject the value.
 * @param {number} rootFreq
 * @param {number[]} voicing semitone offsets, e.g. CHORDS.mayor.semitones
 * @param {number} voiceCount total oscillators available (theremin: 4)
 * @returns {({freq: number, gain: number} | null)[]}
 */
export function chordVoiceFrequencies(rootFreq, voicing, voiceCount = 4) {
  const gain = voicing.length ? 1 / voicing.length : 0;
  const voices = [];
  for (let i = 0; i < voiceCount; i++) {
    const semitones = voicing[i];
    voices.push(semitones === undefined ? null : { freq: rootFreq * Math.pow(2, semitones / 12), gain });
  }
  return voices;
}

/* ---------------------------------------------------------------------- */
/* Hand geometry / gesture recognition                                   */
/* ---------------------------------------------------------------------- */

export function landmarkDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* 0 = hand fully open, 1 = fully closed fist. Averaging four fingers' curl
   (thumb excluded, its geometry is unreliable for this) instead of a single
   binary gesture lets us tell a fast snap-shut from a slow, deliberate close. */
export function computeHandCurl(landmarks) {
  const wrist = landmarks[0];
  let total = 0;
  for (const f of FIST_FINGERS) {
    const mcpDist = landmarkDist(wrist, landmarks[f.mcp]);
    const tipDist = landmarkDist(wrist, landmarks[f.tip]);
    const ratio = tipDist / mcpDist;
    total += clamp01((CURL_OPEN_RATIO - ratio) / (CURL_OPEN_RATIO - CURL_CLOSED_RATIO));
  }
  return total / FIST_FINGERS.length;
}

/* Piano-hand posture: palm open (low curl) with the four fingertips spread
   apart. Spread is the mean distance between adjacent fingertips normalized by
   the hand size (wrist-to-middle-MCP), so it works at any distance/size. */
export function computePianoHand(landmarks) {
  const open = computeHandCurl(landmarks) < PIANO_OPEN_MAX;
  const wrist = landmarks[0];
  const handSize = Math.max(landmarkDist(wrist, landmarks[PALM_LANDMARK]), 1e-4);
  let span = 0;
  for (let i = 0; i < PIANO_TIPS.length - 1; i++) {
    span += landmarkDist(landmarks[PIANO_TIPS[i]], landmarks[PIANO_TIPS[i + 1]]);
  }
  const spread = span / (PIANO_TIPS.length - 1) / handSize;
  return { open, spread };
}

export function isPianoChordHand(landmarks) {
  const g = computePianoHand(landmarks);
  return g.open && g.spread > PIANO_SPREAD_MIN;
}

/* MediaPipe's hand model is trained mostly on faces-the-camera poses; a hand
   rotated ~90° so only its edge shows presents far less visual signal and
   tracks noticeably worse. worldLandmarks (HandLandmarkerResult) are real 3D
   coordinates in meters, axes aligned to the camera (+x right, +y up, -z
   into the scene) — that lets us measure the actual palm orientation instead
   of just inferring trouble from a drop in classifier confidence.
   Cross product of two palm-edge vectors gives the palm's normal; how much
   that normal points along the camera's Z axis (vs. sideways in X/Y) is how
   face-on the palm currently is: 1 = flat toward/away from the camera (best
   tracking), 0 = edge-on/perpendicular (the noted "azimuth" weak spot). */
export function palmFaceOn(worldLandmarks) {
  const wrist = worldLandmarks[0];
  const indexMcp = worldLandmarks[5];
  const pinkyMcp = worldLandmarks[17];

  const v1 = { x: indexMcp.x - wrist.x, y: indexMcp.y - wrist.y, z: indexMcp.z - wrist.z };
  const v2 = { x: pinkyMcp.x - wrist.x, y: pinkyMcp.y - wrist.y, z: pinkyMcp.z - wrist.z };

  const nx = v1.y * v2.z - v1.z * v2.y;
  const ny = v1.z * v2.x - v1.x * v2.z;
  const nz = v1.x * v2.y - v1.y * v2.x;
  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (mag < 1e-9) return 0; // degenerate (collinear points) — trust it least

  return Math.abs(nz) / mag;
}

/* ---------------------------------------------------------------------- */
/* Handedness                                                            */
/* ---------------------------------------------------------------------- */

/* MediaPipe determines handedness assuming the input image is mirrored
   (selfie view). We feed the raw, unmirrored camera frame, so the predicted
   Left/Right label is swapped and must be flipped to match the user's own
   anatomical hand (per the official docs: "swap the handedness output"). */
export function trueHandedness(predictedLabel) {
  return predictedLabel === "Left" ? "right" : "left";
}

export function otherHand(hand) {
  return hand === "left" ? "right" : "left";
}

/* MediaPipe's handedness classifier can assign the same label to both hands
   with unmirrored input, so the second detection overwrites the first in the
   `hands` map and one skeleton vanishes. With two hands detected we ignore
   the classifier and assign sides by horizontal position instead. Same
   mirroring insight as trueHandedness() above: a camera facing the user
   sees things the way another person facing them would — raise your actual
   right hand and it lands on the *small-x* (left) side of the raw,
   unmirrored frame, the same way another person's right hand appears on
   your left when they face you. So small x = anatomical right hand, large
   x = anatomical left hand.
   @param {{landmarks: any, modelLabel: string, palmX: number}[]} detections
   @param {{left?: number, right?: number}} prior last known palmX per side
   (from the previous frame where both hands were seen), used to disambiguate
   a lone hand by proximity instead of the classifier — see below. */
export function assignHandSides(detections, prior = {}) {
  if (detections.length >= 2) {
    const sorted = [...detections].sort((a, b) => a.palmX - b.palmX);
    return { left: sorted[1], right: sorted[0] };
  }
  const d = detections[0];
  const { left: priorLeftX, right: priorRightX } = prior;
  if (typeof priorLeftX === "number" && typeof priorRightX === "number") {
    // MediaPipe's handedness classifier assumes a mirrored/selfie input; fed
    // our raw unmirrored frame, its Left/Right call for a single isolated
    // hand is noticeably less reliable than for two hands (where we don't
    // need it at all, see above). Nearest-neighbor continuity — which side's
    // last known horizontal position this hand is closer to — doesn't depend
    // on that classification at all, so it doesn't inherit its unreliability.
    const distLeft = Math.abs(d.palmX - priorLeftX);
    const distRight = Math.abs(d.palmX - priorRightX);
    return distLeft <= distRight ? { left: d } : { right: d };
  }
  return trueHandedness(d.modelLabel) === "left" ? { left: d } : { right: d };
}

/* ---------------------------------------------------------------------- */
/* Setup-screen calibration                                              */
/* ---------------------------------------------------------------------- */

/**
 * Turns the current hand count + how long both hands have been held into a
 * status message and progress-bar fill for the setup screen. Requiring a
 * short continuous hold (instead of enabling "Comenzar a tocar" the instant
 * two hands flicker into view) means the position history the play screen
 * relies on for single-hand disambiguation (see assignHandSides' `prior`
 * param) already has a few good samples before the user starts playing.
 * @param {number} count 0, 1 or 2 — hands currently detected
 * @param {number} elapsedMs ms both hands have been continuously detected
 * @param {boolean} done whether calibration already completed (sticky —
 * once true it stays true for the rest of the session)
 * @param {number} holdMs required continuous-hold duration
 */
export function calibrationStatus(count, elapsedMs, done, holdMs) {
  if (done) return { text: "✅ Manos calibradas — ¡listo para tocar!", progress: 1, ready: true };
  if (count === 0) return { text: "Buscando manos…", progress: 0, ready: false };
  if (count === 1) return { text: "1 mano detectada — muestra también la otra", progress: 0, ready: false };
  const progress = clamp01(elapsedMs / holdMs);
  const remaining = Math.max(0, (holdMs - elapsedMs) / 1000);
  return {
    text: `2 manos detectadas — mantén la posición ${remaining.toFixed(1)}s…`,
    progress,
    ready: progress >= 1,
  };
}

/* ---------------------------------------------------------------------- */
/* AxisTracker: velocity-anticipating smoother (shared, DRY)              */
/* ---------------------------------------------------------------------- */

/* Smooths a raw hand Y position with an EMA and projects it forward by the
   current velocity × anticipation seconds. This gives the "inercia" feel: a
   hand moving up at constant speed already pulls the note up ahead of it,
   and when the hand stops the velocity eases to 0 so the value settles back
   smoothly onto the real position. anticipation = 0 reproduces plain
   smoothing. One instance per axis (tone and volume) keeps the logic DRY. */
export class AxisTracker {
  constructor() {
    this.position = null; // EMA of the raw position
    this.velocity = 0;    // EMA of the raw velocity (units/s)
    this.lastRaw = null;
    this.lastTime = null;
    this.coasting = false;
  }

  update(rawY, now, { smoothPos, smoothVel, anticipation }) {
    if (this.lastTime !== null) {
      const dt = Math.max((now - this.lastTime) / 1000, 1 / 120);
      const instVel = (rawY - this.lastRaw) / dt;
      this.velocity += (instVel - this.velocity) * smoothVel;
    }
    this.lastRaw = rawY;
    this.lastTime = now;

    if (this.position === null) {
      this.position = rawY;
    } else {
      this.position += (rawY - this.position) * smoothPos;
    }

    return clamp01(this.position + this.velocity * anticipation);
  }

  /* The hand left the frame: simulate it continuing at its last velocity so
     the value keeps gliding (the "arm keeps going up") instead of freezing.
     The clamp01 in update() caps the glide at the top/bottom of the range. */
  coast(now, opts) {
    if (this.position === null) return null;
    const dt = Math.max((now - this.lastTime) / 1000, 1 / 120);
    return this.update(this.lastRaw + this.velocity * dt, now, opts);
  }

  reset() {
    this.position = null;
    this.velocity = 0;
    this.lastRaw = null;
    this.lastTime = null;
    this.coasting = false;
  }
}
