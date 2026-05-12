// Boot animation: builds the timed step sequence used when bootAnimation is on.
// Pulls real (non-sensitive) host info from the browser so it feels like the
// shell is genuinely probing the machine, with graceful fallbacks where APIs
// aren't exposed.

// Pull whatever real, non-sensitive host info the browser will give us.
function getHostInfo() {
  const nav = (typeof navigator !== 'undefined') ? navigator : {};
  const win = (typeof window !== 'undefined') ? window : {};
  const cores = nav.hardwareConcurrency || null;
  const memGB = nav.deviceMemory || null;          // Chromium-only, in GB (1,2,4,8,...)
  const conn  = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const lang  = nav.language || (nav.languages && nav.languages[0]) || 'en-US';
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) {}
  const screenW = (win.screen && win.screen.width)  || 0;
  const screenH = (win.screen && win.screen.height) || 0;
  const dpr     = win.devicePixelRatio || 1;
  const ua = nav.userAgent || '';
  const platform = (nav.userAgentData && nav.userAgentData.platform) || nav.platform || '';
  const online = (typeof nav.onLine === 'boolean') ? nav.onLine : true;

  let os = 'unknown';
  if (/Win/i.test(platform) || /Windows/i.test(ua))  os = 'Windows NT';
  else if (/Mac|Darwin/i.test(platform) || /Mac OS/i.test(ua)) os = 'Darwin';
  else if (/Linux/i.test(platform))                  os = 'Linux';
  else if (/Android/i.test(ua))                      os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua))              os = 'iOS';

  let browser = 'browser';
  if (/Edg\//.test(ua))           browser = 'Edge';
  else if (/OPR\//.test(ua))      browser = 'Opera';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Chrome\//.test(ua))   browser = 'Chromium';
  else if (/Safari\//.test(ua))   browser = 'WebKit';

  return { cores, memGB, conn, lang, tz, screenW, screenH, dpr, os, browser, online };
}

// Build a BIOS/kernel boot sequence ending with the welcome banner.
// Returns an array of { delay, line } steps consumed by runAnimation().
function buildBootSteps(welcomeText) {
  const hw = getHostInfo();
  const out = [];
  const add = (delay, text) => out.push({ delay, line: { kind: 'raw', text } });

  add(0,   'shell BIOS v2.1.7 — probing host...');
  add(180, hw.cores
    ? `  CPU ............ ok  (${hw.cores} logical core${hw.cores === 1 ? '' : 's'})`
    : '  CPU ............ ok  (count not reported)');
  add(120, hw.memGB
    ? `  RAM ............ ok  (~${hw.memGB} GiB device memory)`
    : '  RAM ............ ok  (size not reported)');
  add(120, (hw.screenW && hw.screenH)
    ? `  Display ........ ok  (${hw.screenW}x${hw.screenH}${hw.dpr !== 1 ? ` @ ${hw.dpr.toFixed(1)}x` : ''})`
    : '  Display ........ ok');
  if (hw.conn && hw.conn.downlink) {
    const eff = hw.conn.effectiveType ? hw.conn.effectiveType.toUpperCase() : 'link';
    const rtt = hw.conn.rtt ? `, ${hw.conn.rtt}ms rtt` : '';
    add(120, `  Network ........ ok  (${eff}, ${hw.conn.downlink.toFixed(1)} Mbps${rtt})`);
  } else {
    add(120, `  Network ........ ok  (${hw.online ? 'online' : 'offline'})`);
  }
  add(120, `  Locale ......... ok  (${hw.lang}, ${hw.tz})`);
  add(220, '');
  add(0,   `loading kernel for ${hw.os} via ${hw.browser} ...`);
  add(280, '[    0.214837] mounting / (ro)');
  add(120, '[    0.349128] network: stack up');
  add(120, '[    0.512049] sshd: listening on 0.0.0.0:22');
  add(120, '[    0.731205] cron: scheduling daemon active');
  add(220, '');
  add(0,   'starting userland...');
  add(150, '  [ OK ] mounting /home');
  add(100, '  [ OK ] starting shell session');
  add(350, '');

  const ruler = '-'.repeat(Math.max(welcomeText.length + 4, 50));
  add(0, ruler);
  add(0, '  ' + welcomeText);
  add(0, ruler);
  add(0, '');
  return out;
}

export { getHostInfo, buildBootSteps };
