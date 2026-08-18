import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  clamp01,
  yToFrequency,
  yToVolume,
  registerFactors,
  chordVoiceFrequencies,
  freqToMidi,
  quantizeToSemitone,
  frequencyToNote,
  landmarkDist,
  computeHandCurl,
  computePianoHand,
  isPianoChordHand,
  palmFaceOn,
  trueHandedness,
  otherHand,
  assignHandSides,
  calibrationStatus,
  remapToRange,
  AxisTracker,
  CHORDS,
  AUDIBLE_MIN,
  AUDIBLE_MAX,
  PALM_LANDMARK,
} from "../lib/theremin-core.js";

/* ---------------------------------------------------------------------- */
/* clamp01                                                               */
/* ---------------------------------------------------------------------- */

describe("clamp01", () => {
  test("passes values already in [0,1] through unchanged", () => {
    assert.equal(clamp01(0), 0);
    assert.equal(clamp01(0.42), 0.42);
    assert.equal(clamp01(1), 1);
  });

  test("clamps values outside [0,1]", () => {
    assert.equal(clamp01(-3), 0);
    assert.equal(clamp01(1.5), 1);
  });
});

/* ---------------------------------------------------------------------- */
/* remapToRange                                                          */
/* ---------------------------------------------------------------------- */

describe("remapToRange", () => {
  test("no range (uncalibrated) is a passthrough (clamped)", () => {
    assert.equal(remapToRange(0.3, null), 0.3);
    assert.equal(remapToRange(0.3, undefined), 0.3);
    assert.equal(remapToRange(1.5, null), 1);
  });

  test("maps the observed range to the full 0..1 span", () => {
    const range = { min: 0.2, max: 0.8 };
    assert.equal(remapToRange(0.2, range), 0);
    assert.equal(remapToRange(0.8, range), 1);
    assert.ok(Math.abs(remapToRange(0.5, range) - 0.5) < 1e-9);
  });

  test("values outside the observed range clamp to 0/1 instead of extrapolating", () => {
    const range = { min: 0.2, max: 0.8 };
    assert.equal(remapToRange(0, range), 0);
    assert.equal(remapToRange(1, range), 1);
  });

  test("a range narrower than minSpread is distrusted and falls back to passthrough", () => {
    const tooNarrow = { min: 0.4, max: 0.45 }; // spread 0.05 < default 0.15
    assert.equal(remapToRange(0.4, tooNarrow), 0.4);
  });

  test("minSpread is configurable", () => {
    const range = { min: 0.4, max: 0.45 };
    assert.equal(remapToRange(0.45, range, 0.01), 1); // now trusted
  });
});

/* ---------------------------------------------------------------------- */
/* yToFrequency / yToVolume                                              */
/* ---------------------------------------------------------------------- */

describe("yToFrequency", () => {
  const opts = { minFreq: 100, maxFreq: 400 };

  test("y=0 (top of frame), not inverted, maps to maxFreq (agudo arriba)", () => {
    assert.equal(yToFrequency(0, opts), 400);
  });

  test("y=1 (bottom of frame), not inverted, maps to minFreq (grave abajo)", () => {
    assert.equal(yToFrequency(1, opts), 100);
  });

  test("inverted=true reverses the direction", () => {
    assert.equal(yToFrequency(0, { ...opts, inverted: true }), 100);
    assert.equal(yToFrequency(1, { ...opts, inverted: true }), 400);
  });

  test("interpolates geometrically (log scale) between min and max", () => {
    // y=0.5 -> t=0.5 -> geometric midpoint of [100,400] = 200
    assert.ok(Math.abs(yToFrequency(0.5, opts) - 200) < 1e-9);
  });

  test("equal minFactor/maxFactor shifts the whole range by octaves, preserving its span", () => {
    assert.equal(yToFrequency(0, { ...opts, minFactor: 2, maxFactor: 2 }), 800);
    assert.equal(yToFrequency(1, { ...opts, minFactor: 0.5, maxFactor: 0.5 }), 50);
  });

  test("differing minFactor/maxFactor widens the span (combined registers)", () => {
    // grave-normal: covers from grave's low end to normal's high end.
    assert.equal(yToFrequency(1, { ...opts, minFactor: 0.5, maxFactor: 1 }), 50); // low end, shifted down
    assert.equal(yToFrequency(0, { ...opts, minFactor: 0.5, maxFactor: 1 }), 400); // high end, unchanged
  });

  test("sensPos > 1 widens response around the center (0.5)", () => {
    // With sensPos=2, y slightly off-center reaches the extremes faster.
    const wide = yToFrequency(0.25, { ...opts, sensPos: 2 });
    const normal = yToFrequency(0.25, opts);
    assert.ok(wide > normal);
  });

  test("result is always clamped to the audible range", () => {
    const extreme = yToFrequency(0, { minFreq: 1, maxFreq: 1, minFactor: 1e6, maxFactor: 1e6 });
    assert.equal(extreme, AUDIBLE_MAX);
    const low = yToFrequency(0, { minFreq: 1, maxFreq: 1, minFactor: 1e-6, maxFactor: 1e-6 });
    assert.equal(low, AUDIBLE_MIN);
  });

  test("y outside [0,1] is clamped before mapping", () => {
    assert.equal(yToFrequency(-5, opts), yToFrequency(0, opts));
    assert.equal(yToFrequency(5, opts), yToFrequency(1, opts));
  });
});

