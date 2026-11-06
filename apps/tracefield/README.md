# Tracefield

Tracefield turns 3D models into composed architectural drawings. It is a visualization and drawing-composition tool, not a CAD or mesh modeler: imported geometry is never edited, only arranged, styled and drawn.

Live build: `experiments/tracefield/` on the site (linked from the Experiments rail on the homepage).

## Run and build

```sh
cd apps/tracefield
npm install
npm run dev        # http://localhost:5173, hot reload
npm run build      # type-checks, then writes the site build to ../../experiments/tracefield/
npm run preview    # serves that build locally
```

GitHub Pages serves files as-is, so the build output in `experiments/tracefield/` is committed. Run `npm run build` after changing the source and commit both.

## Architecture

```
src/
  state/      document model, defaults, immutable store with undo, pure scene-tree operations
  import/     loaders (GLB/glTF/OBJ/STL/FBX), drawable extraction, hierarchy → nodes,
              model registry, edge-extraction Web Worker, built-in sample model
  engine/     three.js renderer: scene sync, fill + screen-space line shaders,
              camera rig (ortho / oblique / perspective), navigation and picking
  annotate/   label layout shared by the viewport (SVG) and PNG export (canvas)
  project/    .tracefield file format, IndexedDB autosave and restore
  app/        App shell, command layer (actions, explodeActions, annotateActions), keyboard shortcuts
  ui/         Scene panel, Inspector, view strip, viewport overlays, shared controls
```

**The source model is never modified.** The model registry keeps the original file bytes and the parsed geometry and materials. The document stores *scene nodes* that point into it by `(model id, drawable index)`. Each node carries its local matrix, visibility and lock flags, and a `style` object of overrides. Styling, grouping, renaming, hiding and deleting only change nodes. "Reset to imported" restores the imported name, transform and style from fields saved at import.

**The hierarchy is kept as imported.** Every Object3D that leads to geometry becomes a node with its file name and local transform. Nothing is merged or flattened. Instanced meshes become a group of instance nodes. Empty branches (cameras, lights, bones) are skipped. Files without semantic layer names show their node hierarchy as-is; Tracefield doesn't invent layers.

**Styles inherit through the tree.** The effective style is: drawing defaults, then each ancestor's overrides from the root down, then the node's own. With nothing selected the Inspector edits the defaults; with a selection it writes overrides on the selection. Each row shows whether the value is an override (● click to remove) or inherited from a named group (↳).

**Linework uses screen-space instanced quads**, not WebGL lines, whose width is ignored on most platforms. A worker welds vertices and classifies every edge once: smooth pair, open, material boundary / non-manifold, curve, or coplanar. The vertex shader decides per view whether a smooth edge is a silhouette (adjacent faces point opposite ways relative to the view) or a crease (dihedral angle above the crease angle), then draws it at an exact pixel width with anti-aliased edges. Lineweights are authored in px at a *reference width* (Drawing tab). The viewport scales them by `viewport width / reference width`, so a drawing reads the same at any window size, and a future export can use the same rule for high-resolution output. Hidden lines are a second pass with an inverted depth test.

**The drawing frame is the drawing.** `output.width × output.height` sets the frame aspect, and the camera's `height` is the height of the *frame* in world units, not of the viewport. The viewport fits the frame inside itself with a margin and widens its own view by `viewport height / frame height` (a wider ortho frustum, or a wider perspective FOV), so the surroundings stay visible, dimmed. Fit, pan and zoom all work relative to the frame. Cropping by dragging a frame edge changes the output size and moves the camera target by half the edge movement, so the drawing stays put on the sheet. In perspective it widens the FOV instead of dollying, so the crop never changes the perspective.

**PNG export** renders the frame at the full output size in tiles of up to 4096 px. Each tile is a slice of the same camera (`setViewOffset`) rendered into a multisampled target, read back, flipped (and un-premultiplied when transparent) and stitched on a 2D canvas. Output size is therefore limited by the browser canvas (32,767 px per side, about 268 MP), not the GPU texture size. Lines are drawn at `output width / reference width`, the same rule the viewport uses with the frame width, so lineweights match between screen and file. Paper presets (A4–A1, portrait or landscape) take their pixel size from the DPI. Selection highlights are never exported, and the grid only when asked for.

