(() => {
    'use strict';

    const trigger = document.getElementById('rip-pack');
    const dialog = document.getElementById('pack-dialog');
    const projects = Array.from(document.querySelectorAll('#projects .card-rail > a.card'));
    const packSize = 6;
    if (projects.length < packSize || typeof dialog.showModal !== 'function') return;

    const sealed = dialog.querySelector('.pack-sealed');
    const wrapper = dialog.querySelector('.pack-wrapper');
    const openButton = dialog.querySelector('#pack-open');
    const reveal = dialog.querySelector('.pack-reveal');
    const counter = dialog.querySelector('.pack-counter');
    const stack = dialog.querySelector('.pack-stack');
    const face = dialog.querySelector('.pack-face');
    const advance = dialog.querySelector('.pack-advance');
    const projectLink = dialog.querySelector('.pack-project-link');
    const collection = dialog.querySelector('.pack-collection');
    const list = dialog.querySelector('.pack-list');
    const again = dialog.querySelector('.pack-again');

    let cards = [];
    let cardIndex = 0;
    let drag = null;
    let openingTimer;

    function deal() {
        const pool = projects.slice();
        const hasFullArt = Math.random() < 1 / 3;
        return Array.from({ length: packSize }, (_, index) => {
            const source = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            return {
                source,
                title: source.querySelector('.card-title').textContent,
                full: index === packSize - 1 && hasFullArt
            };
        });
    }

    function resetDrag(keepShreds = false) {
        if (drag && wrapper.hasPointerCapture(drag.id)) wrapper.releasePointerCapture(drag.id);
        drag = null;
        wrapper.style.removeProperty('--tear');
        wrapper.style.removeProperty('--peel');
        wrapper.classList.remove('is-tearing');
        if (!keepShreds) wrapper.querySelectorAll('.pack-shred').forEach(shred => shred.remove());
    }

    function newPack() {
        clearTimeout(openingTimer);
        resetDrag();
        cards = deal();
        cardIndex = 0;
        wrapper.classList.remove('is-torn');
        sealed.hidden = false;
        reveal.hidden = true;
        collection.hidden = true;
        face.replaceChildren();
        list.replaceChildren();
        if (!dialog.open) dialog.showModal();
        dialog.scrollTop = 0;
        openButton.focus({ preventScroll: true });
    }

    function showCard() {
        const { source, title, full } = cards[cardIndex];
        // Copy the catalogue design without its link, rail selection or rarity roll.
        const card = document.createElement('article');
        card.className = 'card art-in';
        for (const child of source.children) {
            if (!child.matches('.holo, .card-rarity')) card.append(child.cloneNode(true));
        }
        if (full) window.SiteCards.makeFullArt(card);
        const last = cardIndex === cards.length - 1;
        const action = last ? 'See all six cards' : 'Tap for next card';
        card.querySelector('.card-cta').textContent = action + ' →';
        advance.setAttribute('aria-label', action);
        stack.dataset.left = cards.length - cardIndex - 1;
        counter.replaceChildren(document.createTextNode('Card ' + (cardIndex + 1) + ' / ' + cards.length));
        const announcement = document.createElement('span');
        announcement.className = 'visually-hidden';
        announcement.textContent = ' — ' + title + (full ? ', Full Art' : '');
        counter.append(announcement);
        projectLink.href = source.href;
        projectLink.setAttribute('aria-label', 'Open project: ' + title);
        face.replaceChildren(card);
        if (full && !window.SiteTheme.motionOff()) sparkle();
    }

    function sparkle() {
        const halo = document.createElement('div');
        halo.className = 'pack-sparkles';
        halo.setAttribute('aria-hidden', 'true');
        // Distribute glints along the four edges so the project drawing stays clear.
        for (let i = 0; i < 16; i++) {
            const star = document.createElement('i');
            const side = i % 4;
            const offset = 7 + Math.floor(i / 4) * 25 + (side % 2) * 5;
            const x = [offset, 99, 100 - offset, 1][side];
            const y = [1, offset, 99, 100 - offset][side];
            star.style.left = x + '%';
            star.style.top = y + '%';
            star.style.setProperty('--dx', (x - 50) * .42 + 'px');
            star.style.setProperty('--dy', (y - 50) * .46 + 'px');
            star.style.setProperty('--delay', (i * 97 % 380) + 'ms');
            halo.append(star);
        }
        face.append(halo);
    }

    function rip() {
        if (sealed.hidden || wrapper.classList.contains('is-torn')) return;
        resetDrag(true);
        wrapper.classList.add('is-torn');
        const finish = () => {
            sealed.hidden = true;
            reveal.hidden = false;
            showCard();
            advance.focus({ preventScroll: true });
        };
        if (window.SiteTheme.motionOff()) finish();
        else openingTimer = setTimeout(finish, 360);
    }

    function showCollection() {
        for (const { source, title, full } of cards) {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = source.href;
            const thumb = document.createElement('i');
            const art = source.querySelector('.card-art').style;
            thumb.style.backgroundImage = (full && art.getPropertyValue('--art-full')) || art.getPropertyValue('--art');
            const label = document.createElement('span');
            label.textContent = title;
            if (full) {
                const rarity = document.createElement('small');
                rarity.textContent = 'Full Art';
                label.append(rarity);
            }
            link.append(thumb, label);
            item.append(link);
            list.append(item);
        }
        reveal.hidden = true;
        collection.hidden = false;
        list.querySelector('a').focus({ preventScroll: true });
        dialog.scrollTop = 0;
    }

    wrapper.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0 || wrapper.classList.contains('is-torn')) return;
        const bounds = wrapper.getBoundingClientRect();
        if (event.clientX > bounds.left + bounds.width * .4 || event.clientY > bounds.top + bounds.height * .35) return;
        drag = { id: event.pointerId, start: event.clientX, end: bounds.left + bounds.width * .87, shreds: 0 };
        wrapper.setPointerCapture(event.pointerId);
    });
    function trackTear(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const progress = Math.max(0, Math.min(1, (event.clientX - drag.start) / (drag.end - drag.start)));
        wrapper.style.setProperty('--tear', progress * 100 + '%');
        if (!window.SiteTheme.motionOff()) {
            wrapper.classList.toggle('is-tearing', progress > 0);
            wrapper.style.setProperty('--peel', progress * 3 + 'deg');
            // Emit by distance, so slow drags and fast swipes shed the same foil.
            while (drag.shreds < Math.floor(progress * 12)) {
                const number = ++drag.shreds;
                const shred = document.createElement('b');
                shred.className = 'pack-shred';
                shred.style.left = (number / 12 * 100) + '%';
                shred.style.setProperty('--dy', -(12 + number * 7 % 20) + 'px');
                wrapper.append(shred);
                shred.addEventListener('animationend', () => shred.remove(), { once: true });
            }
        }
        return progress >= 1;
    }
    wrapper.addEventListener('pointermove', trackTear);
    wrapper.addEventListener('pointerup', event => {
        if (event.pointerId !== drag?.id) return;
        if (trackTear(event)) rip();
        else resetDrag();
    });
    wrapper.addEventListener('lostpointercapture', event => {
        if (event.pointerId === drag?.id) resetDrag();
    });

    openButton.addEventListener('click', rip);
    function nextCard() {
        if (cardIndex === cards.length - 1) showCollection();
        else {
            cardIndex++;
            showCard();
        }
    }
    advance.addEventListener('click', nextCard);
    // Touch browsers can suppress the first compatibility click after a drag.
    // Handle a stationary tap directly, consuming its synthetic click once.
    let touchStart = null;
    advance.addEventListener('touchstart', event => {
        touchStart = event.touches.length === 1 ? event.touches[0] : null;
    }, { passive: true });
    advance.addEventListener('touchend', event => {
        const end = event.changedTouches[0];
        if (touchStart && end.identifier === touchStart.identifier && event.cancelable &&
            Math.hypot(end.clientX - touchStart.clientX, end.clientY - touchStart.clientY) < 12) {
            event.preventDefault();
            nextCard();
        }
        touchStart = null;
    });
    advance.addEventListener('touchcancel', () => { touchStart = null; });
    trigger.addEventListener('click', newPack);
    again.addEventListener('click', newPack);
    dialog.querySelector('.pack-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        clearTimeout(openingTimer);
        resetDrag();
        trigger.focus({ preventScroll: true });
    });
    trigger.hidden = false;
})();