describe("yToVolume", () => {
  test("y=0 (top), not inverted, is loudest", () => {
    assert.equal(yToVolume(0), 1);
  });

  test("y=1 (bottom), not inverted, is silent", () => {
    assert.equal(yToVolume(1), 0);
  });

  test("inverted=true reverses the direction", () => {
    assert.equal(yToVolume(0, { inverted: true }), 0);
    assert.equal(yToVolume(1, { inverted: true }), 1);
  });

  test("stays within [0,1] regardless of sensPos", () => {
    const v = yToVolume(0.1, { sensPos: 5 });
    assert.ok(v >= 0 && v <= 1);
  });
});

/* ---------------------------------------------------------------------- */
/* registerFactors                                                       */
/* ---------------------------------------------------------------------- */

describe("registerFactors", () => {
  test("grave halves both ends, agudo doubles both ends", () => {
    assert.deepEqual(registerFactors("grave"), { minFactor: 0.5, maxFactor: 0.5 });
    assert.deepEqual(registerFactors("agudo"), { minFactor: 2, maxFactor: 2 });
  });

  test("normal and unrecognized/undefined register are unity on both ends", () => {
    assert.deepEqual(registerFactors("normal"), { minFactor: 1, maxFactor: 1 });
    assert.deepEqual(registerFactors(undefined), { minFactor: 1, maxFactor: 1 });
    assert.deepEqual(registerFactors("not-a-register"), { minFactor: 1, maxFactor: 1 });
  });

  test("grave-normal spans from grave's low end to normal's high end", () => {
    assert.deepEqual(registerFactors("grave-normal"), { minFactor: 0.5, maxFactor: 1 });
  });

  test("normal-agudo spans from normal's low end to agudo's high end", () => {
    assert.deepEqual(registerFactors("normal-agudo"), { minFactor: 1, maxFactor: 2 });
  });

  test("combined registers cover a wider span (in octaves) than any single band", () => {
    for (const name of ["grave-normal", "normal-agudo"]) {
      const { minFactor, maxFactor } = registerFactors(name);
      const spanOctaves = Math.log2(maxFactor / minFactor);
      assert.ok(spanOctaves > 0, `${name} should span more than 0 octaves of shift`);
    }
  });
});

/* ---------------------------------------------------------------------- */
/* Music theory: freqToMidi / quantizeToSemitone / frequencyToNote        */
/* ---------------------------------------------------------------------- */

