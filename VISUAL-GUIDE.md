# 通用动效接入

0.3.0 起，视觉模块也提供[消息渲染](RENDERING.md)。直接创建的显示状态不受消息 CSS 前缀改写影响；正文、交互组件与多种格式可以沿同一适配入口挂载。

本插件负责把独立视觉运行环境带进角色卡，并为常见页面动画提供平滑、可关闭的播放接口。普通HTML显示、浏览器CSS动画和已经高效运行的效果可以继续使用原方式。

## 这版可以直接做什么

| 需求 | 接口 |
|---|---|
| 雨幕、噪声、溶解、程序化光效与GPU粒子外观 | `shader-webgl2@1`作品，片元着色器逐像素绘制 |
| 交互矢量角色／状态机 | 既有Rive WebGL2播放器 |
| Lottie / dotLottie动画 | 既有Canvas、WebGL播放器 |
| 独立网页交互场景 | `web-bundle@1`隔离页面 |
| 面板、列表、排序和布局过渡 | `TavernMotion`的WAAPI动画及`layout`接口 |

原创GPU示例位于`examples/neon-rain`，可直接导入并调整雨幕强度。

## 原生消息HTML

玩家先在插件设置导入作品文件夹。卡片输出一个明确的容器即可：

```html
<div data-tavern-visual="neon-rain@1" style="height:240px"></div>
```

原生聊天内的这些容器由插件挂载，流式重绘、删除节点或换项目时销毁旧会话。没有导入对应作品时保留容器，并写入`data-tavern-visual-error`供检查。导入后自动重试。挂载以已导入项目的ID定位资源。

## 酒馆助手页面

同源页面可导入通用客户端，根容器和生命周期由页面负责：

```js
import { connectCard } from '/scripts/extensions/third-party/tavern-runtime-suite/visual/card-client.mjs';
const card = connectCard({ root: document.body });
const scene = await card.mount('neon-rain@1', document.querySelector('#background'));
await scene.setInput('intensity', 0.5);
await card.motion.animate(document.querySelector('#dialogue'),
  [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
  { duration: 180 });
// 页面自身卸载可 await card.dispose()；pagehide亦自动清理。
```

这份客户端用于有脚本能力的同源页面。跨域iframe通过宿主扩展提供的消息通道接入。

## 帧率与页面流畅度

- 播放器支持play/pause时，统一处理离屏、后台和“减少动态”。恢复可见时保留玩家手动暂停状态。
- GPU场景支持30／60／90／120帧上限，以及1／1.5／2／3像素倍率上限。高分屏降低像素倍率可减少绘制像素；参数下次打开场景生效。
- `motion.layout(elements, mutate, options)`先批量读原位置，执行一次同步DOM更新，再批量读终点，以transform播放位移和缩放。适合列表排序与面板换位；稳定终态来自`mutate`，动画取消后保留已经更新的DOM顺序。变换过的复杂嵌套布局由作者单独校准。
- 列表入场先完成可见性读取，再启动动画，减少读布局和写动画交错。自定义动画优先使用transform与opacity；大面积blur、阴影和复杂clip-path适合结合实际绘制耗时调整。
- 诊断中的`fps`、`intervalP95`反映场景实际收到的帧间隔；`submitP95`统计CPU提交绘制指令的耗时。数据积累前显示null。

优化现有页面时，先找到耗时的逐帧DOM变动，将位移、透明度与布局动画接入上述接口，再在同一设备、同一场景比较帧间隔和绘制负载。离屏暂停用于降低后台负载，像素倍率用于控制GPU场景的绘制像素量。

## GPU作品约定

`project.source.json`选择`{"id":"shader-webgl2","version":"1"}`，`scene.file`指向GLSL ES 3.00片元着色器。内置`u_time`为秒，`u_resolution`为实际画布像素；声明的number/boolean输入映射为同名uniform，亦可通过`name`指定名称。`seek`在该播放器中使用秒。用`visual/tools/create-project.mjs <目录> --write`生成资源指纹后导入文件夹。

shader在专用画布中绘制。已有CG的溶解效果可以使用网页作品组合已导入素材。
