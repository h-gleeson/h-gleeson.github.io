(function () {
    'use strict';

    /* ── The palettes ─────────────────────────────────────────────────
       Each palette has a dark and a light mode. Roles:
         bg        page background (≈60%)
         panel     raised surfaces (sidebar boxes, inputs)
         border    hairlines;  borderMid  outlines (3:1 against the page)
         bright    headings and names;  text  body copy
         dim       secondary copy;  label  mono labels and metadata
         accent    fill tone (buttons, highlights)
         accentText  the accent as text: links, the surname, active labels
         onAccent  text on an accent fill
       frame: what the card frame is drawn in, per mode:
         'accent' the accent fill, 'ink' the heading colour,
         'neutral' the secondary grey, 'support' the palette's support colour.
       eye: true for the palette driven by the "find your blue" picker. */
    var PALETTES = [
        {
            id: 'eye', name: 'Swiss Pale Blue', principle: 'Achromatic + one signal color · your blue', isNew: true, eye: true,
            why: ['Swiss Signal Red\'s structure, true neutrals and one colour used only where it means something, with the red swapped for the pale grey-blue of your eyes.',
                'Pale colours can\'t carry text on a light page, so the blue does two jobs: as itself, it\'s the button fill, highlights and card frame in dark mode; as text, the same hue is taken darker until it reads at 4.5:1 or better. Pick your blue below and both modes update.'],
            frame: { dark: 'accent', light: 'ink' },
            dark: { bg: '#0A0A0A', panel: '#141414', border: '#262626', borderMid: '#606060', bright: '#FFFFFF', text: '#CFCFCF', dim: '#A6A6A6', label: '#9E9E9E' },
            light: { bg: '#FAFAFA', panel: '#EFEFEF', border: '#D9D9D9', borderMid: '#8E8E8E', bright: '#0A0A0A', text: '#333333', dim: '#555555', label: '#595959' }
        },
        {
            id: 'swiss', name: 'Swiss Signal Red', principle: 'Achromatic + one signal color',
            why: ['From the International Typographic Style: true neutrals (no tint at all) and one pure signal red, used sparingly and only where it means something.',
                'The cards follow the page now: a quiet grey frame in dark mode and a thin black printed frame in light mode, so nothing competes with the red.'],
            frame: { dark: 'neutral', light: 'ink' },
            dark: { bg: '#0A0A0A', panel: '#141414', border: '#262626', borderMid: '#606060', bright: '#FFFFFF', text: '#CFCFCF', dim: '#A6A6A6', label: '#9E9E9E', accent: '#FF3B30', accentText: '#FF5B52', onAccent: '#0A0A0A' },
            light: { bg: '#FAFAFA', panel: '#EFEFEF', border: '#D9D9D9', borderMid: '#8E8E8E', bright: '#0A0A0A', text: '#333333', dim: '#555555', label: '#595959', accent: '#D7261E', accentText: '#C21F18', onAccent: '#FFFFFF' }
        },
        {
            id: 'nonphoto', name: 'Non-Photo Blue on Trace', principle: 'Studio materials · graphite, trace, pencil', isNew: true,
            why: ['The colours on a drafting desk: yellowed trace paper, graphite, and a non-photo blue pencil, the pale blue architects sketch guidelines in because photocopiers didn\'t pick it up.',
                'It\'s another pale blue, but warmer and greener than a sky blue, and sitting on cream rather than white. Text is graphite, never pure black, and the card frame is drawn in the pencil blue like a construction line.'],
            frame: { dark: 'accent', light: 'accent' },
            dark: { bg: '#121314', panel: '#1A1C1E', border: '#2A2D30', borderMid: '#616569', bright: '#ECEAE2', text: '#C4C1B6', dim: '#9E9B91', label: '#96938A', accent: '#8FCBE0', accentText: '#8FCBE0', onAccent: '#0D1418' },
            light: { bg: '#F1EDDC', panel: '#E7E2CD', border: '#D3CDB4', borderMid: '#8C8771', bright: '#232323', text: '#3E3D39', dim: '#5B5952', label: '#5E5C55', accent: '#9FD3E6', accentText: '#1E6680', onAccent: '#1E1E1E' }
        },
        {
            id: 'diazo', name: 'Diazo Print', principle: 'Monochrome print process · positive and negative', isNew: true,
            why: ['Before plotters, drawings were copied as diazo whiteprints (violet-blue lines on cream) or as blueprints (white lines on deep blue). Light mode is the whiteprint, dark mode is the blueprint: the same drawing, reversed.',
                'Headings are set in the diazo ink colour instead of black, which is what makes it feel printed. In dark mode the card frame is a white line, like a blueprint\'s.'],
            frame: { dark: 'ink', light: 'accent' },
            dark: { bg: '#10152B', panel: '#161C36', border: '#252C4B', borderMid: '#5D6585', bright: '#EEF0F8', text: '#C3C8DE', dim: '#9DA3BE', label: '#959BB6', accent: '#9AA6F0', accentText: '#A9B3F5', onAccent: '#0D1127' },
            light: { bg: '#F1EEE4', panel: '#E6E1D3', border: '#D2CBB9', borderMid: '#8B8679', bright: '#1F2342', text: '#3A3E5C', dim: '#565A76', label: '#5A5D78', accent: '#4C5BB4', accentText: '#3F4DA3', onAccent: '#FFFFFF' }
        },
        {
            id: 'modelshop', name: 'Model Shop', principle: 'Studio materials · board, chipboard, cutting mat', isNew: true,
            why: ['The model-making bench: white museum board, grey-brown chipboard and the green of a self-healing cutting mat. Chipboard becomes the card frame, the way a model sits on its base.',
                'Green is an unusual accent for a portfolio, but this one is muted and specific rather than "nature green", and the warm board neutrals keep it from going cold.'],
            support: '#A8977A',
            frame: { dark: 'support', light: 'support' },
            dark: { bg: '#101412', panel: '#171C19', border: '#26302B', borderMid: '#5D6762', bright: '#EDEEE8', text: '#C2C6BC', dim: '#9CA197', label: '#949990', accent: '#5FA57F', accentText: '#7BBE98', onAccent: '#08110C' },
            light: { bg: '#F4F2EC', panel: '#E8E4DA', border: '#D4CEC0', borderMid: '#8E887C', bright: '#1B1E1B', text: '#3B3F3A', dim: '#575B55', label: '#5B5F58', accent: '#2F6B4F', accentText: '#2A6047', onAccent: '#FFFFFF' }
        },
        {
            id: 'vermilion', name: 'Drafting Vermilion', principle: 'One accent on warm neutrals · 60-30-10',
            why: ['The closest to the site today, made deliberate: one red-orange accent on neutrals tinted toward it, warm charcoal in dark mode and unbleached paper in light mode.',
                'The brass frame is gone; the cards now use the page\'s own warm grey in dark mode and a dark ink frame in light mode.'],
            frame: { dark: 'neutral', light: 'ink' },
            dark: { bg: '#12100E', panel: '#1A1714', border: '#2A2622', borderMid: '#67615A', bright: '#F2EDE6', text: '#C9C1B6', dim: '#A39A8E', label: '#998F83', accent: '#E8532A', accentText: '#FF7A50', onAccent: '#140C08' },
            light: { bg: '#F4F0E8', panel: '#EAE4D9', border: '#D6CEC0', borderMid: '#8F867A', bright: '#1A1612', text: '#3F3830', dim: '#5E554B', label: '#62584D', accent: '#C2410C', accentText: '#A8360A', onAccent: '#FFFFFF' }
        },
        {
            id: 'cobalt', name: 'Blueprint Cobalt', principle: 'Complementary · cool field, warm detail',
            why: ['Cobalt blue on cool blue-grey neutrals. Without the brass frame it becomes a single-hue scheme: the card frame is the cobalt itself.'],
            frame: { dark: 'accent', light: 'accent' },
            dark: { bg: '#0B0F17', panel: '#111724', border: '#1E2636', borderMid: '#59637A', bright: '#EAF0FA', text: '#B9C3D6', dim: '#93A0B8', label: '#8B98B0', accent: '#4C7DFF', accentText: '#8AABFF', onAccent: '#060A14' },
            light: { bg: '#F0F3F8', panel: '#E3E8F0', border: '#CBD3E0', borderMid: '#7F8A9F', bright: '#0D1424', text: '#33405A', dim: '#4F5B73', label: '#545F76', accent: '#2350D8', accentText: '#1E45BD', onAccent: '#FFFFFF' }
        },
        {
            id: 'terracotta', name: 'Terracotta & Sage', principle: 'Split-complementary · material palette',
            why: ['Terracotta brick for the accent, lime plaster and raw earth for the neutrals, and sage for the card frame. Split-complementary: terracotta plus a neighbour of its opposite.'],
            support: '#8FA58A',
            frame: { dark: 'support', light: 'support' },
            dark: { bg: '#141210', panel: '#1C1916', border: '#2C2723', borderMid: '#69625B', bright: '#F1EBE3', text: '#C8BFB3', dim: '#A2988B', label: '#988E81', accent: '#D2693F', accentText: '#E8865E', onAccent: '#160D08' },
            light: { bg: '#F3EDE4', panel: '#E8E0D3', border: '#D3C8B7', borderMid: '#908575', bright: '#1C1712', text: '#40372E', dim: '#5F5448', label: '#635749', accent: '#B4532B', accentText: '#9A4422', onAccent: '#FFFFFF' }
        },
        {
            id: 'verdigris', name: 'Verdigris & Copper', principle: 'Complementary · one material, two states',
            why: ['Patina teal and raw copper. Kept for comparison: the idea holds up, but a saturated teal with a glowing copper reads as "generated" because it\'s too perfectly balanced. Model Shop is a more grounded take on the same idea of a material plus its partner.'],
            support: '#C0763F',
            frame: { dark: 'support', light: 'support' },
            dark: { bg: '#0D1312', panel: '#131B1A', border: '#1F2B29', borderMid: '#556764', bright: '#E7F2EF', text: '#B5C7C2', dim: '#8FA49F', label: '#879C97', accent: '#2FB39A', accentText: '#4FD1B6', onAccent: '#04110E' },
            light: { bg: '#EEF3F1', panel: '#E1E9E6', border: '#C8D5D0', borderMid: '#7A8D88', bright: '#0C1A17', text: '#2F4540', dim: '#4A605A', label: '#4E635D', accent: '#137A66', accentText: '#0F6B59', onAccent: '#FFFFFF' }
        },
        {
            id: 'ultramarine', name: 'Ink & Ultramarine', principle: 'Monochromatic · one hue, many values',
            why: ['Every colour from one blue-violet hue at different values: near-black ink, lavender-grey text, ultramarine as the most saturated step, and the card frame in the accent.'],
            frame: { dark: 'accent', light: 'accent' },
            dark: { bg: '#0E0E16', panel: '#15151F', border: '#23233A', borderMid: '#5F5F79', bright: '#EEEEFA', text: '#BDBDD6', dim: '#9A9AB8', label: '#9292B0', accent: '#6B5CFF', accentText: '#A097FF', onAccent: '#FFFFFF' },
            light: { bg: '#F2F2F8', panel: '#E6E6F0', border: '#CFCFE0', borderMid: '#8787A3', bright: '#12121F', text: '#393952', dim: '#55556F', label: '#595973', accent: '#4B3BE0', accentText: '#4031C9', onAccent: '#FFFFFF' }
        }
    ];

    /* Pale blues for the picker: real eye colours are grey-blue, not sky blue. */
    var EYE_BLUES = [
        ['Ice', '#BFD5E3'], ['Glacier', '#A6C4DA'], ['Mist', '#AFC0CC'], ['Grey-blue', '#9DB0C1'],
        ['Steel', '#8FA8BD'], ['Slate', '#7F97AD'], ['Powder', '#B2CDE6'], ['Cornflower', '#9EB6DC'],
        ['Cerulean', '#90C0DA'], ['Aqua grey', '#A3C7CB']
    ];
    var EYE_KEY = 'palette-eye-blue';
    var eyeBlue = '#A6C4DA';
    try { var savedEye = localStorage.getItem(EYE_KEY); if (/^#[0-9a-f]{6}$/i.test(savedEye || '')) eyeBlue = savedEye; } catch (e) { /* optional */ }

    /* ── Colour maths ─────────────────────────────────────────────── */
    function rgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function lum(hex) {
        var c = rgb(hex).map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contrast(a, b) {
        var x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }
    function toHsl(hex) {
        var c = rgb(hex).map(function (v) { return v / 255; });
        var max = Math.max.apply(null, c), min = Math.min.apply(null, c), d = max - min;
        var h = 0, s = 0, l = (max + min) / 2;
        if (d) {
            s = d / (1 - Math.abs(2 * l - 1));
            if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
            else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
            else h = (c[0] - c[1]) / d + 4;
            h = (h * 60 + 360) % 360;
        }
        return { h: h, s: s * 100, l: l * 100 };
    }
    function fromHsl(h, s, l) {
        s /= 100; l /= 100;
        var k = function (n) { return (n + h / 30) % 12; };
        var a = s * Math.min(l, 1 - l);
        var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
        return '#' + [f(0), f(8), f(4)].map(function (v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }).join('').toUpperCase();
    }
    function mix(hex, other, t) {
        var a = rgb(hex), b = rgb(other);
        return '#' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0'); }).join('').toUpperCase();
    }
    function alpha(hex, a) { return 'rgba(' + rgb(hex).join(', ') + ', ' + a + ')'; }
    /* Same hue, lighter or darker until it reads at `target` on `surface`.
       Darkening also adds a little saturation so it doesn't go muddy. */
    function readable(hex, surface, target) {
        var c = toHsl(hex), dark = lum(surface) > 0.5, out = hex;
        for (var i = 0; i < 100 && contrast(out, surface) < target; i++) {
            c.l += dark ? -1 : 1;
            if (dark) c.s = Math.min(100, c.s + 0.6);
            out = fromHsl(c.h, c.s, Math.max(0, Math.min(100, c.l)));
        }
        return out.toUpperCase();
    }
    function onColour(fill) { return contrast('#FFFFFF', fill) >= contrast('#0A0A0A', fill) ? '#FFFFFF' : '#0A0A0A'; }

    /* Fill in the eye palette's accent tones from the chosen blue. */
    function applyEye(p) {
        ['dark', 'light'].forEach(function (mode) {
            var m = p[mode];
            m.accent = eyeBlue.toUpperCase();
            m.accentText = readable(eyeBlue, m.panel, 4.6);
            m.onAccent = onColour(eyeBlue);
        });
    }

    /* Card colours for one mode, so the cards belong to the palette. */
    function cardColours(p, m, mode) {
        var kind = p.frame[mode];
        var frame = kind === 'accent' ? m.accent : kind === 'ink' ? m.bright : kind === 'support' ? p.support : m.dim;
        var light = mode === 'light';
        var base = light ? mix(m.bg, '#FFFFFF', 0.45) : m.panel;
        var glow = light ? mix(base, '#FFFFFF', 0.6) : mix(m.panel, m.accent, 0.1);
        var plate = light ? mix(m.bg, '#FFFFFF', 0.75) : m.bg;
        return {
            base: base,
            vars: {
                '--card-frame': frame,
                '--card-bg': 'radial-gradient(120% 60% at 50% 0%, ' + glow + ', ' + base + ')',
                '--card-plate': alpha(plate, 0.95), '--card-plate-halo': alpha(plate, 0.6),
                '--card-title-ink': m.bright, '--card-desc-ink': m.text,
                '--card-accent-ink': m.accentText, '--card-foot-ink': m.label,
                '--card-hair': alpha(frame, 0.45)
            }
        };
    }

    /* Site tokens for one mode, as theme.css names them. */
    function tokens(p, m, mode) {
        var a = toHsl(m.accent);
        var t = {
            '--bg': m.bg, '--bg-panel': m.panel, '--border': m.border, '--border-mid': m.borderMid,
            '--text-bright': m.bright, '--text': m.text, '--text-dim': m.dim, '--text-label': m.label,
            '--accent': m.accent, '--orange': m.accentText, '--on-accent': m.onAccent,
            '--accent-dim': alpha(m.accent, 0.14), '--orange-dim': alpha(m.accent, 0.14),
            '--accent-soft': alpha(m.accent, 0.05), '--bg-hover': alpha(m.accent, 0.05),
            '--accent-h': Math.round(a.h), '--accent-s': Math.round(a.s) + '%', '--accent-l': Math.round(a.l) + '%'
        };
        var cc = cardColours(p, m, mode).vars;
        Object.keys(cc).forEach(function (k) { t[k] = cc[k]; });
        return t;
    }

    /* ── Build the page ───────────────────────────────────────────── */
    var CARDS = [
        { title: 'The Palace of All Trades', type: 'Building — Trades & learning', index: '001',
            desc: 'A building designed to celebrate the labor of construction.', art: 'palace', variant: 'regular' },
        { title: 'Dirt Politics', type: 'Sculpture — Scan & 3D print', index: '005',
            desc: 'A houseplant, a 3D scan, and a strange new creature.', art: 'dirtpolitics', variant: 'full' }
    ];
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function card(c) {
        var a = el('article', 'card');
        a.setAttribute('data-variant', c.variant);
        a.setAttribute('aria-label', c.title + ' card preview');
        var art = el('div', 'card-art');
        var base = new URL('../../assets/images/cards/', location.href).href;
        art.style.setProperty('--art', 'url("' + base + c.art + '_reg.jpg")');
        art.style.setProperty('--art-full', 'url("' + base + c.art + '_full.jpg")');
        var head = el('div', 'card-head');
        head.appendChild(el('h3', 'card-title', c.title));
        var type = el('div', 'card-type');
        type.append(el('span', 'card-type-label', c.type), el('span', 'card-index', c.index));
        var body = el('div', 'card-body');
        body.appendChild(el('p', 'card-desc', c.desc));
        var foot = el('div', 'card-foot');
        foot.append(el('span', null, 'PROJECT'), el('span', 'card-cta', 'OPEN →'));
        a.append(art, head, type, body, foot);
        if (c.variant === 'full') {
            a.classList.add('full-art');
            var holo = el('div', 'holo'); holo.setAttribute('aria-hidden', 'true');
            a.append(holo, el('span', 'card-rarity', 'Full Art'));
        } else {
            a.classList.add('is-active');
        }
        return a;
    }
    function preview(p, modeName) {
        var m = p[modeName];
        var pv = el('div', 'pv');
        pv.setAttribute('data-card-style', 'gilt');
        var t = tokens(p, m, modeName);
        Object.keys(t).forEach(function (k) { pv.style.setProperty(k, t[k]); });

        var top = el('div', 'pv-top');
        var nav = el('div', 'pv-nav');
        ['Projects', 'Play', 'About me'].forEach(function (n) { nav.appendChild(el('span', null, n)); });
        var mode = el('span', 'pv-mode');
        mode.append('MODE: ', el('b', null, modeName.toUpperCase()));
        top.append(nav, mode);

        var hero = el('div', 'pv-hero');
        var name = el('div', 'pv-name', 'Henry');
        name.appendChild(el('span', null, 'Gleeson'));
        var intro = el('p', 'pv-intro', 'Architecture, drawings, and things to play with. ');
        var link = el('a', null, 'More about me'); link.href = '#' + p.id;
        intro.appendChild(link);
        hero.append(name, intro);

        var label = el('div', 'pv-label');
        label.append(el('b', null, '01'), ' / Buildings & drawings');

        var bodyRow = el('div', 'pv-body');
        var side = el('div', 'pv-side');
        side.append(el('div', 'pv-h', 'Projects'), el('p', 'pv-dim', 'Seven projects. Pick a card to take a closer look.'));
        var btns = el('div', 'pv-btns');
        btns.append(el('span', 'pv-btn primary', 'OPEN PROJECT'), el('span', 'pv-btn on', 'NEXT →'), el('span', 'pv-btn', 'VIEW ALL'));
        var panel = el('div', 'pv-panel');
        panel.append('Panels and sidebars sit one step above the page. ');
        var pl = el('a', null, 'A link in a panel'); pl.href = '#' + p.id;
        panel.appendChild(pl);
        side.append(btns, panel);
        var cards = el('div', 'pv-cards');
        CARDS.forEach(function (c) { cards.appendChild(card(c)); });
        bodyRow.append(side, cards);

        pv.append(top, hero, label, bodyRow, swatches(p, m, modeName), checks(p, m, modeName));
        return pv;
    }
    function swatches(p, m, mode) {
        var wrap = el('div', 'swatches');
        var frame = cardColours(p, m, mode).vars['--card-frame'];
        [['Background', m.bg], ['Panel', m.panel], ['Outline', m.borderMid], ['Heading', m.bright], ['Body text', m.text],
            ['Secondary', m.dim], ['Accent fill', m.accent], ['Accent text', m.accentText], ['Card frame', frame]].forEach(function (s) {
            var sw = el('div', 'sw');
            var i = el('i'); i.style.background = s[1];
            sw.append(i, el('span', null, s[0]), el('code', null, s[1].toUpperCase()));
            wrap.appendChild(sw);
        });
        return wrap;
    }
    function checks(p, m, mode) {
        var wrap = el('div', 'checks');
        var cardBase = cardColours(p, m, mode).base;
        [['Body text on page', m.text, m.bg, 4.5], ['Secondary on page', m.dim, m.bg, 4.5], ['Labels on panel', m.label, m.panel, 4.5],
            ['Accent text on page', m.accentText, m.bg, 4.5], ['Accent text on panel', m.accentText, m.panel, 4.5],
            ['Text on accent button', m.onAccent, m.accent, 4.5], ['Card type on card', m.accentText, cardBase, 4.5],
            ['Card text on card', m.text, cardBase, 4.5], ['Heading on page', m.bright, m.bg, 7], ['Outline vs page', m.borderMid, m.bg, 3]].forEach(function (c) {
            var r = contrast(c[1], c[2]);
            var row = el('div', 'check');
            var verdict = r >= 7 ? 'AAA' : r >= c[3] ? (c[3] === 3 ? 'UI ok' : 'AA') : 'low';
            row.append(el('span', null, c[0]), el('b', r < c[3] ? 'fail' : r >= 7 ? 'aaa' : '', r.toFixed(1) + ':1 ' + verdict));
            wrap.appendChild(row);
        });
        return wrap;
    }

    function fit(scope) {
        if (!window.SiteCards) return;
        scope.querySelectorAll('.pv-cards').forEach(function (row) {
            var r = window.SiteCards.fitScale(row.querySelectorAll('.card'), row.closest('.pv'));
            row.style.setProperty('--card-text', r.scale);
        });
    }

    /* The eye-blue picker: swatches, a colour input and a hex field. */
    function eyePicker(p, modesEl) {
        var box = el('div', 'eye');
        box.appendChild(el('h3', null, 'Find your blue'));
        box.appendChild(el('p', 'muted', 'Eye blues are greyer than sky blue. Start from a swatch, then fine-tune with the color picker or type a hex code. Hold a photo of your eye in daylight next to the screen to compare.'));
        var row = el('div', 'eye-row');
        var input = el('input'); input.type = 'color'; input.setAttribute('aria-label', 'Pick a blue');
        var hex = el('input', 'eye-hex'); hex.type = 'text'; hex.maxLength = 7; hex.setAttribute('aria-label', 'Hex code');
        var out = el('p', 'eye-out muted');
        out.setAttribute('role', 'status');
        function set(value) {
            if (!/^#[0-9a-f]{6}$/i.test(value)) return;
            eyeBlue = value.toUpperCase();
            try { localStorage.setItem(EYE_KEY, eyeBlue); } catch (e) { /* optional */ }
            applyEye(p);
            input.value = eyeBlue.toLowerCase();
            if (document.activeElement !== hex) hex.value = eyeBlue;
            row.querySelectorAll('.eye-sw').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.hex === eyeBlue)); });
            modesEl.innerHTML = '';
            modesEl.append(preview(p, 'dark'), preview(p, 'light'));
            fit(modesEl);
            out.textContent = 'Your blue ' + eyeBlue + ' · as text on light pages it becomes ' + p.light.accentText +
                ' (' + contrast(p.light.accentText, p.light.panel).toFixed(1) + ':1) · on dark pages ' + p.dark.accentText +
                ' (' + contrast(p.dark.accentText, p.dark.panel).toFixed(1) + ':1)';
        }
        EYE_BLUES.forEach(function (b) {
            var btn = el('button', 'eye-sw');
            btn.type = 'button';
            btn.dataset.hex = b[1];
            btn.title = b[0] + ' ' + b[1];
            var chip = el('i'); chip.style.background = b[1];
            btn.append(chip, el('span', null, b[0]));
            btn.addEventListener('click', function () { set(b[1]); });
            row.appendChild(btn);
        });
        input.addEventListener('input', function () { set(input.value); });
        hex.addEventListener('input', function () {
            var v = hex.value.trim();
            if (v[0] !== '#') v = '#' + v;
            set(v);
        });
        var tools = el('div', 'eye-tools');
        tools.append(input, hex);
        box.append(row, tools, out);
        return { box: box, set: set };
    }

    document.addEventListener('DOMContentLoaded', function () {
        var main = document.getElementById('palettes');
        var jump = document.getElementById('jump');
        PALETTES.forEach(function (p, i) {
            var num = String(i + 1).padStart(2, '0');
            var sec = el('section', 'palette');
            sec.id = p.id;
            var head = el('div', 'palette-head');
            var left = el('div');
            left.append(el('span', 'palette-num', num + (p.isNew ? ' · new' : '')), el('h2', null, p.name), el('span', 'principle', p.principle));
            var why = el('div', 'palette-why');
            p.why.forEach(function (t) { why.appendChild(el('p', null, t)); });
            head.append(left, why);
            var modes = el('div', 'modes');
            sec.appendChild(head);
            if (p.eye) {
                var picker = eyePicker(p, modes);
                sec.append(picker.box, modes);
                main.appendChild(sec);
                picker.set(eyeBlue);
            } else {
                modes.append(preview(p, 'dark'), preview(p, 'light'));
                sec.appendChild(modes);
                main.appendChild(sec);
            }
            var a = el('a', null, num + ' ' + p.name);
            a.href = '#' + p.id;
            jump.appendChild(a);
        });
        fit(main);
        if (document.fonts) document.fonts.ready.then(function () { fit(main); });
    });
})();
