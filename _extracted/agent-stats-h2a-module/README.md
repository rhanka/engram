# Agent-stats h2a module staging area

This directory contains the extracted h2a-coupled activity subsystem. It is
not part of Graphify's package entrypoint or build and `graphify-memory` does
not import it.

`src/index.ts` is the activity API and `src/cli.ts` exports
`registerAgentStatsCommands` for an h2a host to register the former
`agent-stats` and `project-graph` commands. While this staging module remains
in this repository, it reuses Graphify's generic git, PR, and optional studio
export helpers in the h2a-to-Graphify direction only.

Its projection labels are local to this module. It has no import of a legacy
memory surface; a memory engine accepts activity only through the neutral
`ActivityEvidenceSource` contract.

An h2a host can register the commands with:

```ts
import { Command } from "commander";
import { registerAgentStatsCommands } from "./src/cli.js";

registerAgentStatsCommands(new Command());
```
