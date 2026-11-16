/* ── Trading-card rails ────────────────────────────────────────────────
   • Every card rolls once per page load for its FULL ART variant.
   • Each rail keeps one active (raised) card.
   • Swiping scrolls the rail natively and selects the leading card; the
     page still scrolls up and down as usual, with touch or a mouse wheel.
   • Previous / Next buttons step through the rail. "View all cards"
     lays the whole set out as a binder grid.
   • Click or tap a card that isn't active -> it becomes active.
     Click the active card -> open it.
   • Every card is a link you can Tab to. Focusing one raises it, Enter
     opens it, and the arrow keys move between cards. */

(function () {
    'use strict';

    /* Odds of any given card showing up as its full-art variant.
       1 / 20 = 5%.  Bump the denominator to make them rarer.
       Independent of the odds, the page always shows at least one full
       art card: if nobody wins the roll, one is drawn at random. */
    var FULL_ART_CHANCE = 1 / 20;

    /* Checked each time it matters, so the MOTION switch works at once. */
    function motionOff() {
        if (window.SiteTheme) return window.SiteTheme.motionOff();
        return !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /* ── Rarity roll ───────────────────────────────────────────────── */

    function makeFullArt(card) {
        card.classList.add('full-art');

        if (!card.querySelector('.holo')) {
            var holo = document.createElement('div');
            holo.className = 'holo';
            holo.setAttribute('aria-hidden', 'true');
            card.appendChild(holo);
        }
        if (!card.querySelector('.card-rarity')) {
            var tag = document.createElement('span');
            tag.className = 'card-rarity';
            tag.textContent = 'Full Art';
            card.appendChild(tag);
        }
    }

    function rollVariants() {
        var all = Array.prototype.slice.call(document.querySelectorAll('.card'));
        if (!all.length) return;

        // data-variant="full" / "regular" pins a card, handy for previewing
        var eligible = [];
        var winners = [];

        all.forEach(function (card) {
            var forced = card.dataset.variant;
            if (forced === 'full') { winners.push(card); return; }
            if (forced === 'regular') return;

            eligible.push(card);
            if (Math.random() < FULL_ART_CHANCE) winners.push(card);
        });

        // guarantee: the page never renders without a full art card
        if (!winners.length && eligible.length) {
            winners.push(eligible[Math.floor(Math.random() * eligible.length)]);
        }

        winners.forEach(makeFullArt);
    }

    /* ── One rail ──────────────────────────────────────────────────── */

    function initRail(rail) {
        var cards = Array.prototype.slice.call(rail.querySelectorAll('.card'));
        if (!cards.length) return;

        var wrap = rail.closest('.card-rail-wrap');
        var hud = wrap && wrap.querySelector('.rail-hud');
        var hudNow = wrap && wrap.querySelector('.rail-now');
        var hudTitle = wrap && wrap.querySelector('.rail-title');
        var name = rail.getAttribute('aria-label') || 'cards';
        var active = 0;
        var grid = false;
        var scrollTarget = null;
        var scrollIdleTimer = null;
        var prevBtn = null, nextBtn = null, allBtn = null, live = null;

        function pad(n) { return (n < 10 ? '0' : '') + n; }

        function titleOf(card) {
            var t = card.querySelector('.card-title');
            return t ? t.textContent.trim() : '';
        }

        function setActive(i, scroll) {
            active = Math.max(0, Math.min(cards.length - 1, i));
            cards.forEach(function (c, n) {
                c.style.transform = '';   // clear any lingering tilt
                c.classList.toggle('is-active', n === active && !grid);
                if (n === active && !grid) c.setAttribute('aria-current', 'true');
                else c.removeAttribute('aria-current');
            });
            if (hudNow) hudNow.textContent = pad(active + 1);
            if (hudTitle) hudTitle.textContent = titleOf(cards[active]);
            if (prevBtn) prevBtn.disabled = active === 0;
            if (nextBtn) nextBtn.disabled = active === cards.length - 1;
            if (scroll !== false && !grid) centre(cards[active]);
        }

        /* Scroll the rail (not the page) so the active card sits centred. */
        function centre(card) {
            var target = card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;
            var max = rail.scrollWidth - rail.clientWidth;
            target = Math.max(0, Math.min(max, target));
            if (Math.abs(target - rail.scrollLeft) < 2) return;
            // Keep click/keyboard selection while its smooth scroll passes
            // other cards. A new gesture takes ownership immediately.
            scrollTarget = target;
            if (motionOff() || !rail.scrollTo) rail.scrollLeft = target;
            else rail.scrollTo({ left: target, behavior: 'smooth' });
        }

        function selectFromScroll() {
            if (grid || scrollTarget !== null || !rail.clientWidth) return;
            var max = rail.scrollWidth - rail.clientWidth;
            if (max <= 1) return;
            var left = Math.max(0, Math.min(max, rail.scrollLeft));
            var padding = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
            var next = cards.length - 1;
            if (left < max - 2) {
                // Ignore the trailing sliver of the previous card once most
                // of it has left the row. Layout offsets ignore tilt/scale.
                for (var i = 0; i < cards.length; i++) {
                    if (cards[i].offsetLeft + cards[i].offsetWidth / 2 > left + padding) {
                        next = i;
                        break;
                    }
                }
            }
            if (next !== active) setActive(next, false);
        }

        rail.addEventListener('scroll', function () {
            clearTimeout(scrollIdleTimer);
            scrollIdleTimer = setTimeout(function () { scrollTarget = null; }, 180);
            // Browsers can emit a final fractional scroll after reaching
            // the target, so keep ownership until scrolling has gone idle.
            if (scrollTarget !== null) return;
            selectFromScroll();
        }, { passive: true });

        /* A new touch, pen or trackpad gesture takes over from any scroll we
           started. Both listeners are passive: swiping sideways scrolls the
           rail natively and swiping or wheeling up/down scrolls the page. */
        function releaseScroll() {
            scrollTarget = null;
            clearTimeout(scrollIdleTimer);
        }
        rail.addEventListener('pointerdown', releaseScroll, { passive: true });
        rail.addEventListener('wheel', function (e) {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) releaseScroll();
        }, { passive: true });

        /* ── Click: promote, then open. Keyboard: focus promotes. ─────── */
        cards.forEach(function (card, i) {
            card.addEventListener('click', function (e) {
                if (grid) return;                 // binder view: every card opens directly
                if (i !== active) {
                    e.preventDefault();
                    setActive(i);
                }
                // already active -> fall through, the <a> navigates
            });

            card.addEventListener('focus', function () {
                // Only for keyboard focus; a mouse or touch press is handled by click.
                var keyboard = true;
                try { keyboard = card.matches(':focus-visible'); } catch (err) { /* older browsers */ }
                if (keyboard && !grid && i !== active) setActive(i);
            });

            card.addEventListener('keydown', function (e) {
                var step = 0;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') step = 1;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') step = -1;
                else if (e.key === 'Home') step = -cards.length;
                else if (e.key === 'End') step = cards.length;
                if (!step) return;
                e.preventDefault();
                var to = Math.max(0, Math.min(cards.length - 1, i + step));
                if (!grid) setActive(to);
                cards[to].focus();
            });
        });

        /* ── Pointer tilt on the active card ───────────────────────── */
        cards.forEach(function (card) {
            card.addEventListener('pointermove', function (e) {
                if (e.pointerType === 'touch' || grid || motionOff()) return;
                if (!card.classList.contains('is-active')) return;
                var r = card.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                card.style.transform =
                    'translateY(-34px) scale(1) perspective(700px) rotateY(' +
                    (px * 9).toFixed(2) + 'deg) rotateX(' +
                    (-py * 9).toFixed(2) + 'deg)';
            });
            card.addEventListener('pointerleave', function () {
                card.style.transform = '';
            });
        });

        /* ── Previous / Next / View all ────────────────────────────────
           Built here so they only appear when they can do something. */
        function announce(text) {
            if (live) live.textContent = text;
        }

        function setGrid(on) {
            grid = on;
            rail.classList.toggle('is-grid', on);
            if (wrap) wrap.classList.toggle('is-grid', on);
            if (allBtn) {
                allBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
                allBtn.textContent = on ? 'Back to one row' : 'View all cards';
            }
            try { sessionStorage.setItem('rail-view:' + name, on ? 'grid' : 'row'); } catch (e) { /* optional */ }
            cards.forEach(function (c) { c.classList.add('art-in'); });   // everything is on show
            if (on) rail.scrollLeft = 0;
            setActive(active, !on);
        }

        if (hud && cards.length > 1) {
            var controls = document.createElement('div');
            controls.className = 'rail-controls';

            prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'rail-btn rail-step';
            prevBtn.textContent = '← Prev';
            prevBtn.setAttribute('aria-label', 'Previous card in ' + name);

            nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'rail-btn rail-step';
            nextBtn.textContent = 'Next →';
            nextBtn.setAttribute('aria-label', 'Next card in ' + name);

            allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.className = 'rail-btn rail-all';
            allBtn.textContent = 'View all cards';
            allBtn.setAttribute('aria-pressed', 'false');

            live = document.createElement('span');
            live.className = 'visually-hidden';
            live.setAttribute('aria-live', 'polite');

            var step = function (dir) {
                setActive(active + dir);
                announce('Card ' + (active + 1) + ' of ' + cards.length + ': ' + titleOf(cards[active]));
            };
            prevBtn.addEventListener('click', function () { step(-1); });
            nextBtn.addEventListener('click', function () { step(1); });
            allBtn.addEventListener('click', function () {
                setGrid(!grid);
                announce(grid ? 'Showing all ' + cards.length + ' cards in a grid.' : 'Showing one row of cards.');
            });

            controls.appendChild(prevBtn);
            controls.appendChild(nextBtn);
            controls.appendChild(allBtn);
            hud.appendChild(controls);
            hud.appendChild(live);
        }

        /* ── Deal: cards drop in one by one when the rail is revealed.
           The active card lands first, the rest follow left to right. */
        var DEAL_STAGGER = 75;   // ms between cards
        var dealTimer = null;

        function deal() {
            if (motionOff() || grid) return;
            var order = [cards[active]].concat(cards.filter(function (c, n) {
                return n !== active;
            }));
            rail.classList.remove('is-dealing');
            order.forEach(function (c, n) {
                c.style.setProperty('--deal-delay', (n * DEAL_STAGGER) + 'ms');
            });
            void rail.offsetWidth;   // restart the animation if it's mid-run
            rail.classList.add('is-dealing');

            clearTimeout(dealTimer);
            dealTimer = setTimeout(function () {
                rail.classList.remove('is-dealing');
            }, order.length * DEAL_STAGGER + 800);
        }

        /* ── Collapse: the reverse of the deal. Cards lift back up into
           the tab right to left, the active card leaving last, and only
           then does the <details> actually close. */
        var COLLAPSE_STAGGER = 45;
        var COLLAPSE_DURATION = 460;
        var WRAP_LEAD = 160;   // ms the cards get moving before the tab starts closing
        var collapsing = false;

        function collapse(details) {
            collapsing = true;
            clearTimeout(dealTimer);
            rail.classList.remove('is-dealing');

            var order = cards.filter(function (c, n) {
                return n !== active;
            }).reverse().concat([cards[active]]);
            order.forEach(function (c, n) {
                c.style.transform = '';   // drop any tilt before lifting
                c.style.setProperty('--deal-delay', (n * COLLAPSE_STAGGER) + 'ms');
            });

            var totalDuration = (order.length - 1) * COLLAPSE_STAGGER + COLLAPSE_DURATION;

            // cards start lifting immediately; the tab itself follows a beat
            // later so it reads as being pulled shut by the cards leaving,
            // rather than the two starting in lockstep.
            if (wrap) {
                var wrapDuration = Math.max(totalDuration - WRAP_LEAD, COLLAPSE_DURATION);
                wrap.style.height = wrap.offsetHeight + 'px';
                wrap.style.overflow = 'hidden';
                void wrap.offsetHeight;   // force reflow before animating
                setTimeout(function () {
                    wrap.style.transition =
                        'height ' + wrapDuration + 'ms cubic-bezier(.4,0,1,1), ' +
                        'opacity ' + Math.round(wrapDuration * 0.8) + 'ms ease';
                    requestAnimationFrame(function () {
                        wrap.style.height = '0px';
                        wrap.style.opacity = '0';
                    });
                }, WRAP_LEAD);
            }
            details.classList.add('is-closing');
            rail.classList.add('is-collapsing');

            setTimeout(function () {
                details.open = false;
                rail.classList.remove('is-collapsing');
                details.classList.remove('is-closing');
                if (wrap) {
                    wrap.style.height = '';
                    wrap.style.overflow = '';
                    wrap.style.opacity = '';
                    wrap.style.transition = '';
                }
                collapsing = false;
            }, totalDuration);
        }

        /* Re-centre when the rail is revealed (<details> opens) or resized */
        var reveal = function () { if (rail.clientWidth && !grid) centre(cards[active]); };
        window.addEventListener('resize', reveal);
        var details = rail.closest('details');
        if (details) details.addEventListener('toggle', function () {
            if (!details.open) return;
            if (!rail.classList.contains('is-dealing')) deal();
            setTimeout(reveal, 60);
        });

        var summary = details && details.querySelector(':scope > summary');
        if (summary) summary.addEventListener('click', function (e) {
            if (collapsing) { e.preventDefault(); return; }
            if (!details.open) return;        // opening: let it through, toggle deals
            if (motionOff() || grid) return;  // plain close, no animation
            e.preventDefault();
            collapse(details);
        });

        setActive(0, false);
        var saved = null;
        try { saved = sessionStorage.getItem('rail-view:' + name); } catch (e) { /* optional */ }
        if (saved === 'grid' && allBtn) setGrid(true);
        if (!details || details.open) deal();
    }

    /* ── Boot ──────────────────────────────────────────────────────── */

    /* url() inside a custom property resolves against the stylesheet
       (assets/css/), not the page. Rewrite --art / --art-full as absolute
       URLs so paths in index.html can stay relative to the page. */
    function resolveArt() {
        document.querySelectorAll('.card-art').forEach(function (el) {
            ['--art', '--art-full'].forEach(function (prop) {
                var v = el.style.getPropertyValue(prop);
                var m = v && v.match(/url\(\s*(['"]?)(.*?)\1\s*\)/);
                if (!m) return;
                el.style.setProperty(prop,
                    'url("' + new URL(m[2], document.baseURI).href + '")');
            });
        });
    }

    /* Lazy art: while <html> has .lazy-art, cards.css hides every card's
       artwork until the card gets .art-in. Each rail flags cards as they
       come within ~2 cards of its visible edge, so a long rail only
       downloads what's near the viewport. Runs after rollVariants, so a
       card fetches just the variant it's showing. */
    function watchArt(rail) {
        var cards = rail.querySelectorAll('.card');
        if (!('IntersectionObserver' in window)) {
            cards.forEach(function (c) { c.classList.add('art-in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                e.target.classList.add('art-in');
                io.unobserve(e.target);
            });
        }, { root: rail, rootMargin: '0px 600px' });
        cards.forEach(function (c) { io.observe(c); });
    }

    /* Fit text: cards are a fixed 5:7. If any card's text doesn't fit,
       shrink the card text on EVERY card by the same step (--card-text on
       <html>) until all of them fit. Measured on hidden copies of each card
       in both variants, so closed sections and the random full-art roll
       don't change the result. */
    var FIT_MIN = 0.7, FIT_STEP = 0.025;

    /* The largest text scale (FIT_MIN–1) at which every given card fits,
       in both variants. Copies are measured inside `host` (default <body>)
       so they pick up any settings set on it. `fits` is false when even
       FIT_MIN is too big. */
    function fitScale(cards, host) {
        host = host || document.body;
        var box = document.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
        Array.prototype.forEach.call(cards, function (card) {
            [false, true].forEach(function (full) {
                var c = card.cloneNode(true);
                c.classList.remove('is-active');
                c.classList.toggle('full-art', full);
                c.removeAttribute('id');
                box.appendChild(c);
            });
        });
        host.appendChild(box);
        var copies = Array.prototype.slice.call(box.children);
        var fits = function () {
            return copies.every(function (c) { return c.scrollHeight <= c.clientHeight + 1; });
        };
        var scale = 1;
        box.style.setProperty('--card-text', scale);
        while (!fits() && scale > FIT_MIN + 1e-6) {
            scale = Math.max(FIT_MIN, +(scale - FIT_STEP).toFixed(3));
            box.style.setProperty('--card-text', scale);
        }
        var ok = fits();
        box.remove();
        return { scale: scale, fits: ok };
    }

    function fitText() {
        var cards = document.querySelectorAll('.card-rail .card');
        if (!cards.length) return;
        var root = document.documentElement;
        root.classList.remove('card-text-overflow');
        var result = fitScale(cards);
        root.style.setProperty('--card-text', result.scale);
        root.classList.toggle('card-text-overflow', !result.fits);
    }

    // shared with the card workshop (experiments/cards/)
    window.SiteCards = { fitScale: fitScale, FIT_MIN: FIT_MIN };

    document.addEventListener('DOMContentLoaded', function () {
        resolveArt();
        fitText();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitText);
        var fitTimer;
        window.addEventListener('resize', function () {
            clearTimeout(fitTimer);
            fitTimer = setTimeout(fitText, 150);
        });
        rollVariants();
        document.querySelectorAll('.card-rail').forEach(watchArt);
        document.querySelectorAll('.card-rail').forEach(initRail);
    });
})();
