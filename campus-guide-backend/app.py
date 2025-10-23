# app.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel
from typing import List, Dict, Optional, Set
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
import logging

from data import get_ai_response
import database

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Connection Manager for WebSockets (Production Version) ---
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.agents: Set[str] = set()
        self.wait_queue: Dict[str, WebSocket] = {}
        self.active_chats: Dict[str, str] = {}  # {user_id: agent_id}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, client_id: str, client_type: str):
        async with self._lock:
            if client_id in self.connections:
                logger.warning(f"Client {client_id} already connected. Closing old connection.")
                await self._disconnect_client(client_id, code=status.WS_1001_GOING_AWAY)
            
            await websocket.accept()
            self.connections[client_id] = websocket

            if client_type == "agent":
                self.agents.add(client_id)
                logger.info(f"✅ Agent connected: {client_id}")
                await self.broadcast_queue_to_agents()
            else:
                logger.info(f"✅ User connected: {client_id}")

    async def disconnect(self, client_id: str):
        async with self._lock:
            await self._disconnect_client(client_id)
    
    async def _disconnect_client(self, client_id: str, code: int = status.WS_1000_NORMAL_CLOSURE):
        if client_id in self.connections:
            websocket = self.connections.pop(client_id)
            try:
                if websocket.client_state.name == 'CONNECTED':
                    await websocket.close(code=code)
            except RuntimeError:
                pass
            logger.info(f"🔌 Client disconnected: {client_id}")

        if client_id in self.agents:
            self.agents.discard(client_id)
            user_in_chat = next((uid for uid, aid in self.active_chats.items() if aid == client_id), None)
            if user_in_chat:
                await self._end_chat(user_in_chat, notify_agent=False)

        if client_id in self.wait_queue:
            self.wait_queue.pop(client_id, None)
            await self.broadcast_queue_to_agents()
        if client_id in self.active_chats:
            await self._end_chat(client_id, notify_user=False)

    async def add_to_wait_queue(self, user_id: str):
        async with self._lock:
            if user_id in self.connections and user_id not in self.wait_queue:
                self.wait_queue[user_id] = self.connections[user_id]
                logger.info(f"User {user_id} added to wait queue.")
                await self.broadcast_queue_to_agents()

    async def accept_chat(self, agent_id: str, user_id: str):
        async with self._lock:
            if user_id not in self.wait_queue or agent_id not in self.agents:
                return
            self.wait_queue.pop(user_id)
            # This is the crucial line that enables User -> Agent messages
            self.active_chats[user_id] = agent_id
            
            await self.send_json(user_id, {"type": "chat_started"})
            await self.send_json(agent_id, {"type": "chat_accepted", "user_id": user_id})

            await self.broadcast_queue_to_agents()
            logger.info(f"Chat started: user={user_id} <-> agent={agent_id}")

    async def end_chat_by_agent(self, user_id: str):
        async with self._lock:
            await self._end_chat(user_id)

    async def _end_chat(self, user_id: str, notify_user: bool = True, notify_agent: bool = True):
        if user_id not in self.active_chats:
            return
        agent_id = self.active_chats.pop(user_id)
        logger.info(f"Chat ended: user={user_id} <-> agent={agent_id}")
        
        if notify_user and user_id in self.connections:
            await self.send_json(user_id, {"type": "chat_ended"})
        if notify_agent and agent_id in self.connections:
            await self.send_json(agent_id, {"type": "chat_ended_confirmation", "user_id": user_id})

    async def relay_message(self, sender_id: str, message_data: dict):
        content = message_data.get("content")
        if not content: return

        async with self._lock:
            # Agent -> User Path
            if sender_id in self.agents:
                user_id = message_data.get("user_id")
                if user_id in self.active_chats and self.active_chats.get(user_id) == sender_id:
                    logger.info(f"MSG RELAY: Agent {sender_id} -> User {user_id}")
                    await self.send_json(user_id, {"type": "message", "content": content})
                else:
                    logger.warning(f"MSG DENIED: Agent {sender_id} tried to message un-paired user {user_id}")
            
            # --- THIS IS THE CRITICAL PATH FOR YOUR CURRENT PROBLEM ---
            # User -> Agent Path
            elif sender_id in self.active_chats:
                agent_id = self.active_chats[sender_id]
                logger.info(f"MSG RELAY: User {sender_id} -> Agent {agent_id}")
                await self.send_json(agent_id, {"type": "message", "user_id": sender_id, "content": content})

    async def broadcast_queue_to_agents(self):
        queue_list = list(self.wait_queue.keys())
        message = {"type": "queue_update", "queue": queue_list}
        for agent_id in list(self.agents):
            await self.send_json(agent_id, message)
    
    async def send_json(self, client_id: str, data: dict):
        if client_id in self.connections:
            try:
                await self.connections[client_id].send_json(data)
            except (WebSocketDisconnect, RuntimeError):
                await self._disconnect_client(client_id)

manager = ConnectionManager()

# --- FastAPI setup and other endpoints remain the same ---

app = FastAPI(title="Campus Guide AI – Backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- Schemas ---
class ChatMessage(BaseModel): role: str; content: str
class ChatInput(BaseModel): message: str; history: List[ChatMessage] = []; target_lang: str = 'en'
class ChatResponse(BaseModel): responseText: str; mapUrl: Optional[str] = None
class FeedbackInput(BaseModel): session_id: str; rating: Optional[int] = None; comment: Optional[str] = None

# --- REST Endpoints ---
@app.get("/")
def root(): return {"message": "✅ Campus Guide AI Backend is running"}

@app.post("/chat", response_model=ChatResponse)
async def chat(input_data: ChatInput):
    return get_ai_response(input_data.message, [msg.dict() for msg in input_data.history], input_data.target_lang)

@app.post("/feedback")
def submit_feedback(input_data: FeedbackInput):
    try:
        database.save_feedback(input_data.session_id, input_data.rating, input_data.comment)
        return {"status": "success", "message": "Feedback received"}
    except Exception as e:
        logger.error(f"Error saving feedback: {e}")
        return {"status": "error", "message": str(e)}

# --- WebSocket Endpoint ---
@app.websocket("/ws/livechat/{client_type}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_type: str, client_id: str):
    if client_type not in ["user", "agent"]:
        await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
        return

    await manager.connect(websocket, client_id, client_type)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "request_chat" and client_type == "user":
                    await manager.add_to_wait_queue(user_id=client_id)
                elif msg_type == "accept_chat" and client_type == "agent":
                    await manager.accept_chat(agent_id=client_id, user_id=message.get("user_id"))
                elif msg_type == "end_chat" and client_type == "agent":
                    await manager.end_chat_by_agent(user_id=message.get("user_id"))
                elif msg_type == "message":
                    await manager.relay_message(sender_id=client_id, message_data=message)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from {client_id}: {data}")
            except Exception as e:
                logger.error(f"Error processing message from {client_id}: {e}")
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected.")
    finally:
        await manager.disconnect(client_id)