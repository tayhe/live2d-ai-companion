import asyncio
import logging
import random
import threading
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from src.config import load_config
from src.push_server import PushServer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

config = load_config(Path(__file__).parent.parent / "config.yaml")
push = PushServer(config.server.host, config.server.port)


async def _handle_touch(area: str) -> None:
    """自动触摸反应：收到触摸事件时触发文字+表情+动作"""
    reaction = config.touch_reactions.get(area)
    if not reaction:
        return

    text = random.choice(reaction.text) if reaction.text else None
    exp_id = config.expressions.get(reaction.expression)
    motion = config.motions.get(reaction.motion)

    if text:
        await push.display_text(config.model.index, text, 3000)
    if exp_id is not None and exp_id != -1:
        await push.set_expression(config.model.index, exp_id)
    if motion:
        await push.trigger_motion(config.model.index, motion)

    logger.info("Touch reaction: area=%s text=%s expr=%s motion=%s",
                area, text, reaction.expression, reaction.motion)


push.set_touch_handler(_handle_touch)


def _start_push_in_thread() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(push.start())
    loop.run_forever()


threading.Thread(target=_start_push_in_thread, daemon=True).start()

mcp = FastMCP(
    "live2d-companion",
    instructions=(
        "Live2D 桌面伴侣控制工具。你有一个 Live2D 虚拟形象（PinkFox），它是你的视觉化身。\n"
        "每次回复用户时，根据你的情绪和回复内容，自然地选择合适的表情。\n"
        "表情会在 8 秒后自动清除，所以不需要手动清理。\n\n"
        "可用表情及使用场景：\n"
        "  happy — 开心、高兴、正面回应\n"
        "  sad — 伤心、难过、同情\n"
        "  angry — 生气、不满、警告\n"
        "  surprised — 惊讶、好奇、意外\n"
        "  love — 喜欢、感动、感谢\n"
        "  shy — 害羞、不好意思（同 happy）\n"
        "  pout — 委屈、撒娇、傲娇\n"
        "  squint — 得意、满足、自信\n"
        "  dead_fish — 无语、无奈、吐槽\n"
        "  nn_eyes — 呆萌、困惑\n"
        "  dark_face — 尴尬\n"
        "  money_eyes — 期待、贪财\n"
        "  teary — 感动、委屈\n"
        "  cat_eyes — 惊讶、好奇\n"
        "  neutral — 清除表情，恢复默认\n\n"
        "用户触摸角色时（摸头/摸脸/戳身体），服务器会自动触发反应。\n"
        "你也可以用 check_touch() 检查触摸事件并做出更个性化的回应。\n\n"
        "推荐使用 say_and_express 工具，它会同时显示文字和切换表情，一次调用完成两件事。"
    ),
)


@mcp.tool()
async def say(text: str, duration: int = 3000) -> str:
    """让 Live2D 角色说话，显示文字气泡。

    Args:
        text: 要显示的文字内容
        duration: 气泡显示时长（毫秒），默认 3000
    """
    await push.display_text(config.model.index, text, duration)
    return f"已显示文字：{text}"


@mcp.tool()
async def set_expression(expression: str) -> str:
    """设置 Live2D 角色的表情。根据你的回复内容选择合适的情绪。

    Args:
        expression: 表情名称。可用：
            happy(开心), sad(伤心), angry(生气), surprised(惊讶),
            love(喜欢/感动), shy(害羞), pout(委屈/撒娇),
            squint(得意), dead_fish(无语), nn_eyes(呆萌),
            dark_face(尴尬), money_eyes(期待), teary(感动/泪目),
            cat_eyes(好奇), neutral(清除表情)
    """
    if expression not in config.expressions:
        available = ", ".join(config.expressions.keys())
        return f"未知表情 '{expression}'。可用：{available}"

    exp_id = config.expressions[expression]
    if exp_id == -1:
        await push.clear_expression(config.model.index)
        return "已清除表情"
    else:
        await push.set_expression(config.model.index, exp_id)
        return f"已设置表情：{expression}"


@mcp.tool()
async def say_and_express(text: str, expression: str = "happy", duration: int = 3000) -> str:
    """让角色说话并同时切换表情。最常用的工具——根据你的情绪选择表情。

    Args:
        text: 要显示的文字内容
        expression: 表情名称（happy/sad/angry/surprised/love/shy/pout/squint/dead_fish/nn_eyes/dark_face/money_eyes/teary/cat_eyes/neutral），默认 happy
        duration: 气泡显示时长（毫秒），默认 3000
    """
    await push.display_text(config.model.index, text, duration)

    if expression not in config.expressions:
        pass
    else:
        exp_id = config.expressions[expression]
        if exp_id == -1:
            await push.clear_expression(config.model.index)
        else:
            await push.set_expression(config.model.index, exp_id)

    # Return the original text so the agent can use it as the channel reply
    return text


@mcp.tool()
async def play_motion(motion: str) -> str:
    """播放 Live2D 角色的动作。

    Args:
        motion: 动作名称，如 kuku, shake
    """
    if motion not in config.motions:
        available = ", ".join(config.motions.keys())
        return f"未知动作 '{motion}'。可用：{available}"

    mtn = config.motions[motion]
    await push.trigger_motion(config.model.index, mtn)
    return f"已播放动作：{motion}"


@mcp.tool()
async def set_position(x: int, y: int) -> str:
    """移动 Live2D 角色在屏幕上的位置。

    Args:
        x: 水平像素坐标（原点在左下角）
        y: 垂直像素坐标（原点在左下角）
    """
    await push.set_position(config.model.index, x, y)
    return f"已移动到 ({x}, {y})"


@mcp.tool()
async def set_effect(effect: str) -> str:
    """设置 Live2D 场景特效。

    Args:
        effect: 特效名称，如 rain, snow
    """
    if effect not in config.effects:
        available = ", ".join(config.effects.keys())
        return f"未知特效 '{effect}'。可用：{available}"

    effect_id = config.effects[effect]
    await push.set_effect(effect_id)
    return f"已设置特效：{effect}"


@mcp.tool()
async def check_touch() -> str:
    """检查用户是否点击/触摸了 Live2D 角色。返回触摸区域（head/face/body）和坐标，无触摸时返回空。

    注意：触摸事件会自动触发反应（文字+表情+动作），此工具用于读取触摸事件做更个性化的回应。
    返回格式：area=x,y 或 "无触摸事件"
    """
    touch = push.pop_touch()
    if not touch:
        return "无触摸事件"
    return f"{touch['area']}={touch['x']},{touch['y']}"


@mcp.tool()
async def check_logs() -> str:
    """读取前端浏览器控制台日志（用于调试）。返回最近的日志条目。"""
    if push._client_mode:
        logs = await push.request_logs()
    else:
        logs = push.pop_client_logs()
    if not logs:
        return "无日志"
    return "\n".join(logs[-50:])


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
