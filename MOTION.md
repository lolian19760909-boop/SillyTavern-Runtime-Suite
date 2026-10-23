# 界面动效

启用视觉模块后，`window.TavernMotion` 为页面提供基于浏览器 WAAPI 的动效。0.4.0 使用 API 1，新增能力通过 `features` 检测。颜色、字体、素材和业务规则由页面保留。

## 挂载与结束

```js
const motion = window.TavernMotion;
if (!motion?.features?.includes('navigation')) {
  // 继续使用页面原来的显示逻辑；在扩展管理器更新套件后刷新。
}
const scope = motion.mount(root, {
  profile: () => ({ theme: 'crisp', level: 'high' }),
  keyboard: () => usingKeyboard,
});
// 根容器移除、替换或 iframe 关闭前调用。
scope.dispose();
```

同一个根容器只能挂载一次。不同面板可以有独立作用域；关闭页面时销毁其全部作用域。`connectCard` 客户端也接受 `motionOptions`，并在 `pagehide` 清理。

`theme` 为 `crisp`、`cut` 或 `quiet`，分别使用清晰移动、较短节奏、轻柔移动。`level` 为 `high`、`medium` 或 `low`。普通入场约 160–220 ms，退出约 120–160 ms；中档减小位移，低档即时显示。系统减少动态、`keyboard()` 返回 true 或页面进入后台也会直接收束。偏好变化后调用 `scope.finish()`；不改动页面的颜色和字号。

## 页面之间连续切换

```js
const from = scope.capture(previous); // 在原页面被隐藏之前记录
renderRoute(nextId);                  // 原有状态更新立即执行
void scope.navigate(previous, next, {
  from,
  container: workspace,
  direction: goingBack ? -1 : 1,
});
```

两个页面须属于同一作用域，`container` 是共同布局容器。退出页面短暂保留并禁止交互，结束后隐藏；新页面立刻可用。反向切换取当前帧作为起点，旧请求的完成回调不会覆盖最后的选择。已有输入框、媒体和 iframe 使用原节点。

## 浮层与内容替换

```js
dialog.showModal();
void scope.presence(dialog, true, { distance: 8 });
// 关闭原生 dialog 前保留退出过程。
await scope.presence(dialog, false);
dialog.close();
dialog.hidden = false; // 让下一次 showModal 可正常显示

// mutate 同步执行；业务提交不要放进动画完成回调。
void scope.update(detail, () => renderSelectedItem(), { direction: 1 });
```

`presence` 在最后一次退出完成后才设置 `hidden`；重新打开可以中断退出。若页面自己的逻辑提前改变了 `hidden`，先 `capture(element)`，再把记录作为 `from` 传入。原有变换和交互状态在结束后恢复。调用方延迟关闭或删除原生浮层时，也应核对该次操作仍有效，避免关闭后来重新打开的窗口。

`update` 对小型纯显示内容保留一张短暂的 DOM 显示副本。副本放在封闭的 Shadow DOM 中、对辅助技术隐藏且不可交互，页面查询只会读到真实内容。含输入框、媒体、iframe、Shadow DOM 或 64 个以上后代节点时只播放新内容入场；不复制它们的运行状态。大页面使用 `navigate` 保留原节点。

## 布局与反馈

```js
void scope.layout([underline], () => positionUnderline(activeTab));
void scope.feedback(button, 'press');
void scope.feedback(savedNotice, 'success');
void scope.animate(panel, frames, {
  channel: 'detail', duration: 180,
});
```

同一个元素、同一通道的新动画会接替旧动画。不同元素或通道独立管理；不要让两个通道同时控制同一元素的同一个 CSS 属性。`layout` 批量读取前后布局，并用变换过渡到新位置。

`scope.diagnostics()` 返回活动动画数、过渡数、完成／打断计数及最近切页耗时；`TavernMotion.diagnostics()` 汇总作用域与活动动画。页面静止后活动数应归零，移除根容器后作用域应释放。切页耗时是动画生命周期测量，不等同于 GPU 渲染时间或设备帧率。
