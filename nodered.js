// ── Flow generator ─────────────────────────────────────────────
const WIZARD_PRESETS = {
  conservative: { soc_min:30, soc_max:90,  buy_below:2.5, sell_above:7.0, grid_setpoint:50  },
  balanced:     { soc_min:20, soc_max:95,  buy_below:4.0, sell_above:5.5, grid_setpoint:30  },
  aggressive:   { soc_min:10, soc_max:100, buy_below:5.5, sell_above:4.5, grid_setpoint:0   },
};

function wizardGenerateFlow() {
  const cfg    = wizardGetConfig();
  const preset = WIZARD_PRESETS[cfg.strategy] || WIZARD_PRESETS.balanced;
  const p = {
    socMin:    cfg.strategy === 'custom' ? cfg.soc_min       : preset.soc_min,
    socMax:    cfg.strategy === 'custom' ? cfg.soc_max       : preset.soc_max,
    buyBelow:  cfg.strategy === 'custom' ? cfg.buy_below     : preset.buy_below,
    sellAbove: cfg.strategy === 'custom' ? cfg.sell_above    : preset.sell_above,
    gridSP:    cfg.strategy === 'custom' ? cfg.grid_setpoint : preset.grid_setpoint,
  };

  const today = new Date().toISOString().slice(0, 10);
  const tabId = 'wiz-tab-01';

  const nodes = [
    // ── Tab ──────────────────────────────────────────────────────
    { id: tabId, type: 'tab',
      label: `Energetika – ${cfg.strategy} (${today})`,
      disabled: false,
      info: `FVE: ${cfg.fve_kwp} kWp | Baterie: ${cfg.bat_kwh} kWh | Fáze: ${cfg.phase} | Tarif: ${cfg.tariff}` },

    // ── Časovač ──────────────────────────────────────────────────
    { id: 'wiz-inject-timer', type: 'inject', z: tabId,
      name: 'Každou minutu',
      props: [{ p: 'payload' }],
      repeat: '60', crontab: '', once: true, onceDelay: 3, topic: '',
      payload: '', payloadType: 'date',
      x: 120, y: 140, wires: [['wiz-http-get']] },

    // ── HTTP GET data.json ────────────────────────────────────────
    { id: 'wiz-http-get', type: 'http request', z: tabId,
      name: 'GET data.json', method: 'GET', ret: 'obj',
      paytoqs: 'ignore',
      url: `${window.location.origin}/data.json`,
      tls: '', persist: false, proxy: '', authType: '', senderr: false,
      x: 320, y: 140, wires: [['wiz-parse', 'wiz-debug-json']] },

    // ── Debug raw JSON (neaktivní) ────────────────────────────────
    { id: 'wiz-debug-json', type: 'debug', z: tabId,
      name: 'RAW JSON', active: false, tosidebar: true, console: false,
      complete: 'payload', targetType: 'msg',
      x: 320, y: 60, wires: [] },

    // ── Funkce — parsování + strategie (3 výstupy) ───────────────
    { id: 'wiz-parse', type: 'function', z: tabId,
      name: 'Zpracuj data',
      func: [
        `// ── Energetika PWA — Strategie: ${cfg.strategy} ──`,
        `// Vygenerováno: ${today}`,
        `// Hardware: ${cfg.inverter} | ${cfg.fve_kwp} kWp | ${cfg.bat_kwh} kWh | ${cfg.phase} | ${cfg.jistic}A`,
        '',
        'const p = msg.payload;',
        'if (!p || typeof p !== "object") {',
        '  node.status({ fill: "red", shape: "dot", text: "chybná odpověď API" });',
        '  return null;',
        '}',
        '',
        `const SOC_MIN    = ${p.socMin};    // % — minimální SOC`,
        `const SOC_MAX    = ${p.socMax};    // % — maximální SOC`,
        `const BUY_BELOW  = ${p.buyBelow}; // Kč/kWh — nakupovat pod touto cenou`,
        `const SELL_ABOVE = ${p.sellAbove};// Kč/kWh — prodávat nad touto cenou`,
        `const GRID_SP    = ${p.gridSP};   // W — klidový setpoint sítě`,
        '',
        '// Hodnoty z data.json',
        'const soc   = parseFloat(p.soc_pct  ?? 50);',
        'const price = parseFloat(p.spot_czk ?? 0);',
        'const solar = parseFloat(p.solar_w  ?? 0);',
        '',
        '// Strategie',
        "let mode         = 'STANDBY';",
        'let gridSetpoint = GRID_SP;',
        '// blockExport: 0 = blokovat přetoky, 1 = povolit přetoky (inverzní logika ESS)',
        'let blockExport  = p.block_export === true ? 0 : 1;',
        'let setupSOC     = SOC_MIN;',
        '',
        'if (price > SELL_ABOVE && soc > SOC_MIN + 10) {',
        "  mode         = 'PRODEJ';",
        '  gridSetpoint = -3000;',
        '  blockExport  = 1;',
        '  setupSOC     = SOC_MIN;',
        '} else if (price < BUY_BELOW && soc < SOC_MAX) {',
        "  mode         = 'NÁKUP';",
        '  gridSetpoint = 500;',
        '  blockExport  = 0;',
        '  setupSOC     = SOC_MAX;',
        '} else if (solar > 500) {',
        "  mode         = 'SOLÁR';",
        '  gridSetpoint = GRID_SP;',
        '  blockExport  = 1;',
        '  setupSOC     = SOC_MIN;',
        '}',
        '',
        'node.status({ fill: "green", shape: "dot",',
        '  text: `${mode} | SOC:${soc}% | ${price.toFixed(2)} Kč | Solar:${solar}W` });',
        'global.set("energetika", { mode, gridSetpoint, blockExport, setupSOC, soc, price, solar });',
        '',
        'return [',
        '  { payload: gridSetpoint },',
        '  { payload: blockExport  },',
        '  { payload: setupSOC     },',
        '];',
      ].join('\n'),
      outputs: 3,
      x: 540, y: 140,
      wires: [
        ['wiz-debug-grid', 'wiz-out-grid'],
        ['wiz-debug-feed', 'wiz-out-feed'],
        ['wiz-debug-soc',  'wiz-out-soc' ],
      ] },

    // ── Debug výstupy ─────────────────────────────────────────────
    { id: 'wiz-debug-grid', type: 'debug', z: tabId,
      name: 'debug grid SP', active: true, tosidebar: true, console: false,
      complete: 'payload', targetType: 'msg',
      x: 760, y: 80, wires: [] },

    { id: 'wiz-debug-feed', type: 'debug', z: tabId,
      name: 'debug přetoky', active: true, tosidebar: true, console: false,
      complete: 'payload', targetType: 'msg',
      x: 760, y: 200, wires: [] },

    { id: 'wiz-debug-soc', type: 'debug', z: tabId,
      name: 'debug SOC', active: true, tosidebar: true, console: false,
      complete: 'payload', targetType: 'msg',
      x: 760, y: 320, wires: [] },

    // ── Victron ESS výstupy ───────────────────────────────────────
    { id: 'wiz-out-grid', type: 'victron-output-ess', z: tabId,
      name: 'Grid Setpoint',
      path: '/Settings/CGwacs/AcPowerSetPoint',
      onlyChanges: true,
      x: 760, y: 120, wires: [] },

    { id: 'wiz-out-feed', type: 'victron-output-ess', z: tabId,
      name: 'Přetoky (Feed-In)',
      path: '/Settings/CGwacs/OvervoltageFeedIn',
      onlyChanges: true,
      x: 760, y: 240, wires: [] },

    { id: 'wiz-out-soc', type: 'victron-output-ess', z: tabId,
      name: 'Min SOC',
      path: '/Settings/CGwacs/BatteryLife/MinimumSocLimit',
      onlyChanges: true,
      x: 760, y: 360, wires: [] },

    // ── Ruční přepsání — přetoky ──────────────────────────────────
    { id: 'wiz-man-feed-on', type: 'inject', z: tabId,
      name: 'RUČNÍ přetoky ON',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '1', payloadType: 'num',
      x: 540, y: 220, wires: [['wiz-out-feed']] },

    { id: 'wiz-man-feed-off', type: 'inject', z: tabId,
      name: 'RUČNÍ přetoky OFF',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '0', payloadType: 'num',
      x: 540, y: 260, wires: [['wiz-out-feed']] },

    // ── Ruční přepsání — SOC ──────────────────────────────────────
    { id: 'wiz-man-soc100', type: 'inject', z: tabId,
      name: 'RUČNÍ SOC 100%',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '100', payloadType: 'num',
      x: 540, y: 340, wires: [['wiz-out-soc']] },

    { id: 'wiz-man-soc10', type: 'inject', z: tabId,
      name: 'RUČNÍ SOC 10%',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '10', payloadType: 'num',
      x: 540, y: 380, wires: [['wiz-out-soc']] },

    // ── Ruční přepsání — setpoint ─────────────────────────────────
    { id: 'wiz-man-sp50', type: 'inject', z: tabId,
      name: 'RUČNÍ setpoint -50W',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '-50', payloadType: 'num',
      x: 540, y: 100, wires: [['wiz-out-grid']] },

    { id: 'wiz-man-sp7k', type: 'inject', z: tabId,
      name: 'RUČNÍ setpoint -7000W',
      props: [{ p: 'payload' }],
      repeat: '', once: false, topic: '',
      payload: '-7000', payloadType: 'num',
      x: 540, y: 60, wires: [['wiz-out-grid']] },
  ];

  const json = JSON.stringify(nodes, null, 2);
  const pre = document.getElementById('wiz-flow-output');
  if (pre) pre.textContent = json;
  const dlBtn = document.getElementById('wiz-dl-btn');
  if (dlBtn) dlBtn._flowJson = json;
  wizardRenderFlowViz(cfg);
}