describe("music theory helpers", () => {
  test("freqToMidi maps A4=440Hz to MIDI 69", () => {
    assert.equal(freqToMidi(440), 69);
  });

  test("frequencyToNote names concert pitch A4", () => {
    assert.equal(frequencyToNote(440), "A4");
  });

  test("frequencyToNote names middle C (C4)", () => {
    assert.equal(frequencyToNote(261.63), "C4");
  });

  test("frequencyToNote matches the app's configured tone range endpoints", () => {
    // MIN_FREQ/MAX_FREQ in script.js are documented as C3/C6.
    assert.equal(frequencyToNote(130.81), "C3");
    assert.equal(frequencyToNote(1046.5), "C6");
  });

  test("quantizeToSemitone snaps a slightly-off frequency to the nearest note", () => {
    const quantized = quantizeToSemitone(438);
    assert.equal(freqToMidi(quantized), 69);
    assert.ok(Math.abs(quantized - 440) < 1);
  });

  test("quantizeToSemitone is idempotent", () => {
    const once = quantizeToSemitone(300);
    const twice = quantizeToSemitone(once);
    assert.equal(once, twice);
  });
});

/* ---------------------------------------------------------------------- */
/* Chords                                                                 */
/* ---------------------------------------------------------------------- */

describe("CHORDS", () => {
  test("every voicing starts on the root (0 semitones)", () => {
    for (const [name, chord] of Object.entries(CHORDS)) {
      assert.equal(chord.semitones[0], 0, `${name} should start on the root`);
    }
  });

  test("no voicing exceeds the 4 available oscillators", () => {
    for (const chord of Object.values(CHORDS)) {
      assert.ok(chord.semitones.length <= 4);
    }
  });
});

describe("chordVoiceFrequencies", () => {
  test("every CHORDS voicing produces only finite frequencies/gains, never NaN", () => {
    // Regression test: a voicing shorter than voiceCount used to leave
    // `undefined / 12` -> NaN for the unused oscillators.
    for (const chord of Object.values(CHORDS)) {
      const voices = chordVoiceFrequencies(440, chord.semitones, 4);
      assert.equal(voices.length, 4);
      for (const v of voices) {
        if (v === null) continue;
        assert.ok(Number.isFinite(v.freq));
        assert.ok(Number.isFinite(v.gain));
      }
    }
  });

  test("voices beyond the voicing length come back as null (not NaN)", () => {
    const voices = chordVoiceFrequencies(440, CHORDS.mayor.semitones, 4); // 3 notes
    assert.equal(voices.length, 4);
    assert.notEqual(voices[0], null);
    assert.notEqual(voices[1], null);
    assert.notEqual(voices[2], null);
    assert.equal(voices[3], null);
  });

  test("root voice (0 semitones) equals rootFreq exactly", () => {
    const voices = chordVoiceFrequencies(300, [0, 7], 2);
    assert.equal(voices[0].freq, 300);
  });

  test("single-note voicing [0] silences the other 3 voices (used when piano mode drops out of chord posture)", () => {
    const voices = chordVoiceFrequencies(440, [0], 4);
    assert.equal(voices[0].freq, 440);
    assert.equal(voices[0].gain, 1);
    assert.equal(voices[1], null);
    assert.equal(voices[2], null);
    assert.equal(voices[3], null);
  });

  test("gain is split evenly across the notes in the voicing", () => {
    const voices = chordVoiceFrequencies(440, CHORDS.septima.semitones, 4); // 4 notes
    for (const v of voices) assert.ok(Math.abs(v.gain - 0.25) < 1e-9);

    const quinta = chordVoiceFrequencies(440, CHORDS.quinta.semitones, 4); // 2 notes
    assert.equal(quinta[0].gain, 0.5);
    assert.equal(quinta[1].gain, 0.5);
    assert.equal(quinta[2], null);
    assert.equal(quinta[3], null);
  });
});

/* ---------------------------------------------------------------------- */
/* Hand geometry                                                         */
/* ---------------------------------------------------------------------- */

