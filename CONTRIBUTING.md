# Contributing

Use Node.js 24 and run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm test`. The tests are self-contained and use synthetic data. GitHub Actions runs the same checks; a local pass is separate from a completed CI run.

Keep `manifest.json` and `index.js` at the repository root so SillyTavern can install the repository directly. Do not commit `node_modules`, player chats, credentials, character-card assets, or generated release archives.

Context policy lives in `context/core`; host persistence lives in `context/native.mjs`; card adapters own their game rules and storage. Keep source validation and confirmed persistence ahead of replacing any old prompt history. `ADAPTERS.md` describes the protocol.

Visual providers live in `visual/providers`. Projects use the format in `visual/PROJECT-FORMAT.md`; provider changes must preserve session cancellation, resource release, and declared commands. Load a provider when a project needs it. Keep artwork and engine exports in separate projects.

When updating a runtime, update the fixed dependency, lockfile, vendored files, and license notices together. Use `npm run vendor` to reproduce the vendored players. Keep third-party notices and licenses intact.

For host behavior changes, check the actual extension entry with `node test/serve.mjs` and its browser page. Record what was checked. Real SillyTavern/TauriTavern, real model output, Unity exports, and Rive external assets require their respective environments.

Before making a release, update the changelog and version together, run the checks, and create the installation archive with `tools/package.ps1`. The script verifies each archived file after writing it. Submit focused changes with the observed behavior, resulting behavior, and validation.
