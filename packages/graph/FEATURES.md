# @sentropic/graph Feature Tracking

## v0.1 MVP

- MIT package metadata and npm-ready ESM/CJS/types build.
- Stable scene adapter: `nodeIds`, `idToIndex`, `Float32Array` positions, `Uint32Array` edge endpoints, filtered dangling edges.
- Styling adapter: node sizes/colors, edge widths/colors/dash/curvature compiled into typed arrays.
- Geometry adapter: straight edges and quadratic curved edge polylines for memoir-style arcs.
- Renderer contract: `setGraph`, `setStyle`, `setPositions`, `updatePositions`, `fitView`, `setCamera`, `render`, `snapshot`.
- Layout contract: layout engines are separate and stream `PositionFrame`; renderer never owns repulsion or pins.
- Benchmark: 100k known-position nodes and 200k edges for buffer, style, straight-geometry, and arc-geometry modes.

## Deferred

- Real WebGL shader draw path for nodes/edges/style buffers.
- GPU picking, hover index, hit testing, labels, and tooltips.
- Worker/transferable `PositionFrame` streaming.
- Barnes-Hut repulsion engine in a separate layout module.
- Comparative benchmark harness against sigma.js, cosmos.gl, and G6 with reproducible datasets.
