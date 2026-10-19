# 视觉项目格式与接口 1

作品是独立目录，根目录放`project.json`，资源保留相对路径。此清单不执行脚本。导入会核对每个资源的字节数和SHA256，再保存到浏览器项目库；播放时只读取这份已导入内容。

## 生成清单

在作品目录写`project.source.json`，例如网页作品：

```json
{
  "format": "tavern-visual-project",
  "schema": 1,
  "id": "my-graphic",
  "version": "1",
  "title": "我的图形作品",
  "engine": { "id": "web-bundle", "version": "1" },
  "scene": { "file": "entry.js", "interactive": false },
  "inputs": [
    { "id": "progress", "type": "number" },
    { "id": "reveal", "type": "trigger" }
  ],
  "events": ["complete"],
  "files": ["entry.js", "images/grain.png"]
}
```

从源码仓库根目录运行，先检查输出，再写清单：

```powershell
node visual/tools/create-project.mjs "./my-project"
node visual/tools/create-project.mjs "./my-project" --write
```

Node 22或更新版本可运行这些开发工具。生成器将`files`换成`resources`，包含`path`、`bytes`、`sha256`和`type`。可直接打开生成JSON审阅。修改作品时提高`version`并重新生成；已导入的旧版本保留。

ID／版本只用英文字母、数字、点、短横线和下划线。资源路径保留目录，禁止绝对路径和`..`。输入ID不重复，类型为`number`、`boolean`、`string`、`color`或`trigger`；颜色值是`#RRGGBB`。事件是字符串数组，未声明的事件不会传给卡片。`scene`由各播放器解释，未知项目字段在保存时保留。

## 宿主API

`globalThis.TavernVisual`的`api`为1。

| 调用 | 作用 |
|---|---|
| `importFiles(File[])` | 核对并保存作品，返回准备好的项目；支持浏览器目录选择的相对路径 |
| `getProject('id@version')` | 读取已保存的项目，不存在时返回`undefined` |
| `providers()` | 返回已登记的引擎及确切版本 |
| `inspect(project)` | 查看对应播放器是否已登记；不加载作品 |
| `mount(project, element, options)` | 建立会话，替换同一容器时先完成旧会话的销毁 |
| `diagnostics()` | 查看运行中的会话及已载入播放器数量 |
| `register(descriptor)` | 已受信任的配套扩展登记一个播放器；重复版本拒绝登记 |

`options`可传`signal`、`binding`、`onEvent`、`onError`。`binding`是卡片给本次播放的元数据副本，事件按原样返回归属，不跟随之后的界面选择改变。事件回调收到`{name,value,binding}`。绑定信息不自动传给独立作品；作品需要的数据用声明过的输入发送。

会话同步返回，`await session.ready`表示作品已完成加载。`play()`、`pause()`、`seek(frame)`、`setSegment(start,end)`、`setInput(id,value)`、`trigger(id)`都是异步命令，只执行播放器声明支持的能力。`diagnostics().capabilities`给出实际能力。`dispose()`可重复调用并等待清理完成。加载失败、关闭期间迟到的加载和播放后的错误均会清理该会话；调用方应处理`ready`或命令的拒绝。

## Rive

引擎为`rive-webgl2@2.44.2`。`scene.file`指向`.riv`；可指定`artboard`、`stateMachine`、`autoplay`。旧作品可指定`animation`，这一选项仍沿固定版Rive支持，优先使用状态机。

状态机输入与数据绑定的声明分别为：

```json
[
  { "id": "hover", "type": "boolean", "machine": "Button", "name": "Hover" },
  { "id": "caption", "type": "string", "kind": "property", "name": "Caption" },
  { "id": "submit", "type": "trigger", "machine": "Button", "name": "Submit" }
]
```

映射名称必须与Rive作品一致。运行情况中列出可见状态机和属性名称。Rive事件按其名称对应清单`events`，URL事件不会自动导航。

外置素材用`scene.assets`把Rive报告的`uniqueFilename`映射到包内资源路径。代码已接图片、字体、音频解码，并在销毁时释放；目前实际验证用的是内嵌素材作品，外置Rive素材需要后续真实作品核对。没有映射时明确报错，不转向CDN。

## Lottie与dotLottie

引擎为`dotlottie-canvas@0.81.0`或`dotlottie-webgl@0.81.0`。两者单独声明，不自动替换后端。`scene.file`可为Lottie JSON或`.lottie`，可指定`loop`、`autoplay`和容器内的`animationId`。支持播放、暂停、帧定位、区间；`complete`与`loop`须写入`events`才能接收。

外置图片用`scene.assets`映射作品内路径到包内文件。解析优先匹配完整路径，其次去掉前导`/`，最后匹配已明确登记的文件名。自动导入时同名外置素材会要求改用清单，避免选错。`.lottie`内置素材由原播放器解析。

帧范围为0至`totalFrames - 1`，区间起点不能晚于终点。视觉效果是否受支持仍取决于此固定版dotLottie播放器，插件不把After Effects原始工程编译成Lottie。

## 网页作品

引擎为`web-bundle@1`。将网页项目打成一个自包含JS入口，CSS可由入口创建；资源通过SDK获取。`scene.file`指定入口，`scriptType`可选`module`，`interactive:false`让作品不拦截点击。Blob入口不提供普通相对模块解析，外部模块须在构建时打包进去。

