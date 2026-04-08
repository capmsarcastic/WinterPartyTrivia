import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from supabase import create_client, Client

app = FastAPI()

# --- 1. SUPABASE SETUP ---
# Replace these with your actual keys from the Supabase Dashboard
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise RuntimeError("SUPABASE_URL or SUPABASE_KEY is missing! Check Render Environment Variables.")

supabase: Client = create_client(url, key)


# --- 2. WEBSOCKET MANAGER ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# --- 3. THE FRONTEND (Embedded for simplicity) ---
html = """
<!DOCTYPE html>
<html>
    <head><title>Staff Social Test</title></head>
    <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1>Staff Social Test</h1>
        <button id="clickBtn" style="padding: 20px 40px; font-size: 20px;">CLICK ME!</button>
        <div id="messages" style="margin-top: 20px; font-weight: bold;">Waiting for clicks...</div>

        <script>
            // Automatically switch between local and production URLs
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

            ws.onmessage = function(event) {
                document.getElementById('messages').innerText = event.data;
            };

            document.getElementById('clickBtn').onclick = function() {
                ws.send("click");
            };
        </script>
    </body>
</html>
"""

@app.get("/")
async def get():
    return HTMLResponse(html)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "click":
                # 1. Update Supabase (optional for this quick test, but proves it works)
                # supabase.table("clicks").insert({"event": "staff_party"}).execute()
                
                # 2. Broadcast to everyone
                await manager.broadcast("Someone just clicked!")
    except WebSocketDisconnect:
        manager.disconnect(websocket)