describe("landmarkDist", () => {
  test("computes plain Euclidean distance", () => {
    assert.equal(landmarkDist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });
});

// Builds a minimal 21-point MediaPipe-style hand landmark list. Only the
// indices actually read by computeHandCurl/computePianoHand are meaningful:
// wrist (0), and per-finger MCP/tip pairs (5/8, 9/12, 13/16, 17/20). Landmark
// 9 doubles as PALM_LANDMARK.
function makeHand({ mcpRadius = 0.3, tipRadius = 0.6, angles = [-0.3, -0.1, 0.1, 0.3] } = {}) {
  const wrist = { x: 0, y: 0 };
  const fingers = [
    { mcp: 5, tip: 8 },
    { mcp: 9, tip: 12 },
    { mcp: 13, tip: 16 },
    { mcp: 17, tip: 20 },
  ];
  const landmarks = new Array(21).fill(null).map(() => ({ x: 0, y: 0 }));
  landmarks[0] = wrist;
  fingers.forEach((f, i) => {
    const a = angles[i];
    landmarks[f.mcp] = { x: mcpRadius * Math.cos(a), y: mcpRadius * Math.sin(a) };
    landmarks[f.tip] = { x: tipRadius * Math.cos(a), y: tipRadius * Math.sin(a) };
  });
  return landmarks;
}

describe("computeHandCurl", () => {
  test("fully extended fingers (tip at 2x mcp distance) => curl 0 (open)", () => {
    const open = makeHand({ mcpRadius: 0.3, tipRadius: 0.6 });
    assert.ok(Math.abs(computeHandCurl(open) - 0) < 1e-9);
  });

  test("fingertips curled back to the mcp distance => curl 1 (fist)", () => {
    const fist = makeHand({ mcpRadius: 0.3, tipRadius: 0.3 });
    assert.ok(Math.abs(computeHandCurl(fist) - 1) < 1e-9);
  });

  test("partially curled hand lands strictly between 0 and 1", () => {
    const half = makeHand({ mcpRadius: 0.3, tipRadius: 0.45 });
    const curl = computeHandCurl(half);
    assert.ok(curl > 0 && curl < 1);
  });
});

describe("computePianoHand / isPianoChordHand", () => {
  test("open hand with fingers fanned out is a piano chord hand", () => {
    const spread = makeHand({ angles: [-0.5, -0.17, 0.17, 0.5] });
    const g = computePianoHand(spread);
    assert.equal(g.open, true);
    assert.ok(g.spread > 0.4);
    assert.equal(isPianoChordHand(spread), true);
  });

  test("open hand with fingers held together is NOT a chord hand (spread too low)", () => {
    const together = makeHand({ angles: [-0.02, -0.01, 0.01, 0.02] });
    const g = computePianoHand(together);
    assert.equal(g.open, true);
    assert.ok(g.spread < 0.4);
    assert.equal(isPianoChordHand(together), false);
  });

  test("closed fist is NOT a chord hand regardless of spread", () => {
    const fist = makeHand({ mcpRadius: 0.3, tipRadius: 0.3, angles: [-0.5, -0.17, 0.17, 0.5] });
    assert.equal(computePianoHand(fist).open, false);
    assert.equal(isPianoChordHand(fist), false);
  });

  test("uses landmark[PALM_LANDMARK] (index 9) as the hand-size reference", () => {
    assert.equal(PALM_LANDMARK, 9);
  });
});

/* ---------------------------------------------------------------------- */
/* palmFaceOn                                                            */
/* ---------------------------------------------------------------------- */

// Minimal 21-point worldLandmarks array (meters, camera-aligned axes) with
// only the 3 indices palmFaceOn reads (0, 5, 17) set to meaningful values.
function makeWorldLandmarks({ wrist, indexMcp, pinkyMcp }) {
  const points = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
  points[0] = wrist;
  points[5] = indexMcp;
  points[17] = pinkyMcp;
  return points;
}

describe("palmFaceOn", () => {
  test("palm normal pointing straight at the camera (Z axis) => 1 (best case)", () => {
    const wl = makeWorldLandmarks({
      wrist: { x: 0, y: 0, z: 0 },
      indexMcp: { x: 1, y: 0, z: 0 },
      pinkyMcp: { x: 0, y: 1, z: 0 },
    });
    assert.ok(Math.abs(palmFaceOn(wl) - 1) < 1e-9);
  });

  test("palm normal lying flat in the camera's XY plane (edge-on) => 0 (worst case)", () => {
    const wl = makeWorldLandmarks({
      wrist: { x: 0, y: 0, z: 0 },
      indexMcp: { x: 1, y: 0, z: 0 },
      pinkyMcp: { x: 0, y: 0, z: 1 },
    });
    assert.ok(Math.abs(palmFaceOn(wl) - 0) < 1e-9);
  });

  test("a tilted palm lands strictly between 0 and 1", () => {
    const wl = makeWorldLandmarks({
      wrist: { x: 0, y: 0, z: 0 },
      indexMcp: { x: 1, y: 0, z: 0.5 },
      pinkyMcp: { x: 0, y: 1, z: 0.5 },
    });
    const faceOn = palmFaceOn(wl);
    assert.ok(faceOn > 0 && faceOn < 1);
  });

  test("degenerate (collinear) points are trusted least, not treated as face-on", () => {
    const wl = makeWorldLandmarks({
      wrist: { x: 0, y: 0, z: 0 },
      indexMcp: { x: 1, y: 0, z: 0 },
      pinkyMcp: { x: 2, y: 0, z: 0 }, // same line as wrist->indexMcp
    });
    assert.equal(palmFaceOn(wl), 0);
  });

  test("result is always within [0, 1]", () => {
    const wl = makeWorldLandmarks({
      wrist: { x: 0.1, y: -0.2, z: 0.05 },
      indexMcp: { x: 0.9, y: 0.3, z: -0.4 },
      pinkyMcp: { x: -0.3, y: 0.8, z: 0.2 },
    });
    const faceOn = palmFaceOn(wl);
    assert.ok(faceOn >= 0 && faceOn <= 1);
  });
});

/* ---------------------------------------------------------------------- */
/* Handedness                                                            */
/* ---------------------------------------------------------------------- */

describe("trueHandedness / otherHand", () => {
  test("MediaPipe's mirrored-input labels are swapped for our unmirrored feed", () => {
    assert.equal(trueHandedness("Left"), "right");
    assert.equal(trueHandedness("Right"), "left");
  });

  test("otherHand flips left/right", () => {
    assert.equal(otherHand("left"), "right");
    assert.equal(otherHand("right"), "left");
  });
});

describe("assignHandSides", () => {
  test("single detection uses the (swapped) model label", () => {
    const det = { modelLabel: "Left", palmX: 0.5 };
    const result = assignHandSides([det]);
    assert.equal(result.right, det);
    assert.equal(result.left, undefined);
  });

  test("two detections are assigned by horizontal position, ignoring the classifier label", () => {
    // Regression: a camera facing the user sees things the way another
    // person facing them would — the user's actual RIGHT hand lands on the
    // small-x (left) side of the raw, unmirrored frame. Getting this
    // backwards means the app permanently swaps which physical hand
    // controls tone vs. volume whenever both hands are in frame.
    const smallX = { modelLabel: "Right", palmX: 0.2 }; // classifier disagrees on purpose
    const largeX = { modelLabel: "Right", palmX: 0.8 };
    const result = assignHandSides([largeX, smallX]); // order-independent input
    assert.equal(result.right, smallX);
    assert.equal(result.left, largeX);
  });

  test("single detection with prior positions uses nearest-neighbor continuity, ignoring the classifier", () => {
    // The one visible hand is near where "left" last was, even though the
    // classifier (unreliably, per the mirrored-input assumption) says "Right".
    const det = { modelLabel: "Right", palmX: 0.22 };
    const result = assignHandSides([det], { left: 0.2, right: 0.8 });
    assert.equal(result.left, det);
    assert.equal(result.right, undefined);
  });

  test("single detection with prior positions picks whichever side is closer", () => {
    const nearRight = { modelLabel: "Left", palmX: 0.75 };
    const result = assignHandSides([nearRight], { left: 0.1, right: 0.8 });
    assert.equal(result.right, nearRight);
    assert.equal(result.left, undefined);
  });

  test("falls back to the classifier when prior positions are incomplete", () => {
    const det = { modelLabel: "Left", palmX: 0.5 };
    assert.deepEqual(assignHandSides([det], {}), assignHandSides([det]));
    assert.deepEqual(assignHandSides([det], { left: 0.3 }), assignHandSides([det])); // missing "right"
  });
});

/* ---------------------------------------------------------------------- */
/* calibrationStatus                                                     */
/* ---------------------------------------------------------------------- */

describe("calibrationStatus", () => {
  test("no hands: searching, no progress", () => {
    const s = calibrationStatus(0, 0, false, 1500);
    assert.equal(s.progress, 0);
    assert.equal(s.ready, false);
  });

  test("one hand: prompts for the other, no progress even with elapsed time", () => {
    const s = calibrationStatus(1, 900, false, 1500);
    assert.equal(s.progress, 0);
    assert.equal(s.ready, false);
  });

  test("two hands, partway through the hold: partial progress, not ready", () => {
    const s = calibrationStatus(2, 750, false, 1500);
    assert.ok(Math.abs(s.progress - 0.5) < 1e-9);
    assert.equal(s.ready, false);
  });

  test("two hands, hold duration reached: full progress, ready", () => {
    const s = calibrationStatus(2, 1500, false, 1500);
    assert.equal(s.progress, 1);
    assert.equal(s.ready, true);
  });

  test("two hands, overshooting elapsed time: progress still clamps to 1", () => {
    const s = calibrationStatus(2, 5000, false, 1500);
    assert.equal(s.progress, 1);
    assert.equal(s.ready, true);
  });

  test("done=true is sticky regardless of current count", () => {
    const s = calibrationStatus(0, 0, true, 1500);
    assert.equal(s.progress, 1);
    assert.equal(s.ready, true);
  });
});

/* ---------------------------------------------------------------------- */
/* AxisTracker                                                           */
/* ---------------------------------------------------------------------- */

describe("AxisTracker", () => {
  const fullyResponsive = { smoothPos: 1, smoothVel: 1, anticipation: 0 };

  test("first update snaps position directly to the raw value", () => {
    const t = new AxisTracker();
    const v = t.update(0.5, 0, fullyResponsive);
    assert.equal(v, 0.5);
    assert.equal(t.velocity, 0); // no prior sample, no velocity yet
  });

  test("position converges toward a constant target over repeated updates", () => {
    const t = new AxisTracker();
    const opts = { smoothPos: 0.5, smoothVel: 0.3, anticipation: 0 };
    t.update(0, 0, opts);
    let v;
    for (let i = 1; i <= 20; i++) {
      v = t.update(1, i * 16, opts);
    }
    assert.ok(Math.abs(v - 1) < 1e-3);
  });

  test("anticipation projects the position ahead using the estimated velocity", () => {
    const t = new AxisTracker();
    t.update(0, 0, fullyResponsive);
    // Constant velocity of 0.1 unit per 100ms => 1 unit/sec.
    t.update(0.1, 100, fullyResponsive);
    const noAnticipation = new AxisTracker();
    noAnticipation.update(0, 0, fullyResponsive);
    const withAnticipation = noAnticipation.update(0.1, 100, { ...fullyResponsive, anticipation: 0.05 });
    const withoutAnticipation = t.position; // 0.1, same raw value, anticipation 0
    assert.ok(withAnticipation > withoutAnticipation);
  });

  test("coast() advances the value using the last known velocity", () => {
    const t = new AxisTracker();
    t.update(0, 0, fullyResponsive);
    t.update(0.2, 100, fullyResponsive); // velocity ~= 2 units/sec
    const coasted = t.coast(200, fullyResponsive);
    assert.ok(coasted > 0.2);
  });

  test("coast() on a fresh tracker (no position yet) returns null", () => {
    const t = new AxisTracker();
    assert.equal(t.coast(0, fullyResponsive), null);
  });

  test("reset() clears all internal state", () => {
    const t = new AxisTracker();
    t.update(0.5, 0, fullyResponsive);
    t.update(0.7, 100, fullyResponsive);
    t.reset();
    assert.equal(t.position, null);
    assert.equal(t.velocity, 0);
    assert.equal(t.lastRaw, null);
    assert.equal(t.lastTime, null);
    assert.equal(t.coasting, false);
  });

  test("clamp01 caps the returned value even when velocity overshoots the range", () => {
    const t = new AxisTracker();
    t.update(0.9, 0, fullyResponsive);
    const v = t.update(1.0, 10, { smoothPos: 1, smoothVel: 1, anticipation: 5 });
    assert.ok(v <= 1);
  });
});
