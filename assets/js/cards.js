/* ── Trading-card rails ────────────────────────────────────────────────
   • Every card rolls once per page load for its FULL ART variant.
   • Each rail keeps one active (raised) card.
   • Wheel over a rail moves the highlight; at either end the page
     scrolls normally so the rail never traps the scroll.
   • Click a card that isn't active -> it becomes active.
     Click the active card -> open it.
   • Arrow keys move the highlight, Enter/Space opens the active card. */

(function () {
    'use strict';

    /* Odds of any given card showing up as its full-art variant.
       1 / 20 = 5%.  Bump the denominator to make them rarer.
       Independent of the odds, the page always shows at least one full
       art card: if nobody wins the roll, one is drawn at random. */
    var FULL_ART_CHANCE = 1 / 20;

    var reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── Rarity roll ───────────────────────────────────────────────── */

    function makeFullArt(card) {
        card.classList.add('full-art');

        if (!card.querySelector('.holo')) {
            var holo = document.createElement('div');
            holo.className = 'holo';
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
        var hudNow = wrap && wrap.querySelector('.rail-now');
        var hudTitle = wrap && wrap.querySelector('.rail-title');
        var active = 0;

        function pad(n) { return (n < 10 ? '0' : '') + n; }

        function setActive(i, scroll) {
            active = Math.max(0, Math.min(cards.length - 1, i));
            cards.forEach(function (c, n) {
                c.style.transform = '';   // clear any lingering tilt
                c.classList.toggle('is-active', n === active);
                c.setAttribute('tabindex', n === active ? '0' : '-1');
                c.setAttribute('aria-current', n === active ? 'true' : 'false');
            });
            if (hudNow) hudNow.textContent = pad(active + 1);
            if (hudTitle) {
                var t = cards[active].querySelector('.card-title');
                hudTitle.textContent = t ? t.textContent.trim() : '';
            }
            if (scroll !== false) centre(cards[active]);
        }

        /* Scroll the rail (not the page) so the active card sits centred. */
        function centre(card) {
            var target = card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;
            var max = rail.scrollWidth - rail.clientWidth;
            target = Math.max(0, Math.min(max, target));
            if (Math.abs(target - rail.scrollLeft) < 2) return;
            if (reduceMotion || !rail.scrollTo) rail.scrollLeft = target;
            else rail.scrollTo({ left: target, behavior: 'smooth' });
        }

        /* ── Wheel: step the highlight, but hand scroll back at the ends */
        var wheelAcc = 0;
        var wheelLock = false;

        rail.addEventListener('wheel', function (e) {
            var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            var dir = delta > 0 ? 1 : -1;

            // at the end of the rail in this direction: let the page scroll
            if ((dir > 0 && active === cards.length - 1) ||
                (dir < 0 && active === 0)) return;

            e.preventDefault();
            if (wheelLock) return;

            wheelAcc += delta;
            if (Math.abs(wheelAcc) < 24) return;

            setActive(active + (wheelAcc > 0 ? 1 : -1));
            wheelAcc = 0;
            wheelLock = true;
            setTimeout(function () { wheelLock = false; }, 220);
        }, { passive: false });

        /* ── Click: promote, then open ─────────────────────────────── */
        cards.forEach(function (card, i) {
            card.addEventListener('click', function (e) {
                if (i !== active) {
                    e.preventDefault();
                    setActive(i);
                }
                // already active -> fall through, the <a> navigates
            });

            card.addEventListener('keydown', function (e) {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActive(active + 1);
                    cards[active].focus();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActive(active - 1);
                    cards[active].focus();
                }
            });
        });

        /* ── Pointer tilt on the active card ───────────────────────── */
        if (!reduceMotion) {
            cards.forEach(function (card) {
                card.addEventListener('pointermove', function (e) {
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
        }

        /* Re-centre when the rail is revealed (<details> opens) or resized */
        var reveal = function () { if (rail.clientWidth) centre(cards[active]); };
        window.addEventListener('resize', reveal);
        var details = rail.closest('details');
        if (details) details.addEventListener('toggle', function () {
            if (details.open) setTimeout(reveal, 60);
        });

        setActive(0, false);
    }

    /* ── Boot ──────────────────────────────────────────────────────── */

    document.addEventListener('DOMContentLoaded', function () {
        rollVariants();
        document.querySelectorAll('.card-rail').forEach(initRail);
    });
})();