**Shadows** come from one directional shadow map (up to 4096², hardware depth comparison). The map is fitted to the bounds of the objects that cast shadows, as seen from the sun, and is re-rendered only when the scene, styles or light change. The camera doesn't affect it, so viewport and export match. *Graphic* shadows take one filtered sample and mix in a flat shadow colour; *soft* shadows average 16 samples over a disk sized by Softness and multiply the fill. "Shade faces" also gives faces turned away from the sun the shadow treatment, for a classic shade-and-shadow drawing. Cast and receive are per-object style keys, so they inherit through groups like everything else. The **ground** is a large plane at the base of the model: solid, or *shadow only* (transparent except for its shadows, which keep their alpha in a transparent PNG).

**Hatches** are drawn in the fill shader in *drawing space*: anchored to the frame centre and measured in px at the reference width, like lineweights. A hatch therefore lands identically in the viewport and in every export tile, and stays put relative to the sheet when you orbit. **Line draw order** is per object: *normal* (hidden by geometry in front), *on top* (no depth test, drawn after everything) or *behind* (moved into the opaque pass before every fill, so it only shows where nothing covers it). Line materials use custom blending so anti-aliasing survives the move.

**Style presets** (Drawing tab) replace the object defaults and the graphic drawing settings (background, hidden lines, shadows, ground, toning). They leave composition alone: grid, sun direction and lineweight reference. Per-object overrides are kept unless "Clear object overrides" is on. Presets you save are stored in this browser (localStorage) and shared by every project.

**Exploded drawings never touch the assembled model.** `doc.explode.offsets` holds a world-space move per node. While syncing, the engine turns each move into a translation in the parent's frame (`parentWorld⁻¹ · offset`), so a node carries everything its exploded ancestors did, plus its own move. `amount` (0 … 1) scales every offset, which drives the Assembled ↔ Exploded toggle (E), its animation and the Blend slider. Picking, fit, shadows and export all see the exploded scene with no special cases.

*Auto-explode* picks its parts from the selection: the children of a single group, several selected items, or with nothing selected, the first level of the model that branches. Axial mode ranks parts by their base along the axis, so things standing on the same floor share a level, and moves each level one step further. Radial mode pushes parts away from the centre, perpendicular to the axis. Spacing is a share of the parts' overall size, so it works at any unit scale. The arrangement is remembered, and the controls re-arrange those parts live. The *move tool* (W) puts axis arrows and a view-plane handle on the selection. Each drag adds to the parts' own offsets and is one undo step. *Connectors* run from each moved part's anchors in the assembled position to the same anchors now. By default a moved group gets one connector through the centre of each of its pieces. Wrapper groups with a single child are looked through, and groups of more than 40 pieces fall back to one central connector. *Customise* turns these into explicit anchors: fractions of the part's assembled bounding box, edited by dragging dots or typing values. Connectors are drawn with the same screen-space line shader as the linework. *Exploded states* are named snapshots of offsets and anchors, saved in the project.

**Labels are laid out once and drawn twice.** `annotate/layout.ts` turns the annotations into simple primitives (lines, circles, arrowheads, text with an optional halo) in *frame pixels*, with sizes in px at the reference width, like lineweights. The viewport draws those primitives as SVG over the frame. The export draws the same primitives with Canvas 2D on the stitched full-resolution image, using the export camera's projection. Labels are therefore vector-sharp at any output size and land in the same place as on screen. Each anchor is stored in its node's *local* space and goes through the node's current transform, so labels follow moves and exploded positions. Text follows the object's name unless it has its own text, and casing is applied at draw time. Layouts: *free* (leader ends stored as frame fractions), *tag columns* left, right or both sides of the model's projected bounds (sorted by anchor height and spread so leaders don't cross; dragging one freezes the columns into free positions), and a *numbered key* (tags on the anchors plus a draggable legend). New labels start in the both-sides arrangement, then are free.

