// Generates the DEVELOPMENT PLACEHOLDER Reflection tracks: soft synthesised
// pads (sine tones only, no samples, no third-party music). They prove
// playback, caching and fallback; they are never production music.
//
//   node scripts/generate-placeholder-music.mjs
//
// Output:
//   assets/audio/reflection-fallback.wav              bundled inside the app
//   supabase/storage/reflection-music/reflection-00N.wav   upload to the
//     `reflection-music` Storage bucket (see docs/REFLECTION-MUSIC.md)
//
// Every loop is seamless: each tone completes a whole number of cycles in
// the track, so playback can loop without a click.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 16000;

/** Rounds a frequency so it completes whole cycles in `seconds`. */
const snap = (hz, seconds) => Math.round(hz * seconds) / seconds;

function pad(seconds, chord, swells) {
  const n = RATE * seconds;
  const samples = new Float64Array(n);
  const voices = chord.flatMap((hz, i) => [
    { hz: snap(hz, seconds), amp: 1 / (i + 1.5) },
    // A slightly detuned twin for a slow, gentle chorus.
    { hz: snap(hz + 0.25, seconds), amp: 0.6 / (i + 1.5) },
    { hz: snap(hz * 2, seconds), amp: 0.12 / (i + 1.5) },
  ]);
  for (let t = 0; t < n; t++) {
    const time = t / RATE;
    // Slow "breathing" swell: a whole number of swells per loop.
    const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * swells * time) / seconds);
    let v = 0;
    for (const voice of voices) v += voice.amp * Math.sin(2 * Math.PI * voice.hz * time);
    samples[t] = v * swell;
  }
  const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return samples.map((v) => (v / peak) * 0.45);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function save(path, samples) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, wav(samples));
  console.log(`wrote ${path}`);
}

// Low, open chords (Hz). Placeholders only.
save('assets/audio/reflection-fallback.wav', pad(32, [110, 164.81, 220, 277.18], 4));
save('supabase/storage/reflection-music/reflection-001.wav', pad(48, [98, 146.83, 196, 246.94], 4));
save('supabase/storage/reflection-music/reflection-002.wav', pad(48, [87.31, 130.81, 174.61, 220], 6));
save('supabase/storage/reflection-music/reflection-003.wav', pad(48, [116.54, 174.61, 233.08, 293.66], 4));
