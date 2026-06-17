# Live2D AI Companion

通过 MCP 协议让 AI Agent（mimocode、openclaw、hermes）控制 Live2D 桌面模型的表情、动作、文字气泡、位置和特效，作为 agent 的视觉化身。

## 架构

```
用户（飞书） → openclaw gateway → vivian agent (LLM)
  │  调用 MCP 工具（say_and_express 等）
  ↓
MCP Server (Python, src/server.py)
  │  PushServer WebSocket 广播
  ↓
PushServer (ws://0.0.0.0:10086)
  │  WebSocket JSON 消息
  ↓
React Frontend (pixi-live2d-display)
  │  渲染 Live2D 模型 + UI 组件
  ↓
浏览器窗口（背景、粒子、模型、对话框、心情图标）
```

## 前置条件

- Python 3.10+（uv 管理 venv）
- Node.js 18+
- 支持 MCP 的 AI Agent（如 openclaw）

## 安装

### 后端（Python）

```bash
uv venv
uv pip install -e .
```

### 前端（React）

```bash
cd frontend
npm install
```

## 配置

编辑 `config.yaml`，根据你的 Live2D 模型调整表情和动作映射。

### 当前默认配置（PinkFox 模型）

```yaml
server:
  host: 0.0.0.0        # 监听所有接口（WSL/远程访问需要）
  port: 10086          # PushServer WebSocket 端口

model:
  index: 0             # 模型槽位，0-based

expressions:           # 语义名称 → exp_id（对应 frontend Live2DModel.jsx 的 EXPRESSIONS 字典）
  happy: 6             # 脸红 — 开心、害羞
  sad: 5               # 眼泪 — 伤心
  angry: 8             # 生气瘪嘴 — 生气
  surprised: 0         # 猫猫眼 — 惊讶
  love: 19             # 爱心 — 喜欢、感动
  shy: 6               # 脸红 — 害羞（同 happy）
  pout: 18             # 嘟嘴 — 委屈、撒娇
  squint: 9            # 死鱼眼 — 得意
  dead_fish: 9         # 死鱼眼 — 无语
  nn_eyes: 7           # nn眼 — 呆萌
  dark_face: 4         # 黑脸 — 尴尬
  money_eyes: 11       # 钱钱 — 期待
  teary: 17            # 泪眼 — 感动
  cat_eyes: 0          # 猫猫眼 — 惊讶（同 surprised）
  ears_off: 12         # 兽耳消失
  tail_off: 13         # 尾巴消失
  neutral: -1          # 清除表情

motions:               # 语义名称 → "group:index" 格式
  kuku: ":0"
  shake: ":1"

effects:
  rain: 100100
  snow: 100110

# 触摸反应配置
touch_reactions:
  head:
    text: ["别摸我头啦！", "呜...头发会乱的..."]
    expression: "pout"
    motion: "TapBody"
  face:
    text: ["别戳我脸！", "你、你在干什么啦！"]
    expression: "shy"
    motion: "TapBody"
  body:
    text: ["别碰那里！", "呀！"]
    expression: "angry"
    motion: "TapBody"
```

### 换模型

1. 将模型文件放入 `frontend/public/models/<模型名>/`
2. 修改 `frontend/src/components/Live2DModel.jsx` 中的 `MODEL_PATH` 和 `EXPRESSIONS` 字典
3. 更新 `config.yaml` 的 `expressions` 映射
4. **检查 `.model3.json` 的 `EyeBlink.Ids`**：必须包含眨眼参数，否则眼睛不会眨
5. 重启 MCP Server 和前端

## 使用

### 1. 启动 PushServer（持续运行）

```bash
python scripts/push_server.py
```

### 2. 启动前端

```bash
cd frontend
npm run dev
```

前端会在 `http://localhost:5173` 启动，自动连接 PushServer。

### 3. 在 openclaw 中配置 MCP

在 `~/.openclaw/openclaw.json` 中注册 MCP Server：

```json
{
  "mcp": {
    "servers": {
      "live2d": {
        "command": "/path/to/.venv/bin/python",
        "args": ["-m", "src.server"],
        "cwd": "/path/to/live2d-ai-companion",
        "supportsParallelToolCalls": true
      }
    }
  }
}
```