**Plans and sections.** One cut plane (`doc.section`) has its normal given as azimuth / elevation, pointing at the side that is cut away, so "Look at cut" is just the camera at the same angles. A plan is elevation 90°. Every material discards fragments on the removed side: fills, ground and the shadow-depth pass, so the cut-away half casts no shadow. The line shader *trims* each edge exactly at the plane instead of dropping it. Each cut solid gets a **poché cap** in two steps:
1. A stencil pass over the object's remaining faces with depth testing off, using `INVERT`. An odd number of faces behind a pixel means the pixel is inside the solid. Parity ignores face winding, so imported meshes with inconsistent normals still work.
2. A quad on the plane, drawn where the stencil is odd, which resets it.

This runs per *solid* (`renderOrder` 100 + 2i), which is one of:
- a group set to **Cut as one solid**, with everything inside it;
- otherwise, all *open* surfaces that share a parent group, combined automatically (open = has boundary edges in the edge worker's analysis). Models built as separate surfaces, like an outer wall, inner wall, rim and base on one layer, fill as the solid they form together;
- otherwise a closed mesh on its own, so overlapping walls and slabs don't cancel each other.

Every member of a solid joins the stencil count, including parts the plane doesn't cross: the fill test for a cut pot wall runs down through the wall and leaves through the base. **Cut appearance is a per-object style**: poché on/off, colour, hatch (pattern, colour, spacing, weight, angle) and cut-line colour and weight are `cut*` keys in `GraphicStyle`. They inherit through groups and are set in the Style tab, so walls, slabs and glass can each read differently. Each cut object has its own cap material. **Cut lines** are the exact intersection of the plane with every triangle of the meshes it crosses, computed on the CPU when the cut, the model, styles or the explode change. They are batched into one mesh per distinct colour and weight, heavier batches drawn last, and drawn with the screen-space line shader. The View tab keeps only the master on/off switches for caps and cut lines. Projects saved with the earlier single, global poché style carry it over as the drawing default. Picking ignores hits on the removed side. Saved views store the section with the camera, so a plan per level or named sections recall their cut.

**The camera** is stored as azimuth / elevation / target / frame height, plus projection, FOV and oblique settings. Oblique views (cabinet, cavalier, plan oblique) are an orthographic projection with a shear of view-space x/y by depth. Camera navigation is not part of undo: undo and redo keep the current view.

**Project format (`.tracefield`).** A single binary file: header, then a JSON manifest (the full document), then the original bytes of every referenced model file in order. Opening re-parses those bytes and nodes re-attach by drawable index, which is deterministic for the same bytes. It has no temporary paths or blob URLs, so the file is portable. Autosave writes the same pieces to IndexedDB: model bytes once per model, then the document a moment after each change.

## Known limitations

- **Project size.** Projects embed the source files, so a project is about as large as its models. This was chosen over re-encoding geometry so imports stay lossless and re-parse identically. Browser storage quotas limit autosave for very large models; Tracefield reports when autosave fails.
- **Skinning and morph targets** are drawn in their bind/rest pose. Animations are ignored.
- **Texture colour** is shown with the base-colour map only (no normal/roughness/emissive maps). The drawing tool renders flat, toned fills, not PBR lighting.
- **Perspective lines** are clipped at the near plane; extreme close-ups can drop a few segments.
- **FBX** loads through three.js's FBXLoader (binary 6.4+, ASCII 7.0+). Some exporter-specific features (layered textures, NURBS surfaces) are not supported.
- **Draco and Meshopt** compressed glTF are supported. KTX2/Basis textures are not decoded yet: files that *require* them fail with a message, and files that only offer them as an option import without those textures.
- **Picking** is per object. There is no box selection yet.
- **Export size** is capped by the browser canvas (32,767 px per side, ~268 MP). A2 at 300 dpi (35 MP) is fine; A0 at 600 dpi is not. Very large exports need a lot of memory, and the PNG is encoded in one go at the end.
- **Transparent export** keeps line anti-aliasing as partial alpha. Fills are opaque; semi-transparent fills export with their opacity.
- **Shadow resolution** is one map for the whole set of casters. On a very large site with small details, shadow edges get softer or stair-stepped. Hiding distant context objects, or turning off their *Casts shadow*, tightens the map.
- **Transparent and see-through fills** cast full shadows. Line-only objects (fill None) still cast if *Casts shadow* is on.
- **Hatches are screen-aligned**, not mapped onto surfaces. That suits drawing conventions (poché, tone), but a hatch won't follow a façade's perspective.
- **Style presets saved in the browser** don't travel with a `.tracefield` file. The project keeps the applied look, but not the preset list.
- **Explode offsets are keyed by node.** Duplicating a moved part gives an assembled copy, and ungrouping a moved group drops that group's move. Its children return to where their own offsets put them.
- **Connectors are straight segments** between matching anchors. There are no elbows or leader-style routing yet, and they don't stop at part surfaces: "Hidden by parts" relies on depth to hide the inner stretch.
- **Gizmo moves are in world axes**, not the part's local axes. In perspective, view-plane drags are scaled at the target distance, so parts far from the target move faster or slower than the cursor.
- **Label fonts are system fonts** (font stacks such as Helvetica / Arial or Futura / Century Gothic). A project opened on a machine without the first font falls back to the next. Export uses the same fonts the viewport shows, so what you see is what you get on that machine.
- **Label collisions** are only resolved in the column layouts. Free labels can overlap each other or the model, and leaders in columns can cross the drawing. Saved-view thumbnails don't include labels.
- **Poché needs closed volumes.** A volume can be one mesh, or several surfaces in one group (combined automatically when they are open, or with **Cut as one solid**). Surfaces that don't close up, like single-sided glass or terrain sheets, can fill wrongly or not at all; turn **Fill cut** off on them. A combined solid takes its poché style from its group. There is one cut plane at a time (no section box).
- **Cut lines are recomputed on the CPU** on every change to the cut. On very heavy models (millions of triangles) dragging the cut can lag; typing a value or using the slider in steps stays responsive.
- **Projects from milestone 1** reopen fine, but their saved camera heights referred to the whole viewport, so the framing may look slightly tighter until you re-fit.

## Done

- **M1:** GLB/glTF (plus OBJ/STL/FBX) import with the hierarchy preserved; scene tree; selection; per-node style overrides with inheritance; linework; camera presets; saved views; projects and autosave.
- **M2:** drawing frame (screen and A-series presets, DPI, width/height with aspect lock, rotate, drag-to-crop); lineweight reference scale tied to the output; tiled high-resolution PNG export (coloured or transparent background, antialiasing, progress, cancel, size checks).
- **M3:** graphic and soft shadows with per-object cast/receive and shade faces; solid or shadow-only ground; line, cross and dot hatches; per-object line draw order; eight built-in style presets plus saved ones.
- **M4:** exploded drawings: axial and radial auto-explode with spacing and scale; move gizmo (axis and view plane); assembled ↔ exploded toggle with animation and blend; connector lines with draggable, editable anchors; saved exploded states.
- **M5:** annotations: labels from object names (or custom text); leaders with draggable, re-targetable anchors, dot/arrow/tick ends and elbows; free, tag-column and numbered-key layouts; font, size, weight, colour, casing, tracking and halo, with per-label overrides; vector-drawn into the PNG export.
- **Sections:** plan and section cuts (plan, X, Z or any angle), exact line trimming, per-object stencil poché and cut lineweights (solid or hatched, set per object or group in the Style tab), true cut lines, flip, look-at-cut, a drag handle in the viewport, and saved views that remember their cut.

## Roadmap (remaining features)

- **Also:** box selection; perspective near-plane line splitting; KTX2 textures.
