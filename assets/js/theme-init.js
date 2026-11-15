/* ── Theme bootstrap ───────────────────────────────────────────────────
   Loaded in <head> (before the page paints) on every page, so the saved
   light/dark mode, accent colour and motion preference apply without a
   flash. theme.js builds the visible controls later.

   The accent is stored as hue + saturation ("h,s"). Lightness is worked
   out here: --accent-l is the vivid tone used for fills and tints, and
   --accent-text-l is nudged lighter (dark mode) or darker (light mode)
   until text in that colour reaches 4.5:1 contrast on the page surfaces.
   That keeps every preset, and any custom colour, readable.            */

(function () {
    'use strict';
    var root = document.documentElement;

    function read(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    /* Relative luminance (WCAG) of an HSL colour. */
    function luminance(h, s, l) {
        s /= 100; l /= 100;
        var k = function (n) { return (n + h / 30) % 12; };
        var a = s * Math.min(l, 1 - l);
        var f = function (n) {
            var c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
    }

    /* Luminance of the surface accent-coloured text has the least contrast
       against: the lightest dark surface (cards) or darkest light one (panels). */
    var SURFACE = { dark: 0.02, light: 0.74 };
    var BASE_L = { dark: 50, light: 42 };

    function textLightness(h, s, light) {
        var l = light ? BASE_L.light : BASE_L.dark;
        var ref = light ? SURFACE.light : SURFACE.dark;
        for (var i = 0; i < 60; i++) {
            var lum = luminance(h, s, l);
            var ratio = light ? (ref + 0.05) / (lum + 0.05) : (lum + 0.05) / (ref + 0.05);
            if (ratio >= 4.5) break;
            l += light ? -1 : 1;
        }
        return l;
    }

    function readAccent() {
        var a = (read('accent') || '').split(',');
        if (a.length === 2 && a[0] !== '' && isFinite(a[0]) && isFinite(a[1])) {
            return { h: ((+a[0] % 360) + 360) % 360, s: Math.min(100, Math.max(0, +a[1])) };
        }
        return { h: 19, s: 100 };
    }

    function isLight() { return root.classList.contains('light-mode'); }

    function applyAccent(accent) {
        var light = isLight();
        root.style.setProperty('--accent-h', accent.h);
        root.style.setProperty('--accent-s', accent.s + '%');
        root.style.setProperty('--accent-l', (light ? BASE_L.light : BASE_L.dark) + '%');
        root.style.setProperty('--accent-text-l', textLightness(accent.h, accent.s, light) + '%');
    }

    if (read('theme') === 'light') root.classList.add('light-mode');
    if (read('motion') === 'off') root.classList.add('reduce-motion');
    applyAccent(readAccent());

    window.SiteTheme = {
        readAccent: readAccent,
        applyAccent: applyAccent,
        isLight: isLight,
        luminance: luminance,
        textLightness: textLightness,
        /* True when animation should be held still: the visitor's system
           setting, or the MOTION switch on the homepage. */
        motionOff: function () {
            return root.classList.contains('reduce-motion') ||
                !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        }
    };
})();
