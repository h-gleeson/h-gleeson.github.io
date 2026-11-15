# Make it yours

Nothing on the public site is filler any more. This file keeps the prompts and the how-to for the parts only you can write.

## Preview the site on your computer

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open <http://localhost:8080/>. Nothing is published; press Ctrl+C to stop.

## A note from me (optional, one per project)

Each project page used to show an unfinished **A note from me** block. They are removed from the pages until you have the words. The prompts are kept here:

| Project page | Prompt |
| --- | --- |
| `projects/palace/index.html` | A detail you and your collaborator argued for, changed, or especially enjoyed making. |
| `projects/hybrid/index.html` | One surprise from working with the existing jail, and how it changed the design. |
| `projects/stonehenge/index.html` | What you noticed while drawing, or why you chose to study the site at night. |
| `projects/vertical_village/index.html` | A moment in the project when the makerspace or public spaces started to click. |
| `projects/dirtpolitics/index.html` | A detail from caring for the plant or making the sculpture that did not make it into the formal description. |
| `projects/landscape/index.html` | Something you learned on the job that a finished planting plan cannot show. |
| `projects/media_museum/index.html` | How the facade became something people could play with, or a decision you made with your collaborators. |

To add a note, paste this block as the first thing inside `<section class="gallery-content" ...>` on that page and replace the sentence. The styling is already in `assets/css/theme.css`.

```html
<div class="process-note">
    <h2>A note from me</h2>
    <p>Your few sentences go here.</p>
</div>
```

## Homepage text

- **Introduction** (`index.html`, `.hero-sub`): one line plus "Hello! I'm a designer (of various things)." The rest of your introduction now lives in **About me**.
- **About me** (`index.html`, `.about-content`): your two paragraphs, then the contact list (`.contact-list`) with your email, Instagram and LinkedIn. Edit or remove a line by editing its `<li>`.

## Your card template

Each homepage card has a category in `.card-type-label`, written as `Kind — Detail` (for example, `Building — Community center` or `Drawing — Research study`). The current ones come from your project descriptions; change any of them in `index.html`. The same category appears above the title on the project page (`.project-kicker`). The workshop's **Card type** field previews this label on both variants and includes it in copied settings. The collection number sits at the other end of the same line.

Open `experiments/cards/index.html` (also linked under Experiments on the homepage) for the **Card workshop**. It previews regular and full-art cards using the shared homepage styles. Adjust the sliders and text, turn on layout guides, then copy the settings with your feedback. Your draft is saved only in this browser; it does not edit the homepage. Reset to homepage layout after shared CSS changes to inspect the new defaults.

The cards use a 5:7 portrait ratio (280 × 392px at the default text size). They are sized in `rem`, so they grow when a visitor enlarges text, and a card gets taller rather than cutting off its description. A 1000 × 1400 design is a convenient starting size. Regular cards hold the title, an image window, one ruled line with the category and collection number, a short description, and a footer. Full-art variants place the title on a dark plate and the text on one dark panel over a full-bleed image, so the words stay readable over any artwork in both colour modes.

Keep text on separate layers from your artwork so titles and descriptions can remain selectable, accessible HTML. Leave room for two-line titles. If you make a frame, export it with a transparent center; a matching back is optional and is not displayed yet.

The existing image assets are in `assets/images/cards/`. Card styling lives in `assets/css/cards.css`; the surrounding homepage styling is in `assets/css/home.css`. The dealing, tilt, random full-art behavior, Prev / Next buttons and the "View all cards" grid are in `assets/js/cards.js`.

Optional later additions: a few symbols drawn by you, a process image with a caption, or a short personal line on a card. These do not need to be consistent jokes or a complete icon set.

## Project galleries

Gallery images are written into each project page, one `<figure>` per image, in the order shown. Nothing is guessed from filenames any more.

To add or replace an image:

1. Put the original in `projects/<name>/images/` (any size; it is never modified).
2. Run `powershell -ExecutionPolicy Bypass -File tools/build-web-images.ps1`. It writes 800 px and 1600 px copies to `projects/<name>/images/web/` and prints the original's `width` and `height`. Photos become JPG; drawings stay PNG so linework stays crisp. If a PNG is really a photo or render, list it under `"photo"` in `tools/web-images.json` first.
3. Add a figure to the page:

```html
<figure class="project-figure">
    <img src="images/web/NAME-800.png"
         srcset="images/web/NAME-800.png 800w, images/web/NAME-1600.png 1600w"
         sizes="(max-width: 900px) calc(100vw - 40px), calc(100vw - 26rem)"
         width="5400" height="3600"
         alt="Say what the image shows, for someone who cannot see it."
         loading="lazy" decoding="async">
    <figcaption><span>Short caption.</span> <a href="images/NAME.png">Full size<span class="visually-hidden">: Short caption</span> (5400 × 3600, 1.2 MB)</a></figcaption>
</figure>
```

- `width` and `height` are the **original's** pixel size. They let the page hold the right space before the image arrives.
- Add `portrait` to the class (`class="project-figure portrait"`) when the image is taller than it is wide.
- The first figure on a page is the lead image. It has `class="project-figure project-lead"` and `fetchpriority="high"` instead of `loading="lazy"`, and it sits above the details so a phone shows it first.
- If the tool says "use the original as the large size", use the original file in place of the `-1600` entry, with its real width (for example `images/NAME.png 1717w`).
- The "Full size" link always points at your untouched original.

`projects/template/` is a ready-made starting page.

## Link previews

Every page has a description and a 1200 × 630 preview image in `assets/images/social/`, used when a link is shared. Project previews are cropped by `tools/build-web-images.ps1` from the image named under `"social"` in `tools/web-images.json`. The others (`home`, the essay, and the experiments) are screenshots of the pages; replace any of them with your own 1200 × 630 JPG of the same name.

## Colour and motion

- The accent presets and the custom colour keep their hue, but `assets/js/theme-init.js` lightens or darkens accent-coloured text until it is readable in the current mode. If you add a preset in `assets/js/theme.js`, it is handled automatically.
- The homepage **MOTION** switch (and a visitor's "reduce motion" system setting) holds the card shimmer, dealing and tilt still. The interactive facade has its own **pause motion** button.
