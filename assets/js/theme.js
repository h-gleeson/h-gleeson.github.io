/* ── Theme: light/dark mode + customisable accent colour ──────────────
   The accent is stored as hue + saturation only ("h,s" in localStorage).
   Lightness is owned by the stylesheet (--accent-l), so a chosen hue
   stays legible in both dark and light mode.                          */

(function () {
    const STORAGE_KEY = 'accent';
    const DEFAULT_ACCENT = { h: 19, s: 100 };

    const PRESETS = [
        { name: 'EMBER',   h: 19,  s: 100 },
        { name: 'AMBER',   h: 41,  s: 100 },
        { name: 'ACID',    h: 74,  s: 80  },
        { name: 'JADE',    h: 152, s: 65  },
        { name: 'CYAN',    h: 187, s: 85  },
        { name: 'AZURE',   h: 213, s: 90  },
        { name: 'VIOLET',  h: 266, s: 75  },
        { name: 'MAGENTA', h: 322, s: 80  },
        { name: 'CRIMSON', h: 353, s: 80  },
        { name: 'BONE',    h: 30,  s: 8   }
    ];

    /* ── State ──────────────────────────────────────────────────────── */

    function readAccent() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_ACCENT };
        const [h, s] = raw.split(',').map(Number);
        if (!isFinite(h) || !isFinite(s)) return { ...DEFAULT_ACCENT };
        return { h: (h % 360 + 360) % 360, s: Math.min(100, Math.max(0, s)) };
    }

    function applyAccent(accent) {
        const root = document.documentElement;
        root.style.setProperty('--accent-h', accent.h);
        root.style.setProperty('--accent-s', accent.s + '%');
    }

    function saveAccent(accent) {
        localStorage.setItem(STORAGE_KEY, accent.h + ',' + accent.s);
    }

    function isLight() {
        return document.documentElement.classList.contains('light-mode');
    }

    /* Swatch preview colour — mirrors the lightness the page will use. */
    function swatchColor(accent) {
        return 'hsl(' + accent.h + ' ' + accent.s + '% ' + (isLight() ? 42 : 50) + '%)';
    }

    function hexToHS(hex) {
        const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r)      h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else                h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        const l = (max + min) / 2;
        const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        return { h: Math.round(h), s: Math.round(Math.min(1, s) * 100) };
    }

    /* ── Styles for the injected controls ───────────────────────────── */

    const CSS = `
    .theme-controls {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    #accent-toggle {
        font-family: var(--mono, monospace);
        font-size: 0.58rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        background: transparent;
        border: 1px solid var(--border-mid);
        color: var(--text-dim);
        padding: 6px 10px;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
        white-space: nowrap;
        line-height: 1;
        display: flex;
        align-items: center;
        gap: 7px;
    }
    #accent-toggle:hover,
    #accent-toggle[aria-expanded="true"] {
        border-color: var(--orange);
        color: var(--text-bright);
    }
    #accent-toggle .chip {
        width: 8px;
        height: 8px;
        background: var(--orange);
        display: block;
    }
    .accent-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 2000;
        background: var(--bg-panel, var(--bg));
        border: 1px solid var(--border-mid);
        padding: 12px;
        display: none;
    }
    .accent-panel.open { display: block; }
    .accent-panel .accent-label {
        font-family: var(--mono, monospace);
        font-size: 0.52rem;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--text-dim);
        display: block;
        margin-bottom: 10px;
        white-space: nowrap;
    }
    .accent-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
    }
    .accent-swatch {
        width: 20px;
        height: 20px;
        padding: 0;
        border: 1px solid transparent;
        outline-offset: 2px;
        cursor: pointer;
        background: transparent;
    }
    .accent-swatch span {
        display: block;
        width: 100%;
        height: 100%;
    }
    .accent-swatch:hover { border-color: var(--text-dim); }
    .accent-swatch[aria-checked="true"] { border-color: var(--text-bright); }
    .accent-custom {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid var(--border);
    }
    .accent-custom label {
        font-family: var(--mono, monospace);
        font-size: 0.52rem;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--text-dim);
        cursor: pointer;
    }
    .accent-custom input[type="color"] {
        width: 26px;
        height: 20px;
        padding: 0;
        border: 1px solid var(--border-mid);
        background: transparent;
        cursor: pointer;
    }
    `;

    /* ── Build ──────────────────────────────────────────────────────── */

    function buildPicker(toggleBtn, onChange) {
        const wrap = document.createElement('div');
        wrap.className = 'theme-controls';
        toggleBtn.parentNode.insertBefore(wrap, toggleBtn);
        wrap.appendChild(toggleBtn);

        const btn = document.createElement('button');
        btn.id = 'accent-toggle';
        btn.type = 'button';
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span class="chip"></span>ACCENT';
        wrap.appendChild(btn);

        const panel = document.createElement('div');
        panel.className = 'accent-panel';
        panel.setAttribute('role', 'radiogroup');
        panel.setAttribute('aria-label', 'Accent colour');
        panel.innerHTML = '<span class="accent-label">Accent colour</span><div class="accent-grid"></div>';
        wrap.appendChild(panel);

        const grid = panel.querySelector('.accent-grid');
        const swatches = PRESETS.map(preset => {
            const s = document.createElement('button');
            s.type = 'button';
            s.className = 'accent-swatch';
            s.setAttribute('role', 'radio');
            s.title = preset.name;
            s.setAttribute('aria-label', preset.name);
            s.innerHTML = '<span></span>';
            s.querySelector('span').style.background = swatchColor(preset);
            s.addEventListener('click', () => onChange({ h: preset.h, s: preset.s }));
            grid.appendChild(s);
            return { el: s, preset };
        });

        const custom = document.createElement('div');
        custom.className = 'accent-custom';
        custom.innerHTML = '<label for="accent-custom-input">Custom</label>' +
                           '<input type="color" id="accent-custom-input">';
        panel.appendChild(custom);
        const colorInput = custom.querySelector('input');
        colorInput.addEventListener('input', () => {
            const hs = hexToHS(colorInput.value);
            if (hs) onChange(hs);
        });

        btn.addEventListener('click', e => {
            e.stopPropagation();
            const open = panel.classList.toggle('open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        panel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => {
            panel.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && panel.classList.contains('open')) {
                panel.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
                btn.focus();
            }
        });

        return function refresh(current) {
            swatches.forEach(({ el, preset }) => {
                el.querySelector('span').style.background = swatchColor(preset);
                el.setAttribute('aria-checked',
                    preset.h === current.h && preset.s === current.s ? 'true' : 'false');
            });
        };
    }

    /* ── Init ───────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', () => {
        let accent = readAccent();
        applyAccent(accent);

        const btn = document.getElementById('theme-toggle');
        if (!btn) return;

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        function updateModeBtn() {
            btn.innerHTML = 'MODE: <span style="color:var(--orange)">' +
                (isLight() ? 'LIGHT' : 'DARK') + '</span>';
        }
        updateModeBtn();

        const refreshPicker = buildPicker(btn, next => {
            accent = next;
            applyAccent(accent);
            saveAccent(accent);
            refreshPicker(accent);
        });
        refreshPicker(accent);

        btn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-mode');
            localStorage.setItem('theme', isLight() ? 'light' : 'dark');
            updateModeBtn();
            refreshPicker(accent);
        });
    });
})();
