(function () {
    'use strict';
    var storageKey = 'card-workshop-v4';

    /* ── Settings ─────────────────────────────────────────────────────
       Each control sets one of the card settings in assets/css/cards.css
       ("Card settings" block). `def` must match the value there, in the
       control's own unit. Units: px values are written out as rem (÷16),
       like cards.css, so the cards keep growing with the reader's text. */
    var FONTS = [
        ['Space Grotesk', 'sans'], ['Inter', 'sans'], ['DM Sans', 'sans'], ['Manrope', 'sans'],
        ['IBM Plex Sans', 'sans'], ['Work Sans', 'sans'], ['Archivo', 'sans'], ['Archivo Narrow', 'sans'],
        ['Bricolage Grotesque', 'sans'], ['Syne', 'sans'],
        ['Fraunces', 'serif'], ['Newsreader', 'serif'], ['IBM Plex Serif', 'serif'],
        ['Cormorant Garamond', 'serif'], ['Instrument Serif', 'serif'], ['DM Serif Display', 'serif'],
        ['Cinzel', 'display'],
        ['Share Tech Mono', 'mono'], ['IBM Plex Mono', 'mono'], ['JetBrains Mono', 'mono'],
        ['Space Mono', 'mono'], ['DM Mono', 'mono'],
        ['Oswald', 'display'], ['Bebas Neue', 'display'], ['Anton', 'display']
    ];
    var FALLBACK = { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: "'Courier New', monospace", display: 'Impact, sans-serif' };
    // fonts the homepage already loads (index.html <head>)
    var HOMEPAGE_FONTS = ['Space Grotesk', 'Share Tech Mono', 'Cormorant Garamond', 'Cinzel', 'Newsreader'];
    var CATEGORY = { sans: 'Sans serif', serif: 'Serif', mono: 'Monospace', display: 'Display' };
    function fontCss(name) {
        var f = FONTS.filter(function (x) { return x[0] === name; })[0] || FONTS[0];
        return "'" + f[0] + "', " + FALLBACK[f[1]];
    }
    var rem = function (v) { return +(v / 16).toFixed(4) + 'rem'; };
    var px = function (v) { return v + 'px'; };
    var em = function (v) { return v + 'em'; };
    var pct = function (v) { return v + '%'; };
    var num = function (v) { return String(v); };
    var font = function (v) { return fontCss(v); };
    var upper = function (v) { return v ? 'uppercase' : 'none'; };

    // [key, label, css variable, kind, default, min, max, step, shown unit, to-css]
    var GROUPS = [
        ['Shape', [
            ['width', 'Card width', '--card-base-w', 'range', 280, 220, 400, 1, 'px', rem],
            ['ratio', 'Height / width', '--card-ratio', 'range', 1.4, 1.1, 1.8, 0.01, '', num],
            ['radius', 'Corner radius', '--card-radius', 'range', 12, 0, 32, 1, 'px', px],
            ['border', 'Border width', '--card-border-w', 'range', 4, 0, 12, 1, 'px', px],
            ['padding', 'Frame inset', '--card-padding', 'range', 10, 0, 24, 1, 'px', rem],
            ['gap', 'Space between parts', '--card-gap', 'range', 7, 0, 20, 1, 'px', rem]
        ]],
        ['Artwork', [
            ['artRatio', 'Image shape (width / height)', '--card-art-ratio', 'range', 1.3, 0.8, 2, 0.01, '', num],
            ['artRadius', 'Image corners', '--card-art-radius', 'range', 5, 0, 24, 1, 'px', px]
        ]],
        ['Fonts', [
            ['titleFont', 'Title font', '--card-title-font', 'font', 'Cormorant Garamond', 0, 0, 0, '', font],
            ['bodyFont', 'Description font', '--card-body-font', 'font', 'Newsreader', 0, 0, 0, '', font],
            ['labelFont', 'Card type and footer font', '--card-label-font', 'font', 'Cinzel', 0, 0, 0, '', font]
        ]],
        ['Title', [
            ['titleSize', 'Size', '--card-title-size', 'range', 17, 10, 28, 0.5, 'px', rem],
            ['titleWeight', 'Weight', '--card-title-weight', 'range', 600, 300, 800, 100, '', num],
            ['titleTracking', 'Letter spacing', '--card-title-tracking', 'range', 0.01, -0.06, 0.2, 0.005, 'em', em],
            ['titleCase', 'All capitals', '--card-title-case', 'toggle', false, 0, 0, 0, '', upper],
            ['titlePadY', 'Title block height (space above and below)', '--card-title-pad-y', 'range', 2.4, 0, 14, 0.2, 'px', rem],
            ['titleLines', 'Title block reserves this many lines', '--card-title-lines', 'range', 1, 1, 2, 1, '', num]
        ]],
        ['Description', [
            ['descSize', 'Size', '--card-desc-size', 'range', 13.5, 9, 20, 0.25, 'px', rem],
            ['descLeading', 'Line spacing', '--card-desc-leading', 'range', 1.45, 1.05, 1.9, 0.05, '', num]
        ]],
        ['Card type and footer', [
            ['labelSize', 'Size', '--card-label-size', 'range', 10.5, 8, 16, 0.25, 'px', rem],
            ['labelTracking', 'Letter spacing', '--card-label-tracking', 'range', 0.1, -0.02, 0.25, 0.01, 'em', em],
            ['labelCase', 'All capitals', '--card-label-case', 'toggle', true, 0, 0, 0, '', upper]
        ]],
        ['Color blocks', [
            ['blockAlpha', 'Opacity (0 hides them)', '--card-block-alpha', 'range', 0.65, 0, 1, 0.05, '', num],
            ['blockStep', 'Contrast with the card', '--card-block-step', 'range', 16, 0, 30, 1, '%', pct],
            ['blockTint', 'Theme color strength', '--card-block-tint', 'range', 0.2, 0, 0.8, 0.02, '', num],
            ['blockRadius', 'Corners', '--card-block-radius', 'range', 3, 0, 16, 1, 'px', px],
            ['blockPad', 'Padding', '--card-block-pad', 'range', 8, 0, 16, 1, 'px', rem]
        ]],
        ['Full art', [
            ['faScrim', 'Shadow fade darkness', '--fa-scrim', 'range', 0.8, 0, 1, 0.05, '', num],
            ['faReach', 'Shadow fade height', '--fa-scrim-reach', 'range', 52, 15, 100, 1, '%', pct],
            ['faPanel', 'Solid panel behind text', '--fa-panel-alpha', 'range', 0.3, 0, 1, 0.05, '', num],
            ['faTitle', 'Title block darkness', '--fa-title-alpha', 'range', 0.7, 0, 1, 0.05, '', num],
            ['faShadow', 'Text shadow', '--fa-text-shadow', 'range', 1, 0, 1, 0.05, '', num],
            ['holo', 'Holo shine', '--card-holo', 'range', 0.75, 0, 1, 0.05, '', num]
        ]]
    ];
    var CONTROLS = [];
    GROUPS.forEach(function (g) {
        g[1].forEach(function (c) {
            CONTROLS.push({ key: c[0], label: c[1], prop: c[2], kind: c[3], def: c[4], min: c[5], max: c[6],
                step: c[7], unit: c[8], css: c[9], group: g[0] });
        });
    });
    function defaults() {
        var v = {};
        CONTROLS.forEach(function (c) { v[c.key] = c.def; });
        return v;
    }

    /* ── Starting designs ─────────────────────────────────────────────
       The homepage design is Storybook gilt (cards.css, data-card-style
       "gilt"). The others are skins (frame styling in workshop.css,
       [data-skin]) built on the plain card style, with slider values on top
       of PLAIN. All are 5:7. They borrow genre conventions, not any game's
       art, logos or names. */
    var PLAIN = { border: 5, radius: 10, padding: 10, gap: 8, artRatio: 1.38, artRadius: 5,
        titleFont: 'Fraunces', bodyFont: 'Newsreader', labelFont: 'Fraunces',
        titleSize: 15, titleWeight: 300, titleTracking: 0.04, titlePadY: 4.8,
        descSize: 14, labelSize: 12.75, labelTracking: 0.02, labelCase: false,
        blockRadius: 5, blockPad: 4 };
    var PRESETS = [
        { id: '', name: 'Storybook gilt (homepage)', note: 'The homepage design: art runs to the top edge, an ink banner title overlaps it, gold hairlines on a dark ink card.', values: {} },
        { id: 'arcane', name: 'Arcane frame', note: 'Classic fantasy TCG: dark border, painted frame in your theme color, parchment title and type bars, and a parchment text box.',
            values: { border: 6, radius: 12, padding: 9, gap: 6, artRatio: 1.36, artRadius: 1,
                titleFont: 'Cinzel', titleWeight: 700, titleSize: 14, titleTracking: 0.02, titlePadY: 3.4,
                bodyFont: 'Newsreader', descSize: 13.5, labelFont: 'Cinzel', labelSize: 11, labelTracking: 0.02,
                blockRadius: 7, blockPad: 7 } },
        { id: 'bright', name: 'Bright border', note: 'Creature-collecting TCG: thick gold border, light tinted card, bold title, bevelled art frame, and a gold info strip.',
            values: { border: 9, radius: 14, padding: 9, gap: 6, artRatio: 1.42, artRadius: 1,
                titleFont: 'Archivo', titleWeight: 700, titleSize: 17, titleTracking: -0.01, titlePadY: 1,
                bodyFont: 'DM Sans', descSize: 13.25, descLeading: 1.4, labelFont: 'Archivo Narrow', labelSize: 11.5, labelTracking: 0.02,
                blockPad: 4, holo: 0.6 } },
        { id: 'monolith', name: 'Monolith', note: 'Duelling-monster TCG: textured bronze card, bevelled name plate, squarer bevelled art, and one beige text box with the [ type ] on top.',
            values: { border: 4, radius: 4, padding: 9, gap: 7, artRatio: 1.24, artRadius: 0,
                titleFont: 'Cinzel', titleWeight: 600, titleSize: 13.5, titleTracking: 0.03, titleCase: true, titlePadY: 3.4,
                bodyFont: 'IBM Plex Serif', descSize: 12.25, descLeading: 1.4, labelFont: 'IBM Plex Serif', labelSize: 11.25, labelTracking: 0,
                blockPad: 6 } },
        { id: 'ballpark', name: 'Ballpark', note: 'Vintage sports card: cream border, tall photo, slanted name banner in your theme color, a numbered badge, and plain printed text.',
            values: { border: 9, radius: 6, padding: 9, gap: 6, artRatio: 1.2, artRadius: 0,
                titleFont: 'Oswald', titleWeight: 600, titleSize: 16, titleTracking: 0.03, titleCase: true, titlePadY: 3,
                bodyFont: 'Work Sans', descSize: 12.5, descLeading: 1.4, labelFont: 'Oswald', labelSize: 11.5, labelTracking: 0.06, labelCase: true,
                blockPad: 0, holo: 0.5 } }
    ];
    function presetById(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || PRESETS[0]; }
    function presetValues(p) {
        var v = defaults();
        var merge = function (o) { Object.keys(o).forEach(function (k) { v[k] = o[k]; }); };
        if (p.id) merge(PLAIN);
        merge(p.values);
        return v;
    }
    // the homepage card style for a design: gilt for the homepage, none for skins
    function cardStyle(el, id) {
        if (id) { el.setAttribute('data-skin', id); el.removeAttribute('data-card-style'); }
        else { el.setAttribute('data-card-style', 'gilt'); el.removeAttribute('data-skin'); }
    }

    /* ── Sample cards ─────────────────────────────────────────────────
       Read from the homepage, so the fit check covers every real card.
       Opened straight from disk (no server) the fetch fails, and three
       built-in samples stand in. */
    var BUILT_IN = [
        ['The Palace of All Trades', 'A building designed to celebrate the labor of construction and the people who perform it.', 'Building — Trades & learning', '001', 'palace'],
        ['Dirt Politics', 'A houseplant, a 3D scan, and a strange new creature. Keeping the plant alive was part of the grade.', 'Sculpture — Scan & 3D print', '005', 'dirtpolitics'],
        ['The Last Archive', 'A New York media archive and public park with a responsive algae facade.', 'Building — Archive & park', '007', 'media_museum']
    ].map(function (s) {
        var base = new URL('../../assets/images/cards/', location.href).href;
        return { id: 'projects/' + s[4], title: s[0], description: s[1], typeLabel: s[2], index: s[3],
            art: base + s[4] + '_reg.jpg', artFull: base + s[4] + '_full.jpg' };
    });

    function loadHomepageCards() {
        var home = new URL('../../index.html', location.href);
        return fetch(home.href).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        }).then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var list = [];
            doc.querySelectorAll('.card-rail .card').forEach(function (card, i) {
                var art = card.querySelector('.card-art');
                var style = art ? art.getAttribute('style') || '' : '';
                var pick = function (prop) {
                    var m = style.match(new RegExp(prop + '\\s*:\\s*url\\(\\s*([\'"]?)(.*?)\\1\\s*\\)'));
                    return m ? new URL(m[2], home).href : '';
                };
                var text = function (sel) { var el = card.querySelector(sel); return el ? el.textContent.trim() : ''; };
                list.push({ id: card.getAttribute('href') || 'card-' + i, title: text('.card-title'),
                    description: text('.card-desc'), typeLabel: text('.card-type-label'), index: text('.card-index'),
                    art: pick('--art'), artFull: pick('--art-full') || pick('--art') });
            });
            if (!list.length) throw new Error('no cards');
            return list;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var stage = document.getElementById('stage');
        var previews = Array.prototype.slice.call(stage.querySelectorAll('.card'));
        var samples = BUILT_IN;
        var fromHomepage = false;
        var state = { values: defaults(), skin: '', sample: samples[0].id, edits: {}, guides: false };
        var homeScale = null;
        var variantRow = document.getElementById('variants');

        try {
            var saved = JSON.parse(localStorage.getItem(storageKey));
            if (saved && typeof saved === 'object') {
                CONTROLS.forEach(function (c) {
                    var v = saved.values && saved.values[c.key];
                    if (c.kind === 'range' && typeof v === 'number' && isFinite(v)) state.values[c.key] = Math.max(c.min, Math.min(c.max, v));
                    if (c.kind === 'toggle' && typeof v === 'boolean') state.values[c.key] = v;
                    if (c.kind === 'font' && FONTS.some(function (f) { return f[0] === v; })) state.values[c.key] = v;
                });
                if (typeof saved.sample === 'string') state.sample = saved.sample;
                if (saved.edits && typeof saved.edits === 'object') {
                    Object.keys(saved.edits).forEach(function (id) {
                        var e = saved.edits[id], clean = {};
                        ['title', 'description', 'typeLabel'].forEach(function (k) {
                            if (e && typeof e[k] === 'string') clean[k] = e[k].slice(0, k === 'description' ? 600 : 160);
                        });
                        state.edits[id] = clean;
                    });
                }
                state.guides = saved.guides === true;
                if (typeof saved.skin === 'string' && PRESETS.some(function (p) { return p.id === saved.skin; })) state.skin = saved.skin;
            }
        } catch (e) { /* A draft is optional when storage is unavailable. */ }

        /* ── Build the controls ───────────────────────────────────── */
        var groupsEl = document.getElementById('groups');
        GROUPS.forEach(function (g, gi) {
            var det = document.createElement('details');
            det.className = 'group';
            if (gi < 3) det.open = true;
            var sum = document.createElement('summary');
            sum.textContent = g[0];
            var body = document.createElement('div');
            body.className = 'group-body';
            det.append(sum, body);
            CONTROLS.filter(function (c) { return c.group === g[0]; }).forEach(function (c) {
                var id = 'ctl-' + c.key;
                var label = document.createElement('label');
                var input;
                if (c.kind === 'toggle') {
                    label.className = 'check';
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = id;
                    input.addEventListener('change', function () { state.values[c.key] = input.checked; render(); });
                    label.append(input, document.createTextNode(' ' + c.label));
                    body.append(label);
                    return;
                }
                label.htmlFor = id;
                label.textContent = c.label;
                if (c.kind === 'font') {
                    input = document.createElement('select');
                    input.id = id;
                    Object.keys(CATEGORY).forEach(function (cat) {
                        var og = document.createElement('optgroup');
                        og.label = CATEGORY[cat];
                        FONTS.filter(function (f) { return f[1] === cat; }).forEach(function (f) {
                            var o = document.createElement('option');
                            o.value = f[0]; o.textContent = f[0];
                            o.style.fontFamily = fontCss(f[0]);
                            og.appendChild(o);
                        });
                        input.appendChild(og);
                    });
                    input.addEventListener('change', function () { state.values[c.key] = input.value; render(); });
                    body.append(label, input);
                    return;
                }
                var out = document.createElement('output');
                out.id = id + '-value';
                out.htmlFor = id;
                label.appendChild(out);
                input = document.createElement('input');
                input.type = 'range'; input.id = id;
                input.min = c.min; input.max = c.max; input.step = c.step;
                input.addEventListener('input', function () { state.values[c.key] = Number(input.value); render(); });
                body.append(label, input);
            });
            groupsEl.appendChild(det);
        });

        /* ── Samples ──────────────────────────────────────────────── */
        var sampleSelect = document.getElementById('sample');
        function fillSamples() {
            sampleSelect.innerHTML = '';
            samples.forEach(function (s) {
                var o = document.createElement('option');
                o.value = s.id; o.textContent = s.title;
                sampleSelect.appendChild(o);
            });
            if (!samples.some(function (s) { return s.id === state.sample; })) state.sample = samples[0].id;
        }
        function sampleById(id) { return samples.filter(function (s) { return s.id === id; })[0] || samples[0]; }
        function textOf(s) {
            var e = state.edits[s.id] || {};
            return { title: e.title != null ? e.title : s.title, description: e.description != null ? e.description : s.description,
                typeLabel: e.typeLabel != null ? e.typeLabel : s.typeLabel };
        }
        function fillCard(card, s) {
            var t = textOf(s);
            card.querySelector('.card-title').textContent = t.title;
            card.querySelector('.card-desc').textContent = t.description;
            card.querySelector('.card-type-label').textContent = t.typeLabel;
            card.querySelector('.card-index').textContent = s.index || '001';
            var art = card.querySelector('.card-art');
            art.style.setProperty('--art', 'url("' + s.art + '")');
            art.style.setProperty('--art-full', 'url("' + (s.artFull || s.art) + '")');
        }

        /* ── Render ───────────────────────────────────────────────── */
        function display(c, v) {
            if (c.kind === 'toggle') return v ? 'on' : 'off';
            if (c.kind === 'font') return v;
            return v + c.unit;
        }
        function render() {
            CONTROLS.forEach(function (c) {
                var v = state.values[c.key];
                var input = document.getElementById('ctl-' + c.key);
                if (c.kind === 'toggle') input.checked = v;
                else input.value = v;
                var out = document.getElementById('ctl-' + c.key + '-value');
                if (out) out.textContent = display(c, v);
                stage.style.setProperty(c.prop, c.css(v));
            });
            var s = sampleById(state.sample);
            var t = textOf(s);
            sampleSelect.value = s.id;
            document.getElementById('title').value = t.title;
            document.getElementById('description').value = t.description;
            document.getElementById('typeLabel').value = t.typeLabel;
            document.getElementById('guides').checked = state.guides;
            stage.classList.toggle('guides', state.guides);
            cardStyle(stage, state.skin);
            variantRow.querySelectorAll('button[data-preset]').forEach(function (b) {
                b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === state.skin));
            });
            previews.forEach(function (card) { fillCard(card, s); });
            var w = state.values.width;
            document.querySelectorAll('.dimensions').forEach(function (el) {
                el.textContent = w + ' × ' + Math.round(w * state.values.ratio);
            });
            try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (e) { /* Preview still works. */ }
            scheduleFit();
            writeSettings();
        }

        /* ── Fit check ────────────────────────────────────────────────
           The homepage shrinks the text on every card by the same amount
           until the longest card fits. Do the same here across all the
           sample cards and show the previews at that size. */
        var fitTimer;
        function scheduleFit() {
            clearTimeout(fitTimer);
            fitTimer = setTimeout(checkFit, 120);
        }
        function checkFit() {
            var fitter = window.SiteCards;
            var status = document.getElementById('fit-status');
            if (!fitter) { status.textContent = ''; return; }
            var worst = null;
            homeScale = { scale: 1, fits: true };
            samples.forEach(function (s) {
                var card = previews[0].cloneNode(true);
                card.removeAttribute('data-variant');
                fillCard(card, s);
                var r = fitter.fitScale([card], stage);
                if (!r.fits && homeScale.fits) { homeScale.fits = false; worst = s; }
                if (r.scale < homeScale.scale) {
                    homeScale.scale = r.scale;
                    if (homeScale.fits) worst = s;
                }
            });
            stage.style.setProperty('--card-text', homeScale.scale);
            var scope = fromHomepage ? 'all ' + samples.length + ' homepage cards' : 'the ' + samples.length + ' sample cards (open this page through the site to check every homepage card)';
            var pctText = Math.round(homeScale.scale * 100) + '%';
            if (!homeScale.fits) {
                status.textContent = 'Some text doesn\'t fit even at ' + pctText + ' size' + (worst ? ' (' + textOf(worst).title + ')' : '') +
                    '. On the homepage those cards would grow taller. Try more height, smaller text, or less padding. Checked against ' + scope + '.';
            } else if (homeScale.scale < 1) {
                status.textContent = 'Card text shows at ' + pctText + ' size, because some cards (like "' + textOf(worst).title +
                    '") need it to fit. Every card on the homepage uses the same size. Checked against ' + scope + '.';
            } else {
                status.textContent = 'All text fits at full size. Checked against ' + scope + '.';
            }
            writeSettings();
        }

        /* ── Settings to send back ────────────────────────────────── */
        function writeSettings() {
            var lines = ['Card workshop settings', ''];
            if (state.skin) {
                var p = presetById(state.skin);
                lines.push('Starting design: ' + p.name + ' (skin "' + p.id + '", frame styles in experiments/cards/workshop.css)');
                var tweaks = CONTROLS.filter(function (c) { return state.values[c.key] !== presetValues(p)[c.key]; });
                lines.push(tweaks.length ? 'Adjusted from that design: ' + tweaks.map(function (c) { return c.group + ' ' + c.label.toLowerCase(); }).join(', ') : 'No adjustments to that design.', '');
            }
            var changed = CONTROLS.filter(function (c) { return state.values[c.key] !== c.def; });
            if (changed.length) {
                lines.push('Changed from the homepage:');
                var group = null;
                changed.forEach(function (c) {
                    if (c.group !== group) { group = c.group; lines.push('  ' + group); }
                    lines.push('    ' + c.label + ': ' + display(c, c.def) + ' → ' + display(c, state.values[c.key]));
                });
                lines.push('', 'CSS (replaces these lines in the "Card settings" block of assets/css/cards.css):', ':root {');
                changed.forEach(function (c) { lines.push('    ' + c.prop + ': ' + c.css(state.values[c.key]) + ';'); });
                lines.push('}');
                var fonts = CONTROLS.filter(function (c) { return c.kind === 'font' && state.values[c.key] !== c.def; })
                    .map(function (c) { return state.values[c.key]; })
                    .filter(function (f, i, a) { return a.indexOf(f) === i && HOMEPAGE_FONTS.indexOf(f) < 0; });
                if (fonts.length) lines.push('', 'Fonts to add to the homepage: ' + fonts.join(', '));
            } else {
                lines.push('Layout: no changes from the homepage.');
            }
            var textChanges = [];
            samples.forEach(function (s) {
                var e = state.edits[s.id];
                if (!e) return;
                var t = textOf(s);
                var parts = [];
                if (t.title !== s.title) parts.push('    title: "' + t.title + '"');
                if (t.typeLabel !== s.typeLabel) parts.push('    card type: "' + t.typeLabel + '"');
                if (t.description !== s.description) parts.push('    description: "' + t.description + '"');
                if (parts.length) textChanges.push('  ' + s.title + ' (' + s.id + ')', parts.join('\n'));
            });
            if (textChanges.length) lines.push('', 'Text changes:', textChanges.join('\n'));
            if (homeScale) {
                lines.push('', 'Homepage text size with these settings: ' + Math.round(homeScale.scale * 100) + '%' +
                    (homeScale.fits ? '' : ' (some cards still overflow)') + (fromHomepage ? '' : ' (sample cards only)'));
            }
            document.getElementById('settings').value = lines.join('\n');
            document.getElementById('copy-status').textContent = '';
        }

        /* ── Events ───────────────────────────────────────────────── */
        document.getElementById('controls').addEventListener('submit', function (e) { e.preventDefault(); });
        ['title', 'description', 'typeLabel'].forEach(function (id) {
            document.getElementById(id).addEventListener('input', function (e) {
                var edits = state.edits[state.sample] || (state.edits[state.sample] = {});
                edits[id] = e.target.value;
                render();
            });
        });
        sampleSelect.addEventListener('change', function (e) { state.sample = e.target.value; render(); });
        document.getElementById('guides').addEventListener('change', function (e) { state.guides = e.target.checked; render(); });
        document.getElementById('reset').addEventListener('click', function () {
            state = { values: defaults(), skin: '', sample: state.sample, edits: {}, guides: false };
            render();
        });

        /* ── Starting designs gallery ─────────────────────────────────
           One card per design, drawn with the current sample text. Picking
           one loads its skin and slider values into the editor. */
        function usePreset(id) {
            var p = presetById(id);
            state.skin = p.id;
            state.values = presetValues(p);
            render();
            document.getElementById('stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function buildGallery() {
            variantRow.innerHTML = '';
            var s = sampleById(state.sample);
            PRESETS.forEach(function (p) {
                var fig = document.createElement('figure');
                fig.className = 'variant';
                var wrap = document.createElement('div');
                wrap.className = 'variant-stage';
                cardStyle(wrap, p.id);
                var v = presetValues(p);
                CONTROLS.forEach(function (c) { wrap.style.setProperty(c.prop, c.css(v[c.key])); });
                var card = previews[0].cloneNode(true);
                card.removeAttribute('aria-label');
                card.classList.remove('is-active');
                card.setAttribute('aria-hidden', 'true');
                fillCard(card, s);
                wrap.appendChild(card);
                wrap.addEventListener('click', function () { usePreset(p.id); });
                var cap = document.createElement('figcaption');
                var name = document.createElement('span');
                name.className = 'variant-name'; name.textContent = p.name;
                var note = document.createElement('span');
                note.className = 'variant-note'; note.textContent = p.note;
                cap.append(name, note);
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.setAttribute('data-preset', p.id);
                btn.setAttribute('aria-pressed', String(p.id === state.skin));
                btn.textContent = p.id ? 'Start from this design' : 'Back to the homepage design';
                btn.addEventListener('click', function () { usePreset(p.id); });
                fig.append(wrap, cap, btn);
                variantRow.appendChild(fig);
                if (window.SiteCards) wrap.style.setProperty('--card-text', window.SiteCards.fitScale([card], wrap).scale);
            });
        }
        sampleSelect.addEventListener('change', buildGallery);
        document.getElementById('copy').addEventListener('click', function () {
            var field = document.getElementById('settings');
            var done = function () { document.getElementById('copy-status').textContent = 'Copied.'; };
            var fallback = function () {
                field.focus(); field.select();
                document.getElementById('copy-status').textContent = 'Settings selected. Copy this text to share it.';
            };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(field.value).then(done, fallback);
            else fallback();
        });

        // ?design=arcane opens straight into a starting design
        var asked = new URLSearchParams(location.search).get('design');
        if (asked && PRESETS.some(function (p) { return p.id === asked; })) {
            state.skin = asked;
            state.values = presetValues(presetById(asked));
        }

        fillSamples();
        render();
        buildGallery();
        if (document.fonts) document.fonts.ready.then(function () { scheduleFit(); buildGallery(); });
        loadHomepageCards().then(function (list) {
            samples = list;
            fromHomepage = true;
            fillSamples();
            render();
            buildGallery();
        }, function () { /* built-in samples stay */ });
    });
})();
