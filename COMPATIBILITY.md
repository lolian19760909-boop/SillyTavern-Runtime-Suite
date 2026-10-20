# 数据库兼容与记忆模式

Tavern Runtime Suite 通过记忆模式协调摘要与数据库，让一次生成沿明确的记忆流程执行。

## 模式选择

| 模式 | 行为 |
|---|---|
| 自动（默认） | 检测到数据库公开 API 时使用数据库模式，其余情况使用套件摘要 |
| 套件摘要 | 根据消息来源、保存状态和近期轮次整理旧对话 |
| 数据库 | 数据库负责填表、长期记忆、召回与注入；接口未就绪时提示启用数据库或切换模式 |

每轮开始时固定本轮模式，下一轮重新检测。关闭套件上下文模块后，数据库沿自身流程工作。

数据库模式让出套件摘要处理，原历史交由数据库与宿主选择。历史长度、填表范围和召回预算在数据库设置中管理。已有套件摘要继续保存，切回套件摘要后重新核对消息来源。

内置摘要适配普通单角色 Chat Completion 聊天。专用卡声明 `memoryModes: ['summary','database']`，在数据库分支执行自己的视角筛选。以2051适配为例，人物知情、玩家手记、数值与剧情状态继续由卡片维护。

## shujuku

内置适配通过 `window.AutoCardUpdaterAPI` 识别 [shujuku](https://github.com/AlbusKen/shujuku)。安装后在套件设置选择“自动”或“数据库”，并在数据库中配置模板、自动填表、召回与模型连接。

设置面板显示 API 可读的表格与记录数量；填表覆盖情况在数据库中查看。数据库自己的模型调用按其连接与预算设置执行。

### 接口依据

本版按提交 `df3f562af4d5e433005d0a91bf3223ad5c2fc9e0` 接入：

- [API 文档](https://github.com/AlbusKen/shujuku/blob/df3f562af4d5e433005d0a91bf3223ad5c2fc9e0/API_DOCUMENTATION.md)：公开入口为 `window.AutoCardUpdaterAPI`。
- [core-data-api.ts](https://github.com/AlbusKen/shujuku/blob/df3f562af4d5e433005d0a91bf3223ad5c2fc9e0/src/presentation/bootstrap/api-groups/core-data-api.ts)：`exportTableAsJson` 返回当前表对象的实时引用。套件只读统计数量，保持原对象内容。
- [callback-api.ts](https://github.com/AlbusKen/shujuku/blob/df3f562af4d5e433005d0a91bf3223ad5c2fc9e0/src/presentation/bootstrap/api-groups/callback-api.ts)：更新通知携带 `persisted` 状态；`false` 表示该通知尚未确认持久化。历史选择由数据库自身负责。
- [init.ts](https://github.com/AlbusKen/shujuku/blob/df3f562af4d5e433005d0a91bf3223ad5c2fc9e0/src/presentation/bootstrap/init.ts)：数据库在生成、用户消息和世界书装载阶段组织召回，独立辅助请求沿其原流程执行。
- [feature-policy.ts](https://github.com/AlbusKen/shujuku/blob/df3f562af4d5e433005d0a91bf3223ad5c2fc9e0/src/service/zero-layer/feature-policy.ts)：该提交关闭零层功能。启用零层的其他版本需要接入其逻辑历史接口。

## 接入其他数据库

扩展可注册同步的只读探测器：

```js
const unregister = TavernContext.registerDatabase({
  id: 'my-database',
  title: '我的数据库',
  probe() {
    if (!window.MyDatabase?.ready) return null;
    return { tables: window.MyDatabase.tableCount };
  }
});
// 扩展卸载时释放注册。
unregister();
```

## 角色卡适配

适配器的 `prepare` 和 `before` 接收 `request.memory`。当 `mode === 'database'` 时：

1. 完成角色卡自身必要的视角筛选。
2. 返回原生发送对象的有序子集，保留对象身份与消息顺序。
3. 将 `prompt` 留空，跳过套件摘要与摘要标记。
4. 让数据库辅助请求、表格和世界书沿自己的处理流程执行。

旧适配器在声明数据库模式后即可接入。自动检查覆盖模式切换、普通卡生成链、专用卡视角、只读表格与回调语义。整套接入的验收流程是：用目标模板生成一轮回复，检查填表结果、下一轮召回和实际提示中的人物视角。
