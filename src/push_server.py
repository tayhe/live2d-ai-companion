import asyncio
import json
import logging
from typing import Any

import websockets
from websockets.asyncio.server import Server, ServerConnection

logger = logging.getLogger(__name__)


class PushServer:
    def __init__(self, host: str = "127.0.0.1", port: int = 10086):
        self._host = host
        self._port = port
        self._clients: set[ServerConnection] = set()
        self._server: Server | None = None

    async def start(self) -> None:
        self._server = await websockets.serve(
            self._handler,
            self._host,
            self._port,
        )
        logger.info("PushServer listening on ws://%s:%s", self._host, self._port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        for ws in list(self._clients):
            await ws.close()
        self._clients.clear()

    async def _handler(self, ws: ServerConnection) -> None:
        self._clients.add(ws)
        logger.info("Frontend connected (%d clients)", len(self._clients))
        try:
            async for msg in ws:
                logger.debug("Frontend message: %s", msg)
                await self._broadcast_others(ws, msg)
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.discard(ws)
            logger.info("Frontend disconnected (%d clients)", len(self._clients))

    async def _broadcast_others(self, sender: ServerConnection, raw: str) -> None:
        others = [ws for ws in self._clients if ws is not sender]
        if not others:
            return
        await asyncio.gather(*[ws.send(raw) for ws in others], return_exceptions=True)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        if not self._clients:
            logger.debug("No connected frontends, skipping broadcast")
            return
        raw = json.dumps(payload, ensure_ascii=False)
        logger.debug("Broadcast: %s", raw)
        coros = [ws.send(raw) for ws in list(self._clients)]
        await asyncio.gather(*coros, return_exceptions=True)

    # ── high-level API ──

    async def display_text(self, model_index: int, text: str, duration: int = 3000) -> None:
        await self.broadcast({
            "type": "display_text",
            "model": model_index,
            "text": text,
            "duration": duration,
        })

    async def set_expression(self, model_index: int, exp_id: int) -> None:
        await self.broadcast({
            "type": "set_expression",
            "model": model_index,
            "exp_id": exp_id,
        })

    async def clear_expression(self, model_index: int) -> None:
        await self.broadcast({
            "type": "clear_expression",
            "model": model_index,
        })

    async def trigger_motion(self, model_index: int, motion: str) -> None:
        await self.broadcast({
            "type": "trigger_motion",
            "model": model_index,
            "motion": motion,
        })

    async def set_position(self, model_index: int, x: int, y: int) -> None:
        await self.broadcast({
            "type": "set_position",
            "model": model_index,
            "x": x,
            "y": y,
        })

    async def set_effect(self, effect_id: int) -> None:
        await self.broadcast({
            "type": "set_effect",
            "effect_id": effect_id,
        })

    async def set_mouth_open(self, value: float) -> None:
        await self.broadcast({
            "type": "set_mouth_open",
            "value": value,
        })
