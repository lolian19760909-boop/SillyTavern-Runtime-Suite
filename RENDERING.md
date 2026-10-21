# 消息渲染与格式扩展

视觉模块提供消息显示、状态界面和显示生命周期管理。在视觉设置中勾选“为当前角色启用通用消息渲染”，选择按角色保存；关闭后恢复宿主显示。卡作者可注册适配器，定制消息的显示方式。

渲染器读取酒馆的聊天记录，更新 `.mes_text` 内的显示容器；消息编辑、重抽和存档通过酒馆原有操作完成。打开编辑器时，渲染器释放该消息的显示容器。切换聊天、删除消息、重绘或关闭模块时，也会释放旧显示并取消失效的异步任务。

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
// 卡脚本卸载时解除注册。
unregister();
```

`render` 可返回 DOM 节点或 `{content, dispose}`，也可异步返回；`signal` 随对应消息失效而中止。`mounted` 可接入已经挂载的交互组件。渲染函数负责显示，聊天保存和分支修改由对应业务操作处理。

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

格式实现由已安装扩展或已启用卡脚本登记。HTML 与 Markdown 经宿主提供的 DOMPurify 清理；`host` 使用宿主已经清理的结果。

## 状态与诊断

适配器可通过 `status({ state, title, description, detail, action, actionLabel })` 创建状态界面。`state` 默认为 `loading`，错误时传 `error`；`detail` 提供可展开的原因，`action` 与 `actionLabel` 定义操作及按钮文字。正文就绪后调用 `messages.refresh([floor])`，渲染器会重新读取并显示内容。

加载标记随等待状态显示，正文就绪后移除。系统或套件开启“减少动态”时，加载标记保持静止。

`messages.diagnostics()` 返回适配器、格式、挂载数量、渲染次数、失效任务数量及错误信息。
