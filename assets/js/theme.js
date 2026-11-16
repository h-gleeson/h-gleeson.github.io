/* ── Theme: light/dark mode and motion switches ──────────────────────
   Turns the page's #theme-toggle button into the MODE switch and, on
   pages that animate, adds a MOTION switch under it. The colours are a
   fixed palette (Swiss Pale Blue, in theme.css / home.css), so there is
   no colour picker.                                                    */

(function () {
    function isLight() {
        return document.documentElement.classList.contains('light-mode');
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
    #motion-toggle {
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
    #motion-toggle:hover {
        border-color: var(--orange);
        color: var(--text-bright);
    }
    `;

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
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        btn.type = 'button';

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const wrap = document.createElement('div');
        wrap.className = 'theme-controls';
        btn.parentNode.insertBefore(wrap, btn);
        wrap.appendChild(btn);

        function updateModeBtn() {
            btn.innerHTML = 'MODE: <span>' + (isLight() ? 'LIGHT' : 'DARK') + '</span>';
            btn.setAttribute('aria-label', isLight()
                ? 'Colour mode is light. Switch to dark'
                : 'Colour mode is dark. Switch to light');
        }
        updateModeBtn();
        buildMotionToggle(wrap);

        btn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-mode');
            try { localStorage.setItem('theme', isLight() ? 'light' : 'dark'); } catch (e) { /* still applies for this visit */ }
            updateModeBtn();
            document.dispatchEvent(new CustomEvent('themechange', { detail: { light: isLight() } }));
        });
    });
})();
