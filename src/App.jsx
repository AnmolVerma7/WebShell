import { useState, useEffect } from 'react';
import { Terminal } from './terminal.jsx';
import { TweaksPanel } from './tweaks.jsx';
import { THEMES, FONTS } from './themes.jsx';
import { TWEAK_DEFAULTS, loadStoredTweaks, saveTweaks, clearStoredTweaks } from './defaults.jsx';
import { setKeySoundVolume, setKeySoundMuted, setPressSoundVolume } from './sounds.jsx';

export default function App() {
  const [tweaks, setTweaksState] = useState(loadStoredTweaks);
  const [tweaksVisible, setTweaksVisible] = useState(false);

  const setTweaks = (partial) => {
    setTweaksState(prev => {
      const next = { ...prev, ...partial };
      window.__shellTweaks = next;
      saveTweaks(next);
      return next;
    });
  };

  const resetTweaks = () => {
    clearStoredTweaks();
    setTweaksState(TWEAK_DEFAULTS);
    window.__shellTweaks = TWEAK_DEFAULTS;
  };

  const theme = THEMES[tweaks.theme] || THEMES.phosphor;
  const fontStack = FONTS[tweaks.font] || FONTS['JetBrains Mono'];

  useEffect(() => {
    document.documentElement.style.setProperty('--term-font', fontStack);
    document.documentElement.style.setProperty('--term-size', tweaks.fontSize + 'px');
  }, [fontStack, tweaks.fontSize]);

  useEffect(() => {
    setKeySoundVolume(tweaks.volume ?? 0.5);
    setKeySoundMuted(!!tweaks.muted);
  }, [tweaks.volume, tweaks.muted]);

  useEffect(() => { window.__shellTweaks = tweaks; }, [tweaks]);

  useEffect(() => {
    setPressSoundVolume(tweaks.pressVolume ?? 0.605);
  }, [tweaks.pressVolume]);

  const fxClass = [
    tweaks.scanlines ? 'fx-scanlines' : '',
    tweaks.glow ? 'fx-glow' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className="stage" style={{
        background: tweaks.borderless
          ? theme.bg
          : `radial-gradient(ellipse at 30% 20%, ${theme.chrome} 0%, ${theme.bg} 75%)`,
        padding: tweaks.borderless ? '24px 32px' : '32px',
      }}>
        <div className="window" style={{
          background: theme.bg,
          borderColor: theme.chromeBorder,
          ...(tweaks.borderless
            ? { borderRadius: 0, boxShadow: 'none', width: '100%', height: '100%', border: 'none' }
            : {}),
        }}>
          {!tweaks.borderless && (
            <div className="win-chrome" style={{
              background: theme.chrome,
              borderColor: theme.chromeBorder,
              color: theme.dim,
            }}>
              <div className="win-dots">
                <div className="win-dot" style={{ background: 'oklch(0.65 0.18 25)' }} />
                <div className="win-dot" style={{ background: 'oklch(0.75 0.14 85)' }} />
                <div className="win-dot" style={{ background: 'oklch(0.70 0.15 150)' }} />
              </div>
              <div className="win-tabs">
                <span className="win-tab active" style={{ color: theme.fg }}>shell</span>
                <span className="win-tab">+</span>
              </div>
              <div className="win-title">user@workstation — shell</div>
              <div style={{ width: 54 }} />
            </div>
          )}
          <div className={fxClass} style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
            <Terminal theme={theme} promptLabel={tweaks.promptLabel || 'user@workstation'} tweaks={tweaks} />
          </div>
        </div>
      </div>
      <button
        className="tweaks-toggle"
        onClick={() => setTweaksVisible(v => !v)}
        title={tweaksVisible ? 'Close tweaks' : 'Open tweaks'}
        aria-label="Toggle tweaks panel"
        style={{
          background: theme.chrome,
          borderColor: theme.chromeBorder,
          color: tweaksVisible ? theme.fg : theme.dim,
        }}
      >
        {tweaksVisible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        )}
      </button>
      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} resetTweaks={resetTweaks} visible={tweaksVisible} />
    </>
  );
}
