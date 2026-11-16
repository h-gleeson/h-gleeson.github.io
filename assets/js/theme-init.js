/* ── Theme bootstrap ───────────────────────────────────────────────────
   Loaded in <head> (before the page paints) on every page, so the saved
   light/dark mode and motion preference apply without a flash. theme.js
   builds the visible controls later.

   The colours themselves are fixed: the Swiss Pale Blue palette in
   theme.css / home.css. (There used to be a free accent picker; its old
   saved value, if any, is simply ignored now.)                          */

(function () {
    'use strict';
    var root = document.documentElement;

    function read(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    if (read('theme') === 'light') root.classList.add('light-mode');
    if (read('motion') === 'off') root.classList.add('reduce-motion');

    window.SiteTheme = {
        isLight: function () { return root.classList.contains('light-mode'); },
        /* True when animation should be held still: the visitor's system
           setting, or the MOTION switch on the homepage. */
        motionOff: function () {
            return root.classList.contains('reduce-motion') ||
                !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        }
    };
})();
