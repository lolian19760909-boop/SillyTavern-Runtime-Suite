# 消息渲染与格式扩展

0.3.0 的视觉模块接管已适配消息的 DOM 显示、状态界面和显示生命周期。东京都2051 默认接入。其他角色在视觉设置中勾选“为当前角色启用通用消息渲染”，选择按角色保存；关闭后恢复宿主显示。

酒馆继续负责聊天记录、分支、消息编辑、重抽和存档。渲染器只读这些数据，更新 `.mes_text` 内自己的显示容器；检测到编辑器时让出该消息。聊天切换、删除、重绘、关闭模块都会释放旧显示，异步返回不能覆盖另一个分支或正在编辑的内容。

## 接入一张卡

```js
const messages = window.TavernVisual.messages;
const unregister = messages.register({
  id: 'my-card', priority: 100,
  matches: ({ character, row }) => character === myAvatar && !row.is_system,
  // 依赖额外显示状态时返回其版本，变化后调用 messages.refresh([floor])。
  revision: ({ floor }) => myReadOnlyState(floor).revision,
  classPrefixes: ['my-card-'],
  render({ raw, row, floor, format, status, signal }) {
    if (!myReadOnlyState(floor).ready) {
      return status({ title: '正在准备正文', description: '读好后会自动显示。' });
    }
    return format('host', raw, { floor, name: row.name, isUser: row.is_user });
  }
});
// 卡脚本卸载时解除；不要在渲染函数里保存聊天或修改分支。
unregister();
```

`render` 可返回 DOM 节点或 `{content, dispose}`，也可异步返回；`signal` 随对应消息失效而中止。`mounted` 可接入已经挂载的交互组件。现有视觉作品容器、状态栏和卡内选择继续使用原来的接口。

宿主可能将消息类名变成 `custom-xxx`。`classPrefixes` 只为卡明确声明的前缀补回原类名，保留宿主类名和清理后的属性。加载和错误界面由套件直接创建，不经过消息格式改写。

## 三种格式与新格式

| 格式 | 处理 |
| --- | --- |
| `host` | 使用宿主格式函数，保留原有正则、Markdown、宏与其他扩展显示链 |
| `markdown` | 套件直接调用 Markdown 转换与 HTML 清理，不经过酒馆消息格式链 |
| `text` | 纯文字节点，保留字符，不解释标签 |

```js
const removeFormat = messages.registerFormat('poem', source => {
  const poem = document.createElement('p');
  poem.style.whiteSpace = 'pre-wrap';
  poem.textContent = source;
  return poem;
});
// 在适配器 render 中 return format('poem', raw)。
```

格式实现由已安装扩展或已启用卡脚本登记。模型输出的格式名称不会下载或执行代码。HTML 与 Markdown 经宿主提供的 DOMPurify 清理；`host` 沿原清理结果。

## 东京都2051 的本轮接管

本卡的正文和玩家消息由套件挂载。正文来源、镜译读本、对白与变量标签判断仍由卡内共享解析器提供；待核对时显示套件加载状态，失败可重读，成功后换成正文。状态栏、选项与既有交互继续接入同一 DOM。普通卡默认保持原显示，手动启用后由通用适配器挂载。

本版在接管 DOM 的同时保留 `host` 格式作为本卡的兼容路径，避免丢失已有正则和镜译显示链。独立 `markdown` / `text` 和登记接口已可用。彻底移除本卡对宿主格式函数的依赖，需要逐项迁移原正则、宏及第三方显示链；这是下一阶段，不能将本版称为替换全部酒馆渲染。

## 动效、诊断与后续

加载标记只表达正在等待，正文就绪后立即移除。系统或套件“减少动态”设置下保持静止。`messages.diagnostics()` 返回适配器、格式、挂载数量、渲染次数、迟到丢弃及错误，不导出聊天正文。

后续可在同一格式接口加入代码高亮、数学、图表与交互场景，也可将已有 GPU、Rive、Lottie 作品组合到消息适配器。每项需要对应素材和可运行示例，不把扩展接口当成已经实现的播放器。

设计参考 [Impeccable Skill 4.7.0](https://github.com/pbakaus/impeccable/releases/tag/skill-v4.7.0)：以实际页面检查排版、可见状态、动效与浏览器适配，减少装饰性说明。本轮没有把其 CLI、遥测或安装钩子加入玩家插件。