### 4. 配置 Agent 工具权限

**必须**在 agent 配置中显式列出 MCP 工具名，否则 agent 上下文中不会加载工具：

```json
{
  "agents": {
    "list": [
      {
        "id": "vivian",
        "tools": {
          "allow": [
            "live2d__say",
            "live2d__set_expression",
            "live2d__say_and_express",
            "live2d__play_motion",
            "live2d__set_position",
            "live2d__set_effect",
            "live2d__check_touch",
            "live2d__check_logs"
          ]
        }
      }
    ]
  }
}
```

> 通配符 `live2d__*` 无效，必须列出每个工具全名。

### 5. Agent 工作流

Agent 的 SOUL.md 应包含：

```
⚠️ 每次回复用户时，必须调用 `live2d__say_and_express` 工具，
并将工具返回值直接作为回复内容。不要额外输出文字。
```

`say_and_express` 返回原始文本，agent 将其作为渠道回复，确保浏览器和飞书显示同一句话。

### 6. 调用工具

Agent 可以调用以下 MCP 工具：

| 工具 | 功能 | 参数 |
|------|------|------|
| `say` | 说话（显示文字气泡） | `text: str`, `duration?: int` (默认 3000ms) |
| `set_expression` | 设置表情 | `expression: str` (语义名称) |
| `say_and_express` | **说话+表情（推荐）** | `text: str`, `expression?: str` (默认 "happy"), `duration?: int` |
| `play_motion` | 播放动作 | `motion: str` (语义名称) |
| `set_position` | 移动位置 | `x: int`, `y: int` |
| `set_effect` | 设置特效 | `effect: str` (语义名称) |
| `check_touch` | 检查触摸事件 | 无 |
| `check_logs` | 读取前端日志 | 无 |

使用示例（agent 视角）：

```
# 最常用：说话+表情
say_and_express("你好呀~", "happy")
say_and_express("哼，才不是担心你呢...", "pout")

# 单独控制
set_expression("surprised")
play_motion("shake")
set_position(500, 300)
set_effect("rain")
```

## 项目结构

```
live2d-ai-companion/
├── src/
│   ├── server.py           # MCP Server 入口，定义 8 个工具
│   ├── push_server.py      # WebSocket 服务器，向前端推送命令
│   └── config.py           # 配置加载与验证
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Live2DModel.jsx       # Live2D 渲染核心
│   │   │   ├── DialogueBox.jsx       # 文字气泡 + 输入栏
│   │   │   ├── MoodIndicator.jsx     # 左上角心情 emoji
│   │   │   ├── MoodOverlay.jsx       # 全屏情绪叠层
│   │   │   ├── Particles.jsx         # 浮动粒子效果
│   │   │   ├── Background.jsx        # 时间段背景切换
│   │   │   ├── TouchRipple.jsx       # 点击涟漪特效
│   │   │   ├── QuickReplies.jsx      # 快捷回复按钮
│   │   │   └── DialogueHistory.jsx   # 对话历史面板
│   │   ├── utils/
│   │   │   └── timeOfDay.js          # 时间段判断
│   │   ├── api/
│   │   │   └── ws.js                 # WebSocket 客户端
│   │   ├── App.jsx                   # 主应用
│   │   └── App.css                   # 全局样式
│   ├── public/
│   │   ├── libs/
│   │   │   └── live2dcubismcore.min.js
│   │   ├── models/                   # Live2D 模型文件
│   │   │   ├── PinkFox/              # 当前默认模型
│   │   │   ├── Hiyori/
│   │   │   └── Haru/
│   │   └── backgrounds/              # 背景图片
│   └── package.json
├── scripts/
│   ├── push_server.py                # 独立 PushServer
│   └── agent_live2d.py               # Agent 集成测试脚本
├── config.yaml                       # 模型表情/动作映射配置
├── pyproject.toml
├── AGENTS.md                         # 详细开发文档
└── README.md
```

## 核心实现细节

### 渲染管线（重要）

由于后台标签页中 Chrome 会将 `requestAnimationFrame` 节流到 0fps，本项目使用 `setInterval` 驱动更新：

