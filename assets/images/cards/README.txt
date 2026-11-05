CARD ART
========
Each homepage card has two optional images, set on its .card-art div in index.html:

  --art       regular art window   5:4 landscape, 800x640 px
  --art-full  full-art variant     5:7 portrait,  720x1008 px

Example:

  <div class="card-art" style="--art: url('assets/images/cards/palace_reg.jpg');
                               --art-full: url('assets/images/cards/palace_full.jpg')"></div>

Adding new art
- Drop the exported PNGs here as <name>_reg.png and <name>_full.png (any size).
- Run:  powershell -ExecutionPolicy Bypass -File tools/optimize-card-art.ps1
  It writes small JPGs here and moves the originals to ../card-art-originals/.
- Point the card in index.html at the .jpg files.

Notes
- --art-full is optional. If omitted, the full-art variant reuses --art.
- Images are cropped with "cover" from the centre, so keep the subject centred.
  Full art has dark scrims over the top ~25% and bottom ~40% for text.
- Full art is rolled at random on each page load (see cards.js). To preview,
  add data-variant="full" (or "regular") to the card's <a>.
- Art is lazy-loaded: a card only downloads the variant it shows, and only
  once it's near the visible part of its rail.
- Aim for under ~300 KB per image.
