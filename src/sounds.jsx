// Key sound player.
// - press sounds: routed through Web Audio API GainNode so gain can exceed 1.0
// - space/backspace/enter: standard HTMLAudio pool

const SOUND_PACKS = {
  cream: {
    press:     'assets/key-press.mp3',
    backspace: 'assets/key-backspace.mp3',
    enter:     'assets/key-enter.mp3',
    space:     'assets/key-space.mp3',
  },
  mxblack: {
    press:     'assets/mxblack-press.mp3',
    backspace: 'assets/mxblack-backspace.mp3',
    enter:     'assets/mxblack-enter.mp3',
    space:     'assets/mxblack-space.mp3',
  },
  mxbrown: {
    press:     'assets/mxbrown-press.mp3',
    backspace: 'assets/mxbrown-backspace.mp3',
    enter:     'assets/mxbrown-enter.mp3',
    space:     'assets/mxbrown-space.mp3',
  },
};

/** @type {keyof typeof SOUND_PACKS} */
let soundPack = 'cream';

function soundSrcs() {
  return SOUND_PACKS[soundPack] || SOUND_PACKS.cream;
}

/** @param {keyof typeof SOUND_PACKS | string} pack */
function setSoundPack(pack) {
  const next = SOUND_PACKS[pack] ? pack : 'cream';
  if (next === soundPack && pressBuffer !== null && htmlReady) return;
  soundPack = next;
  pressBuffer = null;
  htmlReady = false;
  for (const k of Object.keys(htmlPools)) delete htmlPools[k];
}

const POOL_SIZE = 6;

// --- Web Audio press engine ---
let audioCtx = null;
let pressGain = null;
let pressBuffer = null;
let pressGainValue = 1.5; // 1.5x amplification headroom

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    pressGain = audioCtx.createGain();
    pressGain.gain.value = pressGainValue;
    pressGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

async function loadPressBuffer() {
  if (pressBuffer) return pressBuffer;
  const ctx = getAudioCtx();
  const resp = await fetch(soundSrcs().press);
  const arr = await resp.arrayBuffer();
  pressBuffer = await ctx.decodeAudioData(arr);
  return pressBuffer;
}

function playPress() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  if (!pressBuffer) {
    loadPressBuffer().then(() => {});
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = pressBuffer;
  src.connect(pressGain);
  src.start(0);
}

// --- HTMLAudio pool for space/backspace/enter ---
const htmlPools = {};
let htmlReady = false;
let htmlVolume = 0.605;
let muted = false;

function initHtmlSounds() {
  if (htmlReady) return;
  for (const name of ['backspace', 'enter', 'space']) {
    htmlPools[name] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio(soundSrcs()[name]);
      a.preload = 'auto';
      a.volume = htmlVolume;
      htmlPools[name].push(a);
    }
  }
  htmlReady = true;
}

function setKeySoundVolume(v) {
  htmlVolume = Math.max(0, Math.min(1, v));
  for (const arr of Object.values(htmlPools)) {
    for (const a of arr) a.volume = htmlVolume;
  }
}

function setPressSoundVolume(v) {
  // v is 0–1 from slider; we apply 1.5x gain on top via GainNode
  pressGainValue = Math.max(0, v) * 1.5;
  if (pressGain) pressGain.gain.value = pressGainValue;
}

function setKeySoundMuted(m) { muted = !!m; }

function playKeySound(name) {
  if (muted) return;
  if (name === 'press') {
    playPress();
    return;
  }
  if (!htmlReady) initHtmlSounds();
  const pool = htmlPools[name];
  if (!pool) return;
  let chosen = pool.find(a => a.paused || a.ended);
  if (!chosen) chosen = pool[0];
  try {
    chosen.currentTime = 0;
    chosen.volume = htmlVolume;
    const p = chosen.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

// Warm up the press buffer on first user gesture
function warmUpSounds() {
  getAudioCtx();
  loadPressBuffer();
  initHtmlSounds();
}

function soundForKey(e) {
  if (e.key === 'Enter') return 'enter';
  if (e.key === 'Backspace' || e.key === 'Delete') return 'backspace';
  if (e.key === ' ' || e.key === 'Spacebar') return 'space';
  if (e.key === 'Tab') return 'press';
  if (e.key && e.key.length === 1) return 'press';
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return 'press';
  return null;
}

// Warm up on first click anywhere
document.addEventListener('click', warmUpSounds, { once: true });

export {
  playKeySound, soundForKey,
  setKeySoundVolume, setPressSoundVolume, setKeySoundMuted,
  setSoundPack,
  warmUpSounds,
};
