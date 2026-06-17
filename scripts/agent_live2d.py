#!/usr/bin/env python3
"""
Agent Live2D 集成脚本：
- 监听 PushServer 的触摸事件
- 调用 openclaw agent 获取回复
- 将回复显示到 Live2D

用法：
  python scripts/agent_live2d.py                    # 交互模式
  python scripts/agent_live2d.py "你的消息"          # 单次模式
  python scripts/agent_live2d.py --touch             # 触摸监听模式
"""

import asyncio
import json
import re
import subprocess
import sys
import websockets

PUSHSERVER_URL = "ws://127.0.0.1:10086"


def strip_ansi(text: str) -> str:
    """移除 ANSI 颜色代码"""
    return re.sub(r'\x1b\[[0-9;]*m', '', text)


async def send_to_live2d(text: str, expression: str = "happy"):
    """发送文字和表情到 Live2D"""
    expressions = {
        "happy": 6, "sad": 5, "angry": 8, "surprised": 0,
        "love": 19, "shy": 6, "pout": 18, "squint": 9,
        "dead_fish": 9, "nn_eyes": 7, "dark_face": 4,
        "money_eyes": 11, "teary": 17, "cat_eyes": 0, "neutral": -1,
    }
    exp_id = expressions.get(expression, 6)
    
    async with websockets.connect(PUSHSERVER_URL) as ws:
        await ws.send(json.dumps({
            "type": "display_text",
            "model": 0,
            "text": text,
            "duration": 10000,
        }))
        if exp_id != -1:
            await ws.send(json.dumps({
                "type": "set_expression",
                "model": 0,
                "exp_id": exp_id,
            }))
        print(f"[Live2D] 显示: {text[:50]}... 表情: {expression}")


def call_agent(message: str) -> str:
    """调用 openclaw agent 获取回复"""
    cmd = [
        "openclaw", "agent",
        "-m", message,
        "--agent", "vivian",
        "--local",
        "--timeout", "60",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    lines = result.stdout.strip().split('\n')
    reply_lines = []
    for line in lines:
        clean_line = strip_ansi(line)
        if clean_line.startswith('[') or not clean_line.strip():
            continue
        reply_lines.append(clean_line)
    return '\n'.join(reply_lines).strip()


def choose_expression(text: str) -> str:
    """根据回复内容选择表情"""
    if any(w in text for w in ["哼", "才不是", "笨蛋", "讨厌"]):
        return "pout"
    elif any(w in text for w in ["开心", "高兴", "嘻嘻", "喜欢"]):
        return "happy"
    elif any(w in text for w in ["难过", "伤心", "抱歉", "对不起"]):
        return "sad"
    elif any(w in text for w in ["生气", "烦", "滚"]):
        return "angry"
    elif any(w in text for w in ["惊讶", "诶", "啊", "不会吧"]):
        return "surprised"
    elif any(w in text for w in ["爱", "感动", "谢谢"]):
        return "love"
    elif any(w in text for w in ["害羞", "脸红", "不好意思"]):
        return "shy"
    elif any(w in text for w in ["得意", "哼哼", "厉害"]):
        return "squint"
    elif any(w in text for w in ["无语", "服了", "算了"]):
        return "dead_fish"
    elif any(w in text for w in ["不懂", "什么", "为什么"]):
        return "nn_eyes"
    else:
        return "happy"


async def handle_touch(area: str):
    """处理触摸事件"""
    touch_prompts = {
        "head": "用户摸了我的头",
        "face": "用户戳了我的脸",
        "body": "用户碰了我的身体",
    }
    prompt = touch_prompts.get(area, f"用户触摸了{area}")
    print(f"\n[Touch] {prompt}")
    
    reply = call_agent(prompt)
    if reply:
        expression = choose_expression(reply)
        print(f"Agent: {reply}")
        await send_to_live2d(reply, expression)


async def interactive_mode():
    """交互模式"""
    print("=" * 50)
    print("Live2D Agent 交互模式")
    print("输入消息，agent 会回复并显示在 Live2D 上")
    print("输入 'quit' 退出")
    print("=" * 50)
    
    while True:
        try:
            user_input = input("\n你: ").strip()
            if not user_input:
                continue
            if user_input.lower() == "quit":
                print("再见！")
                break
            
            print("正在调用 agent...")
            reply = call_agent(user_input)
            if reply:
                expression = choose_expression(reply)
                print(f"Agent: {reply}")
                await send_to_live2d(reply, expression)
            else:
                print("Agent 没有回复")
                
        except EOFError:
            print("\n再见！")
            break
        except KeyboardInterrupt:
            print("\n再见！")
            break
        except Exception as e:
            print(f"错误: {e}")
            break


async def single_mode(message: str):
    """单次模式"""
    print(f"你: {message}")
    print("正在调用 agent...")
    reply = call_agent(message)
    if reply:
        expression = choose_expression(reply)
        print(f"Agent: {reply}")
        await send_to_live2d(reply, expression)
    else:
        print("Agent 没有回复")


async def touch_mode():
    """触摸监听模式"""
    print("=" * 50)
    print("Live2D 触摸监听模式")
    print("等待用户触摸 Live2D 模型...")
    print("按 Ctrl+C 退出")
    print("=" * 50)
    
    async with websockets.connect(PUSHSERVER_URL) as ws:
        while True:
            try:
                msg = await ws.recv()
                data = json.loads(msg)
                if data.get("type") == "touch":
                    area = data.get("area", "body")
                    await handle_touch(area)
            except websockets.ConnectionClosed:
                print("连接断开，重新连接...")
                await asyncio.sleep(2)
                break
            except Exception as e:
                print(f"错误: {e}")


async def main():
    if len(sys.argv) > 1:
        if sys.argv[1] == "--touch":
            await touch_mode()
        else:
            message = " ".join(sys.argv[1:])
            await single_mode(message)
    else:
        await interactive_mode()


if __name__ == "__main__":
    asyncio.run(main())
