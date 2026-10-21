# Contributing

Use Node.js 24 and run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm test`. The tests use synthetic data. GitHub Actions runs the same checks.

Keep `manifest.json` and `index.js` at the repository root so SillyTavern can install the repository directly. Do not commit `node_modules`, player chats, credentials, character-card assets, or generated release archives.

Context policy lives in `context/core`; host persistence lives in `context/native.mjs`; card adapters own their game rules and storage. Keep source validation and confirmed persistence ahead of replacing any old prompt history. `ADAPTERS.md` describes the protocol.

Visual providers live in `visual/providers`. Projects use the format in `visual/PROJECT-FORMAT.md`; provider changes must preserve session cancellation, resource release, and declared commands. Load a provider when a project needs it. Keep artwork and engine exports in separate projects.

When updating a runtime, update the fixed dependency, lockfile, vendored files, and license notices together. Use `npm run vendor` to reproduce the vendored players. Keep third-party notices and licenses intact.

For host behavior changes, run `node test/serve.mjs` and open its browser check page, then test the changed behavior in the target host. For player changes, import a work using the affected engine and assets.

Before making a release, update the changelog and version together, run the checks, and create the installation archive with `tools/package.ps1`. The script verifies each archived file after writing it. Submit focused changes with the observed behavior, resulting behavior, and validation.

Players install and update through their host's extension manager using the repository URL. Publish the version to GitHub and provide a ZIP for offline installation.

Write release notes for users: describe features, fixes and upgrade steps. Use generic examples in integration guides. Review the release description, repository documentation and archived documentation together before publishing; keep development plans and test reports in their respective records.
