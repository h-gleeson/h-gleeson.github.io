This folder is a template for new projects.
1. Copy this entire folder into `projects/` and rename it to your project's slug.
2. Place the original gallery images in the `images` subfolder (any size, `jpg` or `png`).
3. Run `powershell -ExecutionPolicy Bypass -File tools/build-web-images.ps1`. It writes web-size copies to `images/web/` (your originals are not touched) and prints each image's `width` and `height`.
4. Update `index.html`: title, description, header title, intro, sidebar info blocks, and one `<figure>` per image with its own alt text and caption. `PERSONALIZE.md` has the details.
5. Add a card for it in the "Projects" section of the homepage `index.html`.
