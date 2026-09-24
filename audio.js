// Jungle Wall sound, built on Web Audio. All recordings are CC0 from Freesound; see
// audio/CREDITS.md. Two looping beds (jungle, frog chorus) plus short one-shots
// picked out of two recordings by time, so no cutting of files is needed.
//
// Browsers only start sound after a tap or click. The Android app and a Chrome kiosk
// started with --autoplay-policy=no-user-gesture-required play straight away.

const FILES = {
  jungle: './audio/jungle-choco.mp3',
  chorus: './audio/frog-chorus-costa-rica.mp3',
  chirps: './audio/frog-chirps.mp3',
  plops: './audio/water-plops.mp3'
};

// [start, length] in seconds, found by measuring where each sound sits in its file.
const CHIRPS = [[0.76, 0.42], [1.95, 0.4], [3.2, 0.42], [4.27, 0.41], [5.31, 0.41], [6.35, 0.44],
  [7.55, 0.4], [8.8, 0.41], [9.87, 0.42], [10.92, 0.42], [11.97, 0.42], [13.16, 0.39]];
const SOFT_PLOPS = [[0.12, 0.16], [4.26, 0.16], [5.44, 0.22], [8.71, 0.16], [10.02, 0.21], [14.0, 0.22]];
const BIG_PLOPS = [[1.72, 0.24], [7.24, 0.18], [12.06, 0.22]];

// Bed levels. The chorus was recorded about 25x quieter than the jungle, hence its gain.
const JUNGLE_LEVEL = 0.55;
const CHORUS_LEVEL = 9;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createJungleAudio({ volume = 1 } = {}) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || volume <= 0) return null;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  const buffers = {};
  let chorusGain = null;
  let started = false;

  // Resume on the first tap/click/key if the browser held the sound back.
  const unlock = () => { if (ctx.state !== 'running') ctx.resume(); };
  ['pointerdown', 'touchstart', 'keydown'].forEach((type) => window.addEventListener(type, unlock, { passive: true }));

  function loopBed(buffer, level) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.5); // fade in
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain).connect(master);
    source.start(0, Math.random() * buffer.duration); // start part-way, so each run differs
    return gain;
  }

  function oneShot(buffer, [start, length], { pan = 0, gain = 1, rate = 1 } = {}) {
    if (!started || ctx.state !== 'running') return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const level = ctx.createGain();
    level.gain.value = gain;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(level).connect(panner).connect(master);
    } else {
      source.connect(level).connect(master);
    }
    source.start(0, start, length);
  }

  Promise.all(Object.entries(FILES).map(async ([name, url]) => {
    const data = await (await fetch(url)).arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(data);
  })).then(() => {
    loopBed(buffers.jungle, JUNGLE_LEVEL);
    chorusGain = loopBed(buffers.chorus, CHORUS_LEVEL);
    started = true;
  }).catch(() => { /* no sound files: stay silent, the scene still runs */ });

  return {
    // pan: -1 left .. 1 right. big: the large frogs call lower and louder.
    frogCall(pan, big = false) {
      oneShot(buffers.chirps, pick(CHIRPS), { pan, gain: big ? 0.9 : 0.55, rate: (big ? 0.88 : 1.08) + Math.random() * 0.12 });
    },
    drip(pan) {
      oneShot(buffers.plops, pick(SOFT_PLOPS), { pan, gain: 0.35, rate: 1.1 + Math.random() * 0.3 });
    },
    splash(pan, strength = 1) {
      oneShot(buffers.plops, pick(strength > 0.9 ? BIG_PLOPS : SOFT_PLOPS), { pan, gain: 0.5 + strength * 0.4, rate: 0.9 + Math.random() * 0.2 });
    },
    // A soft wet "plip" when a frog sticks to the glass.
    splat(pan) {
      oneShot(buffers.plops, pick(SOFT_PLOPS), { pan, gain: 0.7, rate: 1.6 + Math.random() * 0.2 });
    },
    // 0 = someone right there (frogs fall silent), 1 = nobody near (full chorus).
    setCalm(calm) {
      if (!chorusGain) return;
      // Frogs hush quickly and come back slowly, like real ones.
      chorusGain.gain.setTargetAtTime(CHORUS_LEVEL * calm, ctx.currentTime, calm < 0.5 ? 0.4 : 4);
    }
  };
}
