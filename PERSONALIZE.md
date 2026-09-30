# Make it yours

Visible filler is in square brackets. Search for `PERSONALIZE` to find it in the HTML.

- `index.html`: a short introduction, a personal About paragraph, and your preferred contact link. Replace the bracketed text, then remove `personal-placeholder` from the paragraph's class list to return it to normal styling.
- Each of the seven project pages has an **A note from me** block above the images. Each prompt suggests a story or decision you could describe in a few sentences. Replace it and remove the `personal-placeholder` class, or remove the whole `.process-note` block if you do not want a note on that project.

## Your card template

The cards still use a 5:7 portrait ratio. A 1000 × 1400 design is a convenient starting size. Regular cards reserve room for the title, an image window, collection number, short description, and footer. Full-art variants place text over a full-bleed image.

Keep text on separate layers from your artwork so titles and descriptions can remain selectable, accessible HTML. Leave room for two-line titles. If you make a frame, export it with a transparent center; a matching back is optional and is not displayed yet.

The existing image assets are in `assets/images/cards/`. Card styling lives in `assets/css/cards.css`; the surrounding homepage styling is now in `assets/css/home.css`. The dealing, tilt, and random full-art behavior remain in `assets/js/cards.js`.

Optional later additions: a few symbols drawn by you, a process image with a caption, or a short personal line on a card. These do not need to be consistent jokes or a complete icon set.
