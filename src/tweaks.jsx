// Tweaks panel — theme & font controls.
// Theme/font data lives in themes.jsx (palettes) — this file is UI only.

import { THEMES, FONTS } from './themes.jsx';

function TweaksPanel({ tweaks, setTweaks, resetTweaks, visible }) {
  if (!visible) return null;
  const handleReset = () => {
    if (typeof resetTweaks === 'function') resetTweaks();
  };
  return (
    <div className="tweaks-panel">
      <div className="tweaks-title">Tweaks</div>
      <div className="tweaks-body">
      <div className="tweaks-group">
        <div className="tweaks-label">Theme</div>
        <div className="tweaks-row">
          {Object.keys(THEMES).map(t => (
            <button key={t}
              className={`tweaks-chip ${tweaks.theme === t ? 'active' : ''}`}
              onClick={() => setTweaks({ theme: t })}>
              <span className="tweaks-swatch" style={{
                background: THEMES[t].bg, borderColor: THEMES[t].chromeBorder
              }}>
                <span style={{ background: THEMES[t].fg }} />
              </span>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Font</div>
        <div className="tweaks-col">
          {Object.keys(FONTS).map(f => (
            <button key={f}
              className={`tweaks-row-btn ${tweaks.font === f ? 'active' : ''}`}
              onClick={() => setTweaks({ font: f })}
              style={{ fontFamily: FONTS[f] }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Font size</div>
        <div className="tweaks-row">
          <input type="range" min="11" max="26" step="1"
            value={tweaks.fontSize}
            onChange={e => setTweaks({ fontSize: Number(e.target.value) })} />
          <span className="tweaks-num">{tweaks.fontSize}px</span>
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Layout</div>
        <label className="tweaks-check">
          <input type="checkbox" checked={!!tweaks.borderless}
            onChange={e => setTweaks({ borderless: e.target.checked })} />
          <span>borderless mode</span>
        </label>
        <label className="tweaks-check">
          <input type="checkbox" checked={tweaks.vfsHere !== false}
            onChange={e => setTweaks({ vfsHere: e.target.checked })} />
          <span>vfs "← you are here" marker</span>
        </label>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Effects</div>
        <label className="tweaks-check">
          <input type="checkbox" checked={tweaks.scanlines}
            onChange={e => setTweaks({ scanlines: e.target.checked })} />
          <span>scanlines</span>
        </label>
        <label className="tweaks-check">
          <input type="checkbox" checked={tweaks.glow}
            onChange={e => setTweaks({ glow: e.target.checked })} />
          <span>text glow</span>
        </label>
        <label className="tweaks-check">
          <input type="checkbox" checked={tweaks.bootAnimation !== false}
            onChange={e => setTweaks({ bootAnimation: e.target.checked })} />
          <span>boot animation on load</span>
        </label>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Prompt</div>
        <input
          type="text"
          className="tweaks-text-input"
          value={tweaks.promptLabel || 'user@workstation'}
          placeholder="user@workstation"
          onChange={e => setTweaks({ promptLabel: e.target.value })}
          spellCheck={false}
        />
        <div style={{ fontSize: 9, color: 'oklch(0.50 0.02 250)', marginTop: 4, lineHeight: 1.4 }}>
          use @ to set user and host separately
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Welcome message</div>
        <label className="tweaks-check">
          <input type="checkbox" checked={tweaks.showWelcome !== false}
            onChange={e => setTweaks({ showWelcome: e.target.checked })} />
          <span>show on start</span>
        </label>
        <input
          type="text"
          className="tweaks-text-input"
          style={{ marginTop: 6 }}
          value={tweaks.welcome ?? "shell v0.9.2   \u2014   type 'help' to get started"}
          placeholder="welcome banner text"
          onChange={e => setTweaks({ welcome: e.target.value })}
          disabled={tweaks.showWelcome === false}
          spellCheck={false}
        />
        <div style={{ fontSize: 9, color: 'oklch(0.50 0.02 250)', marginTop: 4, lineHeight: 1.4 }}>
          shown above the first prompt — reload page to re-render
        </div>
      </div>

      <div className="tweaks-group">
        <div className="tweaks-label">Key sounds</div>
        <label className="tweaks-check">
          <input type="checkbox" checked={!tweaks.muted}
            onChange={e => setTweaks({ muted: !e.target.checked })} />
          <span>enabled</span>
        </label>
        <div className="tweaks-row" style={{ marginTop: 4 }}>
          <input type="range" min="0" max="1" step="0.05"
            value={tweaks.volume}
            disabled={tweaks.muted}
            onChange={e => setTweaks({ volume: Number(e.target.value) })} />
          <span className="tweaks-num">{Math.round((tweaks.volume || 0) * 100)}%</span>
        </div>
        <div className="tweaks-label" style={{ marginTop: 8 }}>Keypress volume</div>
        <div className="tweaks-row">
          <input type="range" min="0" max="1" step="0.05"
            value={tweaks.pressVolume ?? 0.605}
            disabled={tweaks.muted}
            onChange={e => setTweaks({ pressVolume: Number(e.target.value) })} />
          <span className="tweaks-num">{Math.round((tweaks.pressVolume ?? 0.605) * 100)}%</span>
        </div>
      </div>
      <div className="tweaks-group" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="tweaks-row-btn"
          onClick={handleReset}
          style={{ width: '100%', justifyContent: 'center' }}
          title="Restore all tweaks to defaults"
        >
          reset to defaults
        </button>
      </div>
      </div>{/* end tweaks-body */}
    </div>
  );
}

export { TweaksPanel };