// ── Flow visualization ──────────────────────────────────────────
function wizardRenderFlowViz(cfg) {
  const viz = document.getElementById('wiz-flow-viz');
  if (!viz) return;

  // Layout constants
  const NW = 134, NH = 28, h = NH / 2;
  const C = {
    inject:  { sc: '#7a9db5', bg: 'rgba(122,157,181,.13)' },
    http:    { sc: '#5b9bd5', bg: 'rgba(91,155,213,.13)'  },
    fn:      { sc: '#e8965e', bg: 'rgba(232,150,94,.13)'  },
    debug:   { sc: '#5cb85c', bg: 'rgba(92,184,92,.13)'   },
    victron: { sc: '#d9534f', bg: 'rgba(217,83,79,.13)'   },
  };

  // ── Node positions ──────────────────────────────────────────
  // Main chain (y=112 = center row)
  const nTimer = { x: 12,  y: 100, ...C.inject,  label: '⏱ Každou min.',   sub: 'inject' };
  const nHttp  = { x: 166, y: 100, ...C.http,    label: '⬇ GET data.json', sub: 'http request' };
  const nFn    = { x: 320, y: 100, ...C.fn,      label: '⚙ Zpracuj data',  sub: 'function ×3' };
  const nDbRaw = { x: 166, y: 38,  ...C.debug,   label: '🔍 RAW JSON',     sub: 'debug (off)' };

  // Output column A (debug) x=490, column B (victron-ess) x=640
  const nDbGrid  = { x: 490, y: 40,  ...C.debug,   label: '🔍 grid SP',      sub: 'debug' };
  const nOutGrid = { x: 640, y: 40,  ...C.victron,  label: '⚡ Grid Setpoint', sub: 'victron-ess' };
  const nDbFeed  = { x: 490, y: 160, ...C.debug,   label: '🔍 přetoky',      sub: 'debug' };
  const nOutFeed = { x: 640, y: 160, ...C.victron,  label: '↑ Feed-In',       sub: 'victron-ess' };
  const nDbSOC   = { x: 490, y: 280, ...C.debug,   label: '🔍 SOC',          sub: 'debug' };
  const nOutSOC  = { x: 640, y: 280, ...C.victron,  label: '🔋 Min SOC',      sub: 'victron-ess' };

  // Manual inject column (x=320, below main chain)
  const manY0 = 188;
  const manStep = 38;
  const nManSP50  = { x: 320, y: manY0 + 0*manStep, ...C.inject, label: 'RUČNÍ SP -50W',   sub: 'inject → grid' };
  const nManSP7k  = { x: 320, y: manY0 + 1*manStep, ...C.inject, label: 'RUČNÍ SP -7000W', sub: 'inject → grid' };
  const nManFeedOn= { x: 320, y: manY0 + 2*manStep, ...C.inject, label: 'RUČNÍ přetoky ON', sub: 'inject → feed' };
  const nManFeedOf= { x: 320, y: manY0 + 3*manStep, ...C.inject, label: 'RUČNÍ přetoky OFF',sub: 'inject → feed' };
  const nManSOC100= { x: 320, y: manY0 + 4*manStep, ...C.inject, label: 'RUČNÍ SOC 100%',  sub: 'inject → SOC' };
  const nManSOC10 = { x: 320, y: manY0 + 5*manStep, ...C.inject, label: 'RUČNÍ SOC 10%',   sub: 'inject → SOC' };

  const allNodes = [nTimer,nHttp,nFn,nDbRaw,nDbGrid,nOutGrid,nDbFeed,nOutFeed,nDbSOC,nOutSOC,
                    nManSP50,nManSP7k,nManFeedOn,nManFeedOf,nManSOC100,nManSOC10];

  const svgW = 640 + NW + 12;
  const svgH = manY0 + 5*manStep + NH + 14;

  // ── Wire helpers ────────────────────────────────────────────
  const defs = `<defs>
    <marker id="wfa" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
      <polygon points="0 0,6 3,0 6" fill="rgba(80,108,155,.75)"/>
    </marker>
    <marker id="wfm" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
      <polygon points="0 0,6 3,0 6" fill="rgba(180,130,80,.6)"/>
    </marker>
  </defs>`;

  const line = (n1, n2, marker='wfa') => {
    const x1 = n1.x + NW, y1 = n1.y + h, x2 = n2.x - 5, y2 = n2.y + h;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(80,108,155,.5)" stroke-width="1.5" marker-end="url(#${marker})"/>`;
  };

  const curve = (src, dst, marker='wfa', color='rgba(80,108,155,.4)') => {
    const x1 = src.x + NW, y1 = src.y + h, x2 = dst.x - 5, y2 = dst.y + h;
    const cx = x1 + Math.max(18, Math.abs(y2 - y1) * 0.35);
    return `<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="1.5" marker-end="url(#${marker})"/>`;
  };

  // Manual wire: goes right then curves to target
  const manWire = (src, dst) => {
    const x1 = src.x + NW, y1 = src.y + h, x2 = dst.x - 5, y2 = dst.y + h;
    const mid = x2 - 20;
    return `<path d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}" fill="none" stroke="rgba(180,130,60,.45)" stroke-width="1.3" stroke-dasharray="4,3" marker-end="url(#wfm)"/>`;
  };

  const drawNode = n => `
    <rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="4" fill="${n.bg}" stroke="${n.sc}" stroke-width="1.4"/>
    <rect x="${n.x}" y="${n.y}" width="5" height="${NH}" rx="2" fill="${n.sc}" opacity=".9"/>
    <text x="${n.x+NW/2+3}" y="${n.y+11}" text-anchor="middle" font-size="9" fill="#c8d4e8" font-family="'JetBrains Mono',monospace">${n.label}</text>
    <text x="${n.x+NW/2+3}" y="${n.y+22}" text-anchor="middle" font-size="7" fill="rgba(100,130,175,.65)" font-family="'JetBrains Mono',monospace">${n.sub}</text>`;

  // Separator label for manual section
  const sepY = manY0 - 10;
  const sepLabel = `
    <line x1="12" y1="${sepY}" x2="${svgW-12}" y2="${sepY}" stroke="rgba(80,108,155,.2)" stroke-width="1"/>
    <text x="14" y="${sepY - 3}" font-size="7.5" fill="rgba(180,130,60,.7)" font-family="'JetBrains Mono',monospace">── Ruční přepsání ──</text>`;

  const svg = `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;min-width:600px;">
    ${defs}
    ${line(nTimer, nHttp)}
    ${line(nHttp,  nFn)}
    ${curve(nHttp, nDbRaw)}
    ${curve(nFn, nDbGrid)}${line(nDbGrid, nOutGrid)}
    ${curve(nFn, nDbFeed)}${line(nDbFeed, nOutFeed)}
    ${curve(nFn, nDbSOC)}${line(nDbSOC,  nOutSOC)}
    ${manWire(nManSP50,   nOutGrid)}
    ${manWire(nManSP7k,   nOutGrid)}
    ${manWire(nManFeedOn, nOutFeed)}
    ${manWire(nManFeedOf, nOutFeed)}
    ${manWire(nManSOC100, nOutSOC)}
    ${manWire(nManSOC10,  nOutSOC)}
    ${sepLabel}
    ${allNodes.map(drawNode).join('')}
  </svg>`;

  viz.innerHTML = svg + `
    <div class="wiz-flow-legend">
      <span><i style="background:#7a9db5"></i>inject / ruční</span>
      <span><i style="background:#5b9bd5"></i>http request</span>
      <span><i style="background:#e8965e"></i>function</span>
      <span><i style="background:#d9534f"></i>victron-output-ess</span>
      <span><i style="background:#5cb85c"></i>debug</span>
      <span style="gap:.4rem"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="rgba(80,108,155,.6)" stroke-width="1.5"/></svg>auto</span>
      <span style="gap:.4rem"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="rgba(180,130,60,.6)" stroke-width="1.5" stroke-dasharray="4,2"/></svg>ruční</span>
    </div>`;
}

// ── Flow library ────────────────────────────────────────────────
async function wizardLoadLibrary() {
  const el = document.getElementById('wiz-flow-library');
  if (!el) return;
  try {
    const r = await fetch('/flows-library.json?_=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const db = await r.json();
    const flows = db.flows || [];
    if (!flows.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:.75rem;">Databáze je prázdná.</div>';
      return;
    }
    el.innerHTML = flows.map(f => `
      <div style="background:var(--bg2);border:1px solid var(--bg3);border-radius:10px;padding:.75rem 1rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.3rem;">
          <div>
            <span style="font-size:.82rem;font-weight:600;color:var(--text);">${f.name}</span>
            <span style="font-size:.65rem;color:var(--text3);margin-left:.5rem;font-family:'JetBrains Mono',monospace;">${f.date}</span>
          </div>
          <button onclick='wizardImportTemplate(${JSON.stringify(JSON.stringify(f))})' style="background:var(--surface2);border:1px solid var(--border);color:var(--accent);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:.68rem;white-space:nowrap;">Použít jako základ</button>
        </div>
        <div style="font-size:.75rem;color:var(--text2);margin-bottom:.4rem;">${f.description}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem;">
          ${(f.tags||[]).map(t=>`<span style="background:var(--cyan-dim);color:var(--cyan);font-size:.6rem;padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;">${t}</span>`).join('')}
        </div>
        ${f.notes ? `<div style="font-size:.68rem;color:var(--text3);margin-top:.4rem;font-family:'JetBrains Mono',monospace;border-top:1px solid var(--bg3);padding-top:.4rem;">${f.notes}</div>` : ''}
      </div>`).join('');
  } catch(e) {
    el.innerHTML = `<div style="color:var(--text3);font-size:.75rem;">Knihovna nedostupná: ${e.message}</div>`;
  }
}

function wizardImportTemplate(jsonStr) {
  const f = JSON.parse(jsonStr);
  const pre = document.getElementById('wiz-flow-output');
  const dlBtn = document.getElementById('wiz-dl-btn');
  const json = JSON.stringify(f.nodes, null, 2);
  if (pre) pre.textContent = json;
  if (dlBtn) dlBtn._flowJson = json;
  // Notify user
  const btn = event?.target;
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✅ Načteno!';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  }
}

function wizardCopyJson(btn) {
  const dlBtn = document.getElementById('wiz-dl-btn');
  const json  = dlBtn ? dlBtn._flowJson : null;
  if (!json) return;
  navigator.clipboard.writeText(json).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Zkopírováno!';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
  });
}

function wizardDownload() {
  const btn  = document.getElementById('wiz-dl-btn');
  const json = btn ? btn._flowJson : null;
  if (!json) { wizardGenerateFlow(); setTimeout(wizardDownload, 100); return; }
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'energetika-flow.json';
  a.click();
  URL.revokeObjectURL(url);
}

