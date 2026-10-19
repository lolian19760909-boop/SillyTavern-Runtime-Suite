# Third-party notices

The suite's own code is licensed under MIT. Third-party files retain their original notices and licenses.

| Component | Version | License | Bundled notices |
|---|---|---|---|
| Rive WebGL2 | 2.44.2 | MIT | `visual/vendor/RIVE-LICENSE.txt`, `visual/licenses/RIVE-LICENSE.txt` |
| dotLottie Web | 0.81.0 | MIT | `visual/vendor/DOTLOTTIE-LICENSE.txt` |
| js-sha256 | 0.11.1 | MIT | `context/core/vendor/LICENSE.txt` and source header |

Rive and dotLottie build inputs are locked in `package-lock.json`; bundled JS/WASM hashes are recorded in `visual/vendor/receipt.json`. js-sha256 is the same fixed local fallback used by the existing compatibility layer. Upstream project links: [Rive](https://github.com/rive-app/rive-wasm), [dotLottie](https://github.com/LottieFiles/dotlottie-web), [js-sha256](https://github.com/emn178/js-sha256).

Unity and Spine are third-party authoring/runtime products. This repository provides a Unity Web adapter interface; it contains neither a Unity export nor a Spine runtime. Their licenses remain separate from this project's MIT license.

The included graphic-web example is a standalone, project-authored technical example. Character-card artwork, worldbooks and player conversations are not part of this repository.
