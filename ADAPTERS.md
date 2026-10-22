# Developer interfaces

The suite owns generic compaction, model transport, player sessions and resource lifetimes. A character card supplies its story-specific projection and persistence adapters.

## Context

`window.TavernContext.api === 1` exposes `core.Compact` and `core.Requests`. These are the same pure factories used by the default chat engine. Core definitions remain available while the suite is installed; turning off context removes the host bridge and stops its work.

`Compact.create({source,store,requests,countTokens,project,settings})` returns `before`, `status` and `records`. `project(request)` supplies ordered rows with source references, native row identities, roles, text, pending/protected flags, current viewpoint, budgets and optional pinned records. `source` supplies an epoch capture and source validation. `store` supplies `read` and an asynchronous `update` that resolves only after persistence is confirmed. `requests.run` returns a validated result and usage receipt. All storage and references remain owned by the adapter.

`Requests.create({bridge,capture,countTokens})` serializes cancellable auxiliary requests and validates that the conversation epoch is still current. Its `run` accepts structured role/content messages, purpose, viewpoint, response budget and a validator. It does not change chat text or numeric state.

## Host bridge and card adapters

For compatibility, the active host bridge is also exposed as `window.CxxContextBridge` with protocol 1. Register one adapter through `connect({scope,isAuxiliary,prepare,message,before,worldinfo,final,pause,finish})`; retain and call the returned disconnect function when the card unloads or changes chat.

`isAuxiliary(request)` is optional and returns true for a card-owned variable-analysis request that must not start a narrative round. `pause` cancels policy work on stop while retaining a receipt for a partial streamed reply. The bridge retains the round through a host ENDED event until MESSAGE_RECEIVED registration succeeds; `status().receiptLifecycle === 1` identifies this behavior.

Scope is `{character: avatarFile, chat: chatId, group: null}`. `before` must return an ordered subset of the original native row objects plus an optional prompt. Do not return invented rows or mutate stored chat text. A registered adapter has priority over the ordinary-chat engine. Different adapters cannot own the same active conversation simultaneously.

`prepare` runs before native history assembly; `message` receives source-floor events; `worldinfo` may exclude explicit `{world,uid}` entries; `final` handles the tracked main request after native prompt assembly; `finish` releases a generation. Other auxiliary requests must remain untouched. The default engine uses an anchor to distinguish its own final prompt from unrelated requests.

Card adapters own their source records, viewpoint projection and persistence. They can access shared compaction and request factories through `parent.TavernContext.core`. The ordinary engine stores summaries in `chatMetadata.tavern_runtime_context` and source identities in top-level message `tavern_runtime_source` records. Keep each record associated with its original conversation.

## Visual projects

`window.TavernVisual.api === 1` provides `importFiles`, `getProject`, `mount`, `register`, `providers` and `diagnostics`. The visual module owns this API only while enabled. Existing `cxx-motion` settings and `tavern-visual-projects` IndexedDB data remain compatible.

```js
const project = await TavernVisual.getProject('graphic-web-example@1');
const session = TavernVisual.mount(project, container, {
  binding: { panel: 'memory' },
  onEvent: event => handleEvent(event),
  onError: error => showMessage(error.message),
});
await session.ready;
await session.trigger('reveal');
await session.dispose();
```

Card iframe adapters should use their existing host message bridge to request mounting. The container owner controls when and where a project plays. The suite does not award numeric rewards or infer game actions from a visual event. See [project format](visual/PROJECT-FORMAT.md) for resource hashes, engine versions and player methods.

`window.TavernMotion.api === 1` provides the scoped DOM motion API for page transitions. Mount it on the page's own UI roots and dispose the scope when that root leaves the page.

## Suite lifecycle

`window.TavernRuntimeSuite.status()` reports wanted and active states for context and visual modules. Startup failures remain visible. Pending module loads are released if disabled before completion; shutdown waits for disposal before reuse. Native interception is published as the manifest's global `TavernRuntimeSuite_intercept` function. Old standalone plugins must be disabled before enabling the corresponding suite module.


0.2.0的数据库模式契约见[COMPATIBILITY.md](COMPATIBILITY.md)，原生HTML和同源iframe接入见[VISUAL-GUIDE.md](VISUAL-GUIDE.md)。旧API 1继续兼容；新增能力采用可检测的方法与memoryModes声明。