```js
model.autoUpdate = false  // 禁用 PIXI ticker 自动更新

setInterval(() => {
  im.update(dt, elapsed)           // 驱动 Cubism 全管线
  // 写入表情/嘴型参数（必须在 update 之后）
  c.setParameterValueById(...)
  // 渲染
  app.renderer.render(app.stage)
}, 16)
```

详见 `AGENTS.md` 的"Live2D 渲染管线"章节。

### PushServer (`src/push_server.py`)

- WebSocket 服务器，监听 `ws://0.0.0.0:10086`
- 接收 MCP 工具调用，广播命令到所有连接的前端
- 支持触摸事件回调（head/face/body 区域自动触发反应）

### 前端 UI 组件

| 组件 | 功能 |
|------|------|
| MoodIndicator | 左上角心情 emoji + 标签，随表情变化 |
| MoodOverlay | 全屏情绪叠层（暖黄/粉红/蓝/红） |
| Vignette | 暗角效果 |
| Particles | 浮动粒子（樱花/星光/萤火虫，按时间段） |
| Background | 按时间段切换背景图 |
| TouchRipple | 点击模型时的涟漪特效 |
| RimLight | 角色背光，随表情变色 |
| QuickReplies | 快捷回复按钮 |
| DialogueHistory | 对话历史面板（H/Escape 切换） |
| Debug | 按 D 键切换调试模式 |

### WebSocket 协议

前端连接 `ws://localhost:10086`，接收 JSON 命令：

| type | 字段 | 说明 |
|------|------|------|
| `display_text` | text, duration, model | 显示文字气泡 |
| `set_expression` | exp_id, model | 设置表情 |
| `clear_expression` | model | 清除表情 |
| `trigger_motion` | motion, model | 播放动作 |
| `set_position` | x, y, model | 设置位置 |
| `set_effect` | effect_id | 设置特效 |
| `set_mouth_open` | value | 控制嘴型 |
| `quick_replies` | options | 显示快捷回复按钮 |
| `reload` | — | 前端重新加载页面 |

## PinkFox 表情参数速查

| exp_id | 参数 ID | 视觉效果 | 语义名 |
|--------|---------|----------|--------|
| 0 | key9 | 猫猫眼 | surprised, cat_eyes |
| 3 | key2 | 吐舌 | tongue |
| 4 | key3 | 黑脸 | dark_face |
| 5 | key4 | 眼泪 | sad |
| 6 | key5 | 脸红 | happy, shy |
| 7 | key6 | nn眼 | nn_eyes |
| 8 | key7 | 生气瘪嘴 | angry |
| 9 | key8 | 死鱼眼 | dead_fish, squint |
| 11 | key12 | 钱钱 | money_eyes |
| 14 | key10 | 咪咪眼 | squint2 |
| 17 | key17 | 泪眼 | teary |
| 18 | key11 | 嘟嘴 | pout |
| 19 | key16 | 爱心 | love |
| -1 | — | 清除表情 | neutral |

**嘴型**：PinkFox 使用 3 参数复合嘴型 `ParamMouthOpenY` + `Tonguelicking` + `MouthBig2`(×0.6)

## 后续计划

- [x] Agent 根据情感自动选择表情（通过 MCP instructions + say_and_express 工具）
- [x] 点击交互（触摸模型不同区域触发不同反应）
- [x] 心情指示器 + 情绪叠层 + 暗角 + 粒子 + 背景切换
- [x] 快捷回复 + 对话历史 + 聊天输入框
- [x] openclaw 飞书渠道集成（agent → MCP → PushServer → 浏览器）
- [ ] ConfigPanel 设置面板
- [ ] TTS 语音合成 → 嘴型自动同步（wlipsync）
- [ ] 桌面悬浮窗模式（Electron/Tauri）
- [ ] 多模型切换
- [ ] 热更新配置（无需重启）

## 参考

- [pixi-live2d-display 文档](https://guansss.github.io/pixi-live2d-display/)
- [Live2D Cubism SDK](https://www.live2d.com/en/sdk/download/native/)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [Project AIRI](https://github.com/moeru-ai/airi) — 自托管 AI 伴侣项目，支持 Live2D/VRM、实时语音、Minecraft/Factorio 游戏，41k stars
- [nana 项目](https://github.com/mewamew/nana)（参考实现，FastAPI + React 架构）
