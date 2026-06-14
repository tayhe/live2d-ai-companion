# AGENTS.md

## 项目

`live2d-ai-companion` — 一个 Python MCP Server + React 前端，让 AI Agent（mimocode/openclaw/hermes）控制桌面 Live2D 模型的表情、动作、文字气泡、位置、特效。Agent 是伴侣的核心（拥有记忆和人格），Live2D 是它的视觉化身。

## 关键事实（容易踩坑）

- **Python 环境**：项目用 `uv` 创建的 `.venv`，**不要**用系统 Python 或 `hermes-agent` 的 venv。命令用 `.venv\Scripts\python.exe` 绝对路径。
- **PushServer 端口**：默认 10086。`config.yaml` 中的 `port` 要保持一致。前端硬编码 `ws://localhost:10086`。
- **MCP 事件循环**：`mcp.run()` 管理自己的事件循环。PushServer 必须在模块加载时通过 daemon thread 立即启动，不能懒加载。
- **表情/动作是模型相关的**：`config.yaml` 中的 `expressions` 和 `motions` 映射是当前模型的。**换模型必须改配置和前端 EXPRESSIONS 字典**。
- **PinkFox 表情参数是二值开关**：`setParameterValueById(paramId, 0或1)`，不是连续值。
- **PinkFox 嘴型是 3 参数复合**：`ParamMouthOpenY` + `Tonguelicking` + `MouthBig2`(×0.6)，单独设一个不够。
- **PIXI ticker 必须每帧写入**：包括值为 0 时。否则 idle motion 会覆盖，导致嘴闭不上或表情不清。
- **`model.expression()` 在 PinkFox 上无效**：`internalModel.expressionManager` 不存在，不会发起 .exp3.json 请求。必须用 `setParameterValueById`。

## 开发命令

```bash
# 后端：安装依赖（首次）
uv venv && uv pip install -e .

# 后端：启动 MCP Server（同时启动 PushServer）
.venv\Scripts\python.exe -m src.server

# 前端：安装依赖（首次）
cd frontend && npm install

# 前端：启动开发服务器
cd frontend && npm run dev

# 前端：构建
cd frontend && npm run build

# 前端：lint
cd frontend && npm run lint
```

## 文件地图

- `src/server.py` — MCP Server 入口，定义 6 个工具（say / set_expression / say_and_express / play_motion / set_position / set_effect）
- `src/push_server.py` — WebSocket 服务器，向前端广播命令
- `src/config.py` — 用 dataclass + yaml.safe_load 加载配置
- `config.yaml` — 表情/动作/特效的语义名称 → exp_id 映射表
- `frontend/src/components/Live2DModel.jsx` — Live2D 渲染核心（pixi-live2d-display）
- `frontend/src/components/DialogueBox.jsx` — 文字气泡组件
- `frontend/src/api/ws.js` — WebSocket 客户端，接收 PushServer 命令
- `frontend/src/App.jsx` — 主应用，连接 WebSocket 和组件
- `frontend/public/libs/live2dcubismcore.min.js` — Cubism SDK Core
- `frontend/public/models/` — Live2D 模型文件（PinkFox、Hiyori、Haru）

## PinkFox 表情参数速查（基于 .cdi3.json 权威名称）

视觉名称必须以 `PinkFox.cdi3.json` 为准，`.exp3.json` 文件名后缀仅决定 exp_id→key 的映射，不决定视觉效果。`EXPRESSIONS` 字典在 `frontend/src/components/Live2DModel.jsx`，`config.yaml` 的 `expressions:` 段做语义名→exp_id 映射。换模型必须两边都改。

| exp_id | 参数 ID | 视觉效果 | 语义名 |
|--------|---------|----------|--------|
| 0 | key9 | 猫猫眼 | surprised, cat_eyes |
| 1 | key1 | 发型1 | — |
| 2 | key18 | 发型2 | — |
| 3 | key2 | 吐舌 | — |
| 4 | key3 | 黑脸 | dark_face |
| 5 | key4 | 眼泪 | sad |
| 6 | key5 | 脸红 | happy, shy |
| 7 | key6 | nn眼 | nn_eyes |
| 8 | key7 | 生气瘪嘴 | angry |
| 9 | key8 | 死鱼眼 | dead_fish, squint |
| 10 | key13 | 总督 | — |
| 11 | key12 | 钱钱 | money_eyes |
| 12 | key19 | 兽耳消失 | ears_off |
| 13 | key20 | 尾巴消失 | tail_off |
| 14 | key10 | --眼 | — |
| 15 | key14 | 提督 | — |
| 16 | key15 | 舰长 | — |
| 17 | key17 | 泪眼 | teary |
| 18 | key11 | 嘟嘴 | pout |
| 19 | key16 | 爱心 | love |
| -1 | — | 清除表情 | neutral |

**嘴型**：3 参数复合 `ParamMouthOpenY` + `Tonguelicking` + `MouthBig2`(×0.6)

## WebSocket 协议

前端连接 `ws://localhost:10086`，接收 JSON 命令：

| type | 字段 | 说明 |
|------|------|------|
| `display_text` | text, duration, model | 显示文字气泡 |
| `set_expression` | exp_id, model | 设置表情 |
| `clear_expression` | model | 清除表情 |
| `trigger_motion` | motion, model | 播放动作 |
| `set_position` | x, y, model | 设置位置 |
| `set_effect` | effect_id | 设置特效 |
| `set_mouth_open` | value | 控制嘴型（float 0.0=闭，1.0=张开） |

## 调试新模型

拿到新模型后，按以下步骤填 `config.yaml`：

1. 将模型文件放入 `frontend/public/models/<模型名>/`
2. 检查 .model3.json 中的 Motions 定义
3. 检查 .exp3.json 文件中的 ParamId（每个文件对应一个参数）
4. 更新 `config.yaml` 的 `expressions` 映射
5. 更新 `frontend/src/components/Live2DModel.jsx` 的 `EXPRESSIONS` 字典
6. 重启 MCP Server 和前端

调试脚本模板（通过 PushServer 直接测试）：

```python
import asyncio, websockets, json

async def test():
    async with websockets.connect('ws://127.0.0.1:10086') as ws:
        await ws.send(json.dumps({'type': 'set_expression', 'model': 0, 'exp_id': 3}))
        print('sent exp_id=3')
        await asyncio.sleep(5)

asyncio.run(test())
```

## 扩展点

- TTS 语音：在 `say` 工具中加 TTS 调用，生成音频后通过 WebSocket 推送到前端播放
- 口型同步：用 `wlipsync` 库分析音频，实时写入 `ParamMouthOpenY` 等参数
- 点击交互：前端监听 canvas 点击事件，回调到 agent
- 桌面悬浮窗：用 Electron/Tauri 包装前端，实现桌面原生窗口
- 多模型：扩展 `config.yaml` 支持按 model_index 分别配置映射
- 热更新：监听配置文件变化，重载映射表

## 参考

- [pixi-live2d-display 文档](https://guansss.github.io/pixi-live2d-display/)
- [Live2D Cubism SDK](https://www.live2d.com/en/sdk/download/native/)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [nana 项目](https://github.com/艾拉)（参考实现，FastAPI + React 架构）
