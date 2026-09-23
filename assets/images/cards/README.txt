CARD ART
========
Each homepage card has two optional images, set on its .card-art div in index.html:

  --art       regular art window   ~1:1 (square), e.g. 800x800 px
  --art-full  full-art variant     5:7 portrait,  e.g. 720x1008 px

Example:

  <div class="card-art" style="--art: url('assets/images/cards/palace.jpg');
                               --art-full: url('assets/images/cards/palace-full.jpg')"></div>

Notes
- Drop files in this folder (or anywhere; the URL path is what matters).
- --art-full is optional. If omitted, the full-art variant reuses --art.
- Images are cropped with "cover" from the centre, so keep the subject centred.
  Full art has dark scrims over the top ~25% and bottom ~40% for text.
- Full art is rolled at random on each page load (see cards.js). To preview,
  add data-variant="full" (or "regular") to the card's <a>.
- Prefer JPG/WebP under ~300 KB.