入口启动时可使用`globalThis.TavernVisualProject`：

```js
const project = TavernVisualProject;
const canvas = document.createElement('canvas');
project.root.append(canvas);
const textureURL = project.asset('images/grain.png');
project.onCommand(async (action, args) => {
  if (action === 'trigger' && args[0] === 'reveal') await renderer.reveal();
  else if (action === 'setInput') renderer.set(args[0], args[1]);
  else if (action === 'dispose') await renderer.dispose();
  else throw new Error(`作品不支持命令：${action}`);
});
project.ready(['trigger', 'setInput']);
```

`renderer`是作品自己的实现，内核不提供或替换美术。`project.asset(path)`返回当前容器内资源URL；`await project.bytes(path)`读取字节；`project.emit('complete', value)`发送声明事件；`project.signal`在关闭时中止。作品必须清理自己建立的计时器、WebGL对象和监听，SDK负责撤销其资源URL及移除iframe。

WebGL2、Canvas、CSS、SVG以及打包好的Pixi／Three等网页代码均可在这个容器中使用；是否具备某项GPU能力由当前浏览器及作品判断。运行中的作品不能直接读取宿主页面、聊天或存档。关闭等待作品回应，3秒仍无回应会移除容器，并在该会话运行情况中记`forcedClose:true`。

## Unity Web接口

引擎为`unity-web@1`，这里的1是接入协议版本，Unity运行时代码由作品自己的导出包提供。当前接入范围是`createUnityInstance`格式、未压缩、单线程、自包含资源的Web导出；不编译Unity编辑器工程，不宣称已经通过真实Unity成品验证。

配置示例：

```json
{
  "format": "tavern-visual-project",
  "schema": 1,
  "id": "unity-ui",
  "version": "1",
  "title": "Unity UI作品",
  "engine": { "id": "unity-web", "version": "1" },
  "scene": {
    "loader": "Build/ui.loader.js",
    "framework": "Build/ui.framework.js",
    "code": "Build/ui.wasm",
    "data": "Build/ui.data",
    "commands": {
      "play": { "object": "VisualBridge", "method": "Play" },
      "pause": { "object": "VisualBridge", "method": "Pause" }
    }
  },
  "inputs": [{ "id": "reveal", "type": "trigger", "object": "VisualBridge", "method": "Reveal" }],
  "events": ["progress", "complete"],
  "files": ["Build/ui.loader.js", "Build/ui.framework.js", "Build/ui.wasm", "Build/ui.data"]
}
```

作品内相应GameObject上的C#方法负责控制动画。`trigger`和不带参数的播放命令调用无参方法；数字和字符串直接交给`SendMessage`，布尔转0／1，颜色保持`#RRGGBB`。`setSegment`如有映射则发送`{"start":10,"end":20}`JSON字符串，`seek`发送帧数字。未声明播放／暂停方法就不显示为可用能力。

Unity的`.jslib`可通过以下桥把C#事件交给同一项目SDK：

```js
mergeInto(LibraryManager.library, {
  TavernVisualEmit: function (namePointer, valuePointer) {
    TavernVisualProject.emit(UTF8ToString(namePointer), JSON.parse(UTF8ToString(valuePointer)));
  }
});
```

关闭时等待`instance.Quit()`，采用同一隔离容器的清理期限。原始`.gz`／`.br`／`.unityweb`、多线程和独立StreamingAssets目录目前会明确拒绝，不能在缺少对应部署条件时显示“已支持”。导出时将Compression Format设为Disabled；其他Unity版本和特性等实际作品到位后追加验证。

## 播放器接口

由受信任的配套代码调用：

```js
TavernVisual.register({
  id: 'my-engine', version: '1.2.3', title: '我的播放器',
  load: () => import('./my-engine-provider.mjs'),
});
```

模块导出同步`mount({manifest,resources,target,signal,emit,fail})`，返回`{ready,capabilities,dispose,...commands}`。`ready`是加载Promise；`dispose`须可重复且等待清理；`resources`提供`blob(path)`、`bytes(path)`、`url(path)`；清理后核心撤销URL。加载失败拒绝`ready`，已播放后的失败调用`fail(error)`；只有清单中声明的`emit(name,value)`会到卡片。

播放器自己管理解码器、GPU、音频、后台暂停与缩放。一个引擎版本的模块按需共享，各作品保持独立会话。Spine未来沿此接口接入；当前没有登记、下载或捆绑Spine运行库。

## 接口依据

- [Rive Web JS](https://rive.app/docs/runtimes/web/web-js)，具体调用以随依赖2.44.2声明文件为准。
- [dotLottie Web官方源码](https://github.com/LottieFiles/dotlottie-web)，本包固定0.81.0。
- [Unity Web构建配置与交互](https://docs.unity3d.com/6000.0/Documentation/Manual/web-templates-build-configuration.html)，用于`createUnityInstance`、`SendMessage`和`Quit`。
- [Unity Web部署](https://docs.unity3d.com/cn/current/Manual/webgl-deploying.html)，用于压缩文件与HTTP头的边界。
