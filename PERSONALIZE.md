# Make it yours

Visible filler is in square brackets. Search for `PERSONALIZE` to find it in the HTML.

- `index.html`: a short introduction, a personal About paragraph, and your preferred contact link. Replace the bracketed text, then remove `personal-placeholder` from the paragraph's class list to return it to normal styling.
- Each of the seven project pages has an **A note from me** block above the images. Each prompt suggests a story or decision you could describe in a few sentences. Replace it and remove the `personal-placeholder` class, or remove the whole `.process-note` block if you do not want a note on that project.

## Your card template

Each homepage card has a `[Card type]` placeholder in `.card-type-label`. Replace it with your own category (for example, `Building — Community space` or `Drawing — Study`). The workshop's **Card type** field previews this label on both variants and includes it in copied settings. The collection number sits at the other end of the same bar.

Open `experiments/cards/index.html` (also linked under Experiments on the homepage) for the **Card workshop**. It previews regular and full-art cards using the shared homepage styles. Adjust the sliders and text, turn on layout guides, then copy the settings with your feedback. Your draft is saved only in this browser; it does not edit the homepage. Reset to homepage layout after shared CSS changes to inspect the new defaults.

The cards use a 5:7 portrait ratio (280 × 392px). A 1000 × 1400 design is a convenient starting size. Regular cards reserve room for the title, an image window, collection number, short description, and footer. Full-art variants place text over a full-bleed image.

Keep text on separate layers from your artwork so titles and descriptions can remain selectable, accessible HTML. Leave room for two-line titles. If you make a frame, export it with a transparent center; a matching back is optional and is not displayed yet.

The existing image assets are in `assets/images/cards/`. Card styling lives in `assets/css/cards.css`; the surrounding homepage styling is now in `assets/css/home.css`. The dealing, tilt, and random full-art behavior remain in `assets/js/cards.js`.

Optional later additions: a few symbols drawn by you, a process image with a caption, or a short personal line on a card. These do not need to be consistent jokes or a complete icon set.
