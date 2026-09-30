(function () {
    'use strict';
    var storageKey = 'card-workshop-v1';
    var samples = {
        palace: ['The Palace of All Trades', 'A building designed to celebrate the labor of construction and the people who perform it.'],
        dirtpolitics: ['Dirt Politics', 'A houseplant, a 3D scan, and a strange new creature. Keeping the plant alive was part of the grade.'],
        media_museum: ['The Last Archive', 'A New York media archive and public park with a responsive algae facade.']
    };
    var fields = [
        ['width', 'Card width', 220, 400, 1, 'px'],
        ['ratio', 'Height / width', 1.2, 1.8, 0.01, ''],
        ['radius', 'Corner radius', 0, 32, 1, 'px'],
        ['art', 'Regular artwork height', 80, 240, 1, 'px'],
        ['padding', 'Frame inset', 0, 24, 1, 'px'],
        ['titleSize', 'Title size', 12, 24, 0.1, 'px'],
        ['textSize', 'Description size', 8, 20, 0.1, 'px']
    ];
    document.addEventListener('DOMContentLoaded', function () {
        var stage = document.getElementById('stage');
        var style = document.getElementById('draft-style');
        var regular = stage.querySelector('.card:not(.full-art)');
        var state;
        function defaults() {
            style.textContent = '';
            var css = getComputedStyle(regular);
            return {
                width: parseFloat(css.width), ratio: +(parseFloat(css.height) / parseFloat(css.width)).toFixed(2),
                radius: parseFloat(css.borderRadius), padding: parseFloat(css.paddingLeft),
                art: parseFloat(getComputedStyle(regular.querySelector('.card-art')).height),
                titleSize: parseFloat(getComputedStyle(regular.querySelector('.card-title')).fontSize),
                textSize: parseFloat(getComputedStyle(regular.querySelector('.card-desc')).fontSize),
                sample: 'palace', title: samples.palace[0], description: samples.palace[1], typeLabel: '[Card type]', guides: false
            };
        }
        state = defaults();
        try {
            var saved = JSON.parse(localStorage.getItem(storageKey));
            if (saved && samples[saved.sample]) {
                fields.forEach(function (f) {
                    if (typeof saved[f[0]] === 'number' && isFinite(saved[f[0]])) state[f[0]] = Math.max(f[2], Math.min(f[3], saved[f[0]]));
                });
                state.sample = saved.sample;
                if (typeof saved.title === 'string') state.title = saved.title.slice(0, 160);
                if (typeof saved.description === 'string') state.description = saved.description.slice(0, 600);
                if (typeof saved.typeLabel === 'string') state.typeLabel = saved.typeLabel.slice(0, 60);
                state.guides = saved.guides === true;
            }
        } catch (e) { /* A draft is optional when storage is unavailable. */ }
        fields.forEach(function (f) {
            var label = document.createElement('label');
            label.htmlFor = f[0]; label.textContent = f[1];
            var output = document.createElement('output');
            output.id = f[0] + '-value'; output.htmlFor = f[0]; label.appendChild(output);
            var input = document.createElement('input');
            input.type = 'range'; input.id = f[0]; input.min = f[2]; input.max = f[3]; input.step = f[4];
            input.addEventListener('input', function () { state[f[0]] = Number(input.value); render(); });
            document.getElementById('sliders').append(label, input);
        });
        function render() {
            fields.forEach(function (f) {
                document.getElementById(f[0]).value = state[f[0]];
                document.getElementById(f[0] + '-value').textContent = state[f[0]] + f[5];
            });
            document.getElementById('sample').value = state.sample;
            document.getElementById('title').value = state.title;
            document.getElementById('description').value = state.description;
            document.getElementById('typeLabel').value = state.typeLabel;
            document.getElementById('guides').checked = state.guides;
            stage.classList.toggle('guides', state.guides);
            style.textContent = '.preview-stage .card { --card-w:' + state.width + 'px; --card-radius:' + state.radius + 'px; --art-h:' + state.art + 'px; height:' + (state.width * state.ratio) + 'px; }' +
                '.preview-stage .card { --card-padding:' + state.padding + 'px; }' +
                '.preview-stage .card .card-title { font-size:' + state.titleSize + 'px; }' +
                '.preview-stage .card .card-desc { font-size:' + state.textSize + 'px; }';
            stage.querySelectorAll('.card').forEach(function (card) {
                card.querySelector('.card-title').textContent = state.title;
                card.querySelector('.card-desc').textContent = state.description;
                card.querySelector('.card-type-label').textContent = state.typeLabel;
                var art = card.querySelector('.card-art');
                ['reg', 'full'].forEach(function (variant) {
                    var url = new URL('../../assets/images/cards/' + state.sample + '_' + variant + '.png', location.href);
                    art.style.setProperty(variant === 'reg' ? '--art' : '--art-full', 'url("' + url.href + '")');
                });
            });
            document.querySelectorAll('.dimensions').forEach(function (el) { el.textContent = state.width + ' × ' + Math.round(state.width * state.ratio); });
            document.getElementById('settings').value = 'Card workshop draft\n' + JSON.stringify(state, null, 2);
            document.getElementById('copy-status').textContent = '';
            try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (e) { /* Preview still works. */ }
            checkFit();
        }
        function checkFit() {
            var clipped = [];
            stage.querySelectorAll('.card').forEach(function (card) {
                var body = card.querySelector('.card-body');
                if (body.scrollHeight > body.clientHeight + 1 || card.scrollHeight > card.clientHeight + 1) clipped.push(card.classList.contains('full-art') ? 'full-art' : 'regular');
            });
            document.getElementById('fit-status').textContent = clipped.length ? 'Text is clipped in the ' + clipped.join(' and ') + ' card. Try more height, smaller text, or a shorter description.' : 'Both cards fit their text.';
        }
        document.getElementById('controls').addEventListener('submit', function (e) { e.preventDefault(); });
        ['title', 'description', 'typeLabel'].forEach(function (id) {
            document.getElementById(id).addEventListener('input', function (e) { state[id] = e.target.value; render(); });
        });
        document.getElementById('sample').addEventListener('change', function (e) {
            state.sample = e.target.value; state.title = samples[state.sample][0]; state.description = samples[state.sample][1]; render();
        });
        document.getElementById('guides').addEventListener('change', function (e) { state.guides = e.target.checked; render(); });
        document.getElementById('reset').addEventListener('click', function () { state = defaults(); render(); });
        document.getElementById('copy').addEventListener('click', async function () {
            var field = document.getElementById('settings');
            try {
                await navigator.clipboard.writeText(field.value);
                document.getElementById('copy-status').textContent = 'Copied.';
            } catch (e) {
                field.focus(); field.select();
                document.getElementById('copy-status').textContent = 'Settings selected. Copy this text to share it.';
            }
        });
        render();
        if (document.fonts) document.fonts.ready.then(checkFit);
    });
})();
