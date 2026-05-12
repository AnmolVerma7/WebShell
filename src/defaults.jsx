// Single source of truth for tweak defaults + localStorage persistence.
//
// Adding a new tweak:
//   1. Add a default value here (this also serves as the implicit type).
//   2. Add a control to TweaksPanel in tweaks.jsx that reads `tweaks.<key>`
//      and calls `setTweaks({ <key>: value })`.
//   3. Wire its effect (App.jsx or terminal.jsx, depending on where it acts).
//
// Bumping TWEAKS_STORAGE_KEY (e.g. v1 → v2) invalidates everyone's stored
// preferences. Do it only on incompatible schema changes.

const TWEAK_DEFAULTS = {
  theme: 'AV Cyberpunk',
  font: 'Courier Prime',
  fontSize: 20,
  scanlines: true,
  glow: false,
  muted: false,
  volume: 0.5,
  pressVolume: 1,
  /** @type {'cream' | 'mxblack' | 'mxbrown'} */
  keySoundPack: 'cream',
  promptLabel: 'Anmol@PC',
  borderless: true,
  vfsHere: true,
  welcome: ">>> ANMOL'S TERMINAL — v2.0 <<<",
  showWelcome: true,
  bootAnimation: true,
};

const TWEAKS_STORAGE_KEY = 'shell.tweaks.v1';

function loadStoredTweaks() {
  try {
    const raw = localStorage.getItem(TWEAKS_STORAGE_KEY);
    if (!raw) return TWEAK_DEFAULTS;
    return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return TWEAK_DEFAULTS;
  }
}

function saveTweaks(next) {
  try { localStorage.setItem(TWEAKS_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
}

function clearStoredTweaks() {
  try { localStorage.removeItem(TWEAKS_STORAGE_KEY); } catch (e) {}
}

export {
  TWEAK_DEFAULTS,
  TWEAKS_STORAGE_KEY,
  loadStoredTweaks,
  saveTweaks,
  clearStoredTweaks,
};
