# @sentropic/graph

MIT graph rendering primitives for Graphify and other known-position graph UIs.

> **This library now lives in the Sent Tech design system**
> (<https://github.com/rhanka/sent-tech-design-system>), which is its source of
> record and its only npm publisher. The copy in this repository is `private` and
> unpublishable: it is kept as the local build/test source for the Graphify studio
> renderer. See [PUBLISHING.md](./PUBLISHING.md).

The package is rendering-first: it accepts canonical node order, `Float32Array` positions, and `Uint32Array` indexed edges. Layout physics are deliberately a separate contract so a renderer can consume static coordinates, worker-driven frames, or future Barnes-Hut/WebGPU engines without owning repulsion or pin state.

## MVP Contract

- `buildRenderGraphBuffers(scene)` adapts high-level nodes and edges into stable typed buffers.
- `buildStyleBuffers(scene, graph)` compiles sizes, colors, node shapes, dash modes, widths, and curvatures into typed arrays aligned to the filtered graph.
- `setGraph`, `setPositions`, and `updatePositions(PositionFrame)` are the renderer hot path.
- `createGraphRenderer(canvas, { backend: "canvas2d" })` selects the rich Canvas2D backend for feature parity while WebGL catches up.
- `x/y` are y-down world coordinates. `fx/fy` may mark high-level pins but are not renderer state.
- Curved edge geometry is derived from positions and styling options, not from layout physics.

Benchmarks live in `bench/` and track typed-buffer compilation, styling compilation, and edge geometry throughput before npm releases. See `FEATURES.md` for the current scope and roadmap.
