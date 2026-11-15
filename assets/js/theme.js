/* ── Theme: light/dark mode + customisable accent colour ──────────────
   The accent is stored as hue + saturation only ("h,s" in localStorage).
   Lightness is worked out in theme-init.js, so a chosen hue stays
   legible in both dark and light mode.                                */

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

    /* Reading and applying the accent lives in theme-init.js, which also
       picks a readable lightness for accent-coloured text. */
    function readAccent() { return window.SiteTheme.readAccent(); }
    function applyAccent(accent) { window.SiteTheme.applyAccent(accent); }

    function saveAccent(accent) {
        try { localStorage.setItem(STORAGE_KEY, accent.h + ',' + accent.s); } catch (e) { /* still applies for this visit */ }
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
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        flex-shrink: 0;
    }
    #theme-toggle span, #motion-toggle span { color: var(--orange); }
    #motion-toggle,
    #accent-toggle {
        font-family: var(--mono, monospace);
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: transparent;
        border: 1px solid var(--border-mid);
        color: var(--text-dim);
        padding: 6px 10px;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
        white-space: nowrap;
        line-height: 1.2;
        display: flex;
        align-items: center;
        gap: 7px;
    }
    #motion-toggle:hover,
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
        font-size: 0.75rem;
        letter-spacing: 0.08em;
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
        width: 28px;
        height: 28px;
        padding: 0;
        border: 2px solid transparent;
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
        font-size: 0.75rem;
        letter-spacing: 0.08em;
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
        btn.setAttribute('aria-controls', 'accent-panel');
        btn.innerHTML = '<span class="chip" aria-hidden="true"></span>ACCENT';
        wrap.appendChild(btn);

        const panel = document.createElement('div');
        panel.className = 'accent-panel';
        panel.id = 'accent-panel';
        panel.innerHTML = '<span class="accent-label" id="accent-label">Accent colour</span>' +
            '<div class="accent-grid" role="radiogroup" aria-labelledby="accent-label"></div>';
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

    /* ── Motion switch ──────────────────────────────────────────────────
       Only pages that animate continuously ask for it, by putting
       data-motion-control on <html>. It is left out when the visitor's
       system already asks for reduced motion, because motion is then off. */

    function buildMotionToggle(wrap) {
        const root = document.documentElement;
        if (!root.hasAttribute('data-motion-control')) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const btn = document.createElement('button');
        btn.id = 'motion-toggle';
        btn.type = 'button';
        function update() {
            const off = root.classList.contains('reduce-motion');
            btn.innerHTML = 'MOTION: <span>' + (off ? 'OFF' : 'ON') + '</span>';
            btn.setAttribute('aria-label', off ? 'Motion is off. Turn animation on' : 'Motion is on. Turn animation off');
        }
        btn.addEventListener('click', () => {
            const off = root.classList.toggle('reduce-motion');
            try { localStorage.setItem('motion', off ? 'off' : 'on'); } catch (e) { /* still applies for this visit */ }
            update();
            document.dispatchEvent(new CustomEvent('motionchange', { detail: { off: off } }));
        });
        update();
        wrap.appendChild(btn);
    }

    /* ── Init ───────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', () => {
        let accent = readAccent();
        applyAccent(accent);

        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        btn.type = 'button';

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        function updateModeBtn() {
            btn.innerHTML = 'MODE: <span>' + (isLight() ? 'LIGHT' : 'DARK') + '</span>';
            btn.setAttribute('aria-label', isLight()
                ? 'Colour mode is light. Switch to dark'
                : 'Colour mode is dark. Switch to light');
        }
        updateModeBtn();

        const refreshPicker = buildPicker(btn, next => {
            accent = next;
            applyAccent(accent);
            saveAccent(accent);
            refreshPicker(accent);
        });
        refreshPicker(accent);
        buildMotionToggle(btn.parentNode);

        btn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-mode');
            try { localStorage.setItem('theme', isLight() ? 'light' : 'dark'); } catch (e) { /* still applies for this visit */ }
            applyAccent(accent);   // the readable accent lightness depends on the mode
            updateModeBtn();
            refreshPicker(accent);
        });
    });
})();
