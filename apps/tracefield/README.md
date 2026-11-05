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
  project/    .tracefield file format, IndexedDB autosave and restore
  app/        App shell, command layer (actions), keyboard shortcuts
  ui/         Scene panel, Inspector, view strip, viewport overlays, shared controls
```

**The source model is never modified.** The model registry keeps the original file bytes and the parsed geometry and materials. The document stores *scene nodes* that point into it by `(model id, drawable index)`. Each node carries its local matrix, visibility and lock flags, and a `style` object of overrides. Styling, grouping, renaming, hiding and deleting only change nodes. "Reset to imported" restores the imported name, transform and style from fields saved at import.

**The hierarchy is kept as imported.** Every Object3D that leads to geometry becomes a node with its file name and local transform. Nothing is merged or flattened. Instanced meshes become a group of instance nodes. Empty branches (cameras, lights, bones) are skipped. Files without semantic layer names show their node hierarchy as-is; Tracefield doesn't invent layers.

**Styles inherit through the tree.** The effective style is: drawing defaults, then each ancestor's overrides from the root down, then the node's own. With nothing selected the Inspector edits the defaults; with a selection it writes overrides on the selection. Each row shows whether the value is an override (● click to remove) or inherited from a named group (↳).

**Linework uses screen-space instanced quads**, not WebGL lines, whose width is ignored on most platforms. A worker welds vertices and classifies every edge once: smooth pair, open, material boundary / non-manifold, curve, or coplanar. The vertex shader decides per view whether a smooth edge is a silhouette (adjacent faces point opposite ways relative to the view) or a crease (dihedral angle above the crease angle), then draws it at an exact pixel width with anti-aliased edges. Lineweights are authored in px at a *reference width* (Drawing tab). The viewport scales them by `viewport width / reference width`, so a drawing reads the same at any window size, and a future export can use the same rule for high-resolution output. Hidden lines are a second pass with an inverted depth test.

**The camera** is stored as azimuth / elevation / target / frame height, plus projection, FOV and oblique settings. Oblique views (cabinet, cavalier, plan oblique) are an orthographic projection with a shear of view-space x/y by depth. Camera navigation is not part of undo: undo and redo keep the current view.

**Project format (`.tracefield`).** A single binary file: header, then a JSON manifest (the full document), then the original bytes of every referenced model file in order. Opening re-parses those bytes and nodes re-attach by drawable index, which is deterministic for the same bytes. It has no temporary paths or blob URLs, so the file is portable. Autosave writes the same pieces to IndexedDB: model bytes once per model, then the document a moment after each change.

## Known limitations (milestone 1)

- **Project size.** Projects embed the source files, so a project is about as large as its models. This was chosen over re-encoding geometry so imports stay lossless and re-parse identically. Browser storage quotas limit autosave for very large models; Tracefield reports when autosave fails.
- **Skinning and morph targets** are drawn in their bind/rest pose. Animations are ignored.
- **Texture colour** is shown with the base-colour map only (no normal/roughness/emissive maps). The drawing tool renders flat, toned fills, not PBR lighting.
- **Perspective lines** are clipped at the near plane; extreme close-ups can drop a few segments.
- **FBX** loads through three.js's FBXLoader (binary 6.4+, ASCII 7.0+). Some exporter-specific features (layered textures, NURBS surfaces) are not supported.
- **Draco and Meshopt** compressed glTF are supported. KTX2/Basis textures are not decoded yet: files that *require* them fail with a message, and files that only offer them as an option import without those textures.
- **Picking** is per object. There is no box selection yet.

## Roadmap (remaining features)

- **M2 — drawing frame and export:** frame with aspect, A2/A3 presets and crop; output size; tiled high-resolution PNG export with transparent or coloured background; export progress.
- **M3 — graphic styles, round two:** shadows (cast/receive, graphic vs soft), ground plane, hatch patterns, line draw order (behind / on top / normal occlusion), drawing-style presets.
- **M4 — exploded drawings:** viewport move gizmo, axial and radial auto-explode, spacing and scale controls, connector lines with editable anchors, saved exploded states, assembled ↔ exploded compare.
- **M5 — annotations:** labels from object names, leaders with draggable anchors, font, size, weight, colour and casing controls, a tag layout beside the model.
- **Also:** box selection; perspective near-plane line splitting; KTX2 textures.
