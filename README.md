# Tavern Runtime Suite

A free, MIT-licensed SillyTavern extension for conversation compaction and visual projects. Install once; enable context and visuals independently.

一个免费的酒馆扩展，提供通用上下文压缩和动画作品运行环境。两个模块独立开关，玩家安装成品即可使用。

## 安装

发布仓库后，在酒馆“扩展 → 安装扩展”填写本仓库地址。也可解压发行版中的 `tavern-runtime-suite` 文件夹，放进 ST 的 `public/scripts/extensions/third-party/` 或用户数据目录的 `extensions/`；TT使用数据目录的`default-user/extensions/`。刷新后在扩展设置展开“Tavern Runtime Suite · 上下文与视觉”。

从旧独立版迁移时，先停用“Cyber2051 上下文桥”和“Tavern Visual”旧扩展，再启用套件。已有角色卡、聊天、作品库和视觉设置保留。不要同时启用旧独立插件和套件的相同模块。

玩家无需安装 Node.js、运行 npm、编译或重新制作角色卡。安装包已带固定版本的播放器文件，只有用到对应作品时才加载播放器。

## 上下文模块

普通单角色聊天可直接使用，选择酒馆当前的 Chat Completion 连接即可。较早对话接近输入阈值时，会调用同一连接归纳旧段；近期完整轮次和当前输入保留。默认保留最近六轮，每轮最多整理两次，可在设置修改。

原聊天不会被摘要覆盖。摘要和消息来源记录保存于当前聊天；保存并读回一致后，摘要才替代本次发送中的旧段。编辑前文、切换回复或删除原文后，不再采用失效摘要。图片、工具调用和系统消息不作为普通旧段删减。

设置中可以查看和停用摘要、重试保存或允许重新整理。摘要没有缩短输入时不会反复调用；同一段连续失败两次后等待明确重试。估算使用宿主分词接口；模型返回的实际用量另行记录。第一次整理前尚无完整固定提示用量时，最终提示仍会重新核对，必要时停止发送并提示重试。

摘要整理使用当前模型连接，会产生额外模型调用。只需动画时，可以关闭上下文模块。群聊尚未接入默认压缩；非 Chat Completion 连接会显示不支持状态。

使用人物知情、记忆数据库或自定义数值的角色卡，可以接入专用适配；适配接管该卡的上下文，不会与默认压缩重复运行。2051的知情范围和数值规则由其卡片适配持有。

## 动画与视觉模块

展开“Tavern Visual · 视觉运行环境”，选择文件或文件夹导入作品，再预览或由角色卡挂载。

| 播放器 | 当前范围 |
|---|---|
| Rive WebGL2 2.44.2 | `.riv`、画板／状态机、输入与事件、数据绑定；真实外置素材作品仍待验证 |
| dotLottie Canvas／WebGL 0.81.0 | Lottie JSON、`.lottie`、外置图片、定位和区间播放 |
| 网页作品 | 单个JavaScript入口与资源，在独立iframe内运行，通过私有通道通信 |
| Unity Web | 未压缩、单线程、自包含Web导出的接入接口；尚无真实Unity作品播放验收 |

Spine尚未集成。第三方编辑器和作品继续遵守原厂许可。

作品与插件分开，插件不携带角色卡立绘、背景或页面素材。`examples/graphic-web`是自制WebGL2技术作品；可单独导入其目录查看显现／消散。项目清单、播放器接口和完整示例见[项目格式](visual/PROJECT-FORMAT.md)。

作品库保存在当前浏览器站点的IndexedDB，清除站点数据会清除库；原始作品文件应自行保留。切换聊天关闭播放会话，已导入作品继续保存。`TavernMotion`提供页面主动接入的开合／切页辅助；它不会自动改写所有卡片已有动画。

## 开发者

[接口与适配](ADAPTERS.md)说明通用核心、卡片接入和兼容接口。源码MIT，第三方许可见[NOTICE](NOTICE.md)。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

`npm run vendor`从锁定依赖重新生成播放器；提交的`visual/vendor`已可直接运行。`node test/serve.mjs`打开合成数据检查页；它使用实际扩展入口和播放器、固定文本模型，不接玩家数据或真实模型。

维护者在PowerShell 7运行`tools/package.ps1 -OutDirectory <输出目录>`查看成品清单，加`-Write`生成安装ZIP并逐文件读回。已有ZIP不覆盖。安装包排除开发依赖、测试及技术样例；GitHub源码保留可复现测试。

## 验证范围

本地已检查通用压缩、来源失效、保存重试、辅助请求隔离、模块反向开关、播放器及清理；组件浏览器完成普通卡发送链、网页作品和独立开关。真实ST／TT、真实模型与长期使用由作者验收。最低声明版本为ST 1.18.0；宿主能力仍需满足运行接口，不能据版本号单独推定全部行为。

设计参考：[Codex compaction](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact.rs)、[ZCode compaction policy](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/core/src/compact/policy.ts)、[SillyTavern扩展接口](https://docs.sillytavern.app/for-contributors/writing-extensions/)。
