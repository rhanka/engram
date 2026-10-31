This consumer pins the third-party dependency closure for the local 0.22.1
tarball. The runner substitutes only that tarball's SHA-512 integrity, then
runs `npm ci --offline --ignore-scripts`. Missing required cache entries fail;
the runner never regenerates the lock or fetches a replacement version.
The remaining `tree-sitter` override is repeated here because npm applies
overrides from the consumer root. Optional dependencies retain npm's optional
semantics; `officeparser` is an optional peer dependency of engram, so the
consumer closure carries no office/pdfjs/tesseract entries at all.

The lock is refreshed using offline npm 11, the local packed
artifact and the committed consumer manifest, seeded from the root lockfile
pins so npm's arborist reuses the root versions instead of re-resolving the
declared ranges against the cache. No dependency is added to
Engram. TypeScript and Vitest are existing checkout tools; subject values and
types resolve through `@sentropic/engram/memory-substrate` in this consumer.
Reference-port and hash/schema helpers remain test oracles, not a production
backend or a delivered binding asset.

M5 remains `source-gap`, status `unverified`: the required upstream file
`packages/cluster-mesh/src/engram-memory/contract.ts` does not exist in sentropic
`3556df5c6a9cbb6abc83e59f6a49e08b731a6064`. There is no replacement asset or
backend qualification claim here.
