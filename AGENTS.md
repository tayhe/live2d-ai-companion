# AGENTS.md

## 项目

`live2d-ai-companion` — 一个 Python MCP Server，通过 WebSocket 调用 Live2DViewerEX 的 ExAPI，让 AI Agent（mimocode/openclaw/hermes）控制桌面 Live2D 模型的表情、动作、文字气泡、位置、特效。

## 关键事实（容易踩坑）

- **Python 环境**：项目用 `uv` 创建的 `.venv`，**不要**用系统 Python 或 `hermes-agent` 的 venv。命令用 `.venv\Scripts\python.exe` 绝对路径。
- **ExAPI 端口**：默认 10086。Live2DViewerEX 设置里可改，改后要重启 Live2DViewerEX 才生效。`config.yaml` 中的 `port` 要保持一致。
- **ExAPI 不返回响应**：大多数消息（display_text / set_expression / trigger_motion 等）Live2DViewerEX 不会回 ack。`exapi_client.py` 中 `send()` 默认 `wait_response=False`，超时等待会卡住。
- **表情/动作是模型相关的**：`config.yaml` 中的 `expressions` 和 `motions` 映射是当前模型的。**换模型必须改配置**。
- **Motion group 名称大小写敏感**：`"Tap"` 有效，`"tap"` 无效。
- **中性表情**：用 `expId: -1` 表示清除表情，需要查表后转 `clear_expression` (msg 13302)。

## 开发命令

```bash
# 安装依赖（首次）
uv venv && uv pip install -e .

# 启动 MCP Server
.venv\Scripts\python.exe -m src.server

# 测试 ExAPI 连接
.venv\Scripts\python.exe -c "import asyncio, json, websockets; asyncio.run(websockets.connect('ws://127.0.0.1:10086/api').close())"
```

## 调试新模型

拿到新模型后，按以下步骤填 `config.yaml`：

1. 测试 expId 0~N：每个切换后等 5 秒观察哪些有表情变化
2. 测试 motion group 名称：试 `Tap`、`Idle`、`TapBody`、`TapHead` 等常见名称，每个等 6 秒
3. 更新 `config.yaml` 的 `expressions` / `motions`
4. 重启 MCP Server

调试脚本模板：

```python
import asyncio, json, websockets

async def test():
    ws = await websockets.connect('ws://127.0.0.1:10086/api')
    # 测试一组 expId 或 motion 名称
    await ws.close()

asyncio.run(test())
```

## 扩展点

- TTS 语音：在 `say` 工具中加 TTS 调用，生成音频文件后用 ExAPI msg 13500 播放
- 模型事件监听：用 msg 10000 注册监听、msg 10002 接收回调（当前未实现）
- 多模型：扩展 `config.yaml` 支持按 model_index 分别配置映射
- 热更新：监听配置文件变化，重载映射表

## 文件地图

- `src/server.py` — MCP Server 入口，定义 5 个工具（say / set_expression / play_motion / set_position / set_effect）
- `src/exapi_client.py` — WebSocket 客户端，封装 6 个 ExAPI 调用
- `src/config.py` — 用 dataclass + yaml.safe_load 加载配置
- `config.yaml` — 表情/动作/特效的语义名称 → 原始参数映射表

## ExAPI 速查

| msg | 功能 | data 结构 |
|-----|------|-----------|
| 11000 | 显示文字气泡 | `{id, text, duration}` |
| 13200 | 触发动作 | `{id, type:0, mtn:"group"}` |
| 13300 | 设置表情 | `{id, expId}` |
| 13302 | 清除表情 | `id` |
| 13400 | 设置位置 | `{id, posX, posY}` |
| 13500 | 播放声音 | `{id, channel, volume, sound}` |
| 14000 | 设置特效 | effect_id |

## PinkFox 表情参数速查（已验证）

| 语义名 | exp_id | 参数 ID | 视觉效果 |
|--------|--------|---------|----------|
| happy/shy | 3 | key2 | 红脸 |
| dark_face | 4 | key3 | 黑脸 |
| sad | 5 | key4 | 眼泪 |
| nn_eyes | 6 | key5 | nn眼 |
| angry | 7 | key6 | 生气瘪嘴 |
| dead_fish | 8 | key7 | 死鱼眼 |
| squint | 9 | key8 | 咪咪眼 |
| cat_eyes/surprised | 0 | key9 | 猫猫眼 |
| pout | 11 | key12 | 嘟嘴 |
| love | 19 | key16 | 爱心 |
| teary | 17 | key17 | 泪眼 |
| money_eyes | 18 | key11 | 钱钱眼 |
| ears_off | 12 | key19 | 兽耳消失 |
| tail_off | 13 | key20 | 尾巴消失 |
| neutral | -1 | — | 清除表情 |

**嘴型**：3 参数复合 `ParamMouthOpenY` + `Tonguelicking` + `MouthBig2`(×0.6)

完整文档：https://live2d.pavostudio.com/doc/en-us/exapi/