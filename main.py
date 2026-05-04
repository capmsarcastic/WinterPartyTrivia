import csv
import io
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import bcrypt
from fastapi import Cookie, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from supabase import create_client, Client

# ============================================================
# CONFIGURATION
# ============================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_KEY", "")
)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
IS_PRODUCTION = os.environ.get("RENDER") is not None
SESSION_TTL_HOURS = 12
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 600  # 10 minutes
BOOT_COOLDOWN_SECONDS = 60

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD must be set.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Hash the admin password once at startup
_admin_hash: bytes = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())

# In-memory state (reset on restart — acceptable for a party app)
_sessions: dict[str, datetime] = {}           # token → expiry
_login_attempts: dict[str, list[float]] = {}  # device_id → [timestamps]
_boot_timestamps: dict[str, float] = {}       # player_id → last boot time

# ============================================================
# APP SETUP
# ============================================================

app = FastAPI(title="Winter Party Trivia", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if not IS_PRODUCTION else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# HELPERS
# ============================================================

def sb():
    """Return a fresh Supabase client (service role)."""
    return supabase


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def log_activity(event_type: str, actor_type: str, actor_id: str | None,
                 actor_name: str | None, payload: dict):
    try:
        sb().table("activity_log").insert({
            "event_type": event_type,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "payload_json": payload,
        }).execute()
    except Exception:
        pass  # log failures must not crash the request


def require_admin(admin_session: Optional[str] = Cookie(default=None)) -> str:
    if not admin_session or admin_session not in _sessions:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if _sessions[admin_session] < now_utc():
        del _sessions[admin_session]
        raise HTTPException(status_code=401, detail="Session expired.")
    return admin_session


def get_device_id(request: Request) -> str:
    device_id = request.headers.get("X-Device-ID", "").strip()
    if not device_id:
        raise HTTPException(status_code=400, detail="X-Device-ID header required.")
    return device_id


def get_effective_points(question: dict) -> float:
    """Return points for a question, falling back to the round default."""
    if question.get("points") is not None:
        return float(question["points"])
    round_res = sb().table("rounds").select("points_per_correct").eq(
        "id", question["round_id"]).single().execute()
    return float(round_res.data["points_per_correct"])


def normalize_team_name(s: str) -> str:
    """Strip non-alphanumeric characters and lowercase for uniqueness comparison."""
    return re.sub(r'[^a-z0-9]', '', s.lower())


def auto_mark(question: dict, value_json: dict) -> Optional[float]:
    """Return points for auto-markable types, or None for manual marking."""
    itype = question["input_type"]
    correct = question.get("correct_answer_json")
    if correct is None:
        return None

    points = get_effective_points(question)

    if itype == "multiple_choice":
        config = question.get("input_config_json", {})
        allow_multi = config.get("allow_multiple_selections", False)
        submitted = value_json.get("selected", [])
        if not allow_multi:
            submitted = value_json.get("selected", None)
            correct_val = correct if isinstance(correct, str) else correct.get("value")
            return points if submitted == correct_val else 0
        else:
            correct_set = set(correct) if isinstance(correct, list) else {correct}
            submitted_set = set(submitted) if isinstance(submitted, list) else set()
            return points if submitted_set == correct_set else 0

    if itype == "numeric":
        config = question.get("input_config_json", {})
        scoring = config.get("scoring_mode", "exact")
        if scoring == "exact":
            submitted_val = value_json.get("value")
            correct_val = correct if not isinstance(correct, dict) else correct.get("value")
            try:
                return points if float(submitted_val) == float(correct_val) else 0
            except (TypeError, ValueError):
                return 0
        # closest_wins is handled at commit time across all teams

    return None  # free_text and closest_wins require manual/deferred marking


# ============================================================
# REQUEST MODELS
# ============================================================

class AdminLoginRequest(BaseModel):
    password: str
    device_id: str


class JoinTeamRequest(BaseModel):
    team_id: str
    display_name: str
    passcode: str


class CreateTeamRequest(BaseModel):
    name: str
    image_id: str
    passcode: str
    creator_name: str


class UpdateDraftRequest(BaseModel):
    team_id: str
    question_id: str
    value_json: dict
    player_id: str
    player_name: str


class LeaveTeamRequest(BaseModel):
    player_id: str


class BootMemberRequest(BaseModel):
    team_id: str
    booting_player_id: str
    target_player_id: str


class PlayerMessageRequest(BaseModel):
    from_player_id: str
    from_player_name: str
    body: str


class HeartbeatRequest(BaseModel):
    player_id: str


class EventConfigUpdate(BaseModel):
    team_creation_enabled: Optional[bool] = None
    branding_json: Optional[dict] = None


class PushRequest(BaseModel):
    page: str
    data: Optional[dict] = None


class BroadcastRequest(BaseModel):
    body: str


class TeamMessageRequest(BaseModel):
    team_id: str
    body: str


class PlayerMessageAdminRequest(BaseModel):
    target_player_id: str
    body: str


class TeamUpdateRequest(BaseModel):
    name: Optional[str] = None
    image_id: Optional[str] = None
    passcode: Optional[str] = None


class RejectTeamRequest(BaseModel):
    message: Optional[str] = None


class RoundCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    points_per_correct: float = 1.0
    display_questions_in_app: bool = True
    order: Optional[int] = None


class RoundUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points_per_correct: Optional[float] = None
    display_questions_in_app: Optional[bool] = None
    order: Optional[int] = None


class QuestionCreateRequest(BaseModel):
    order: Optional[int] = None
    prompt_text: Optional[str] = None
    prompt_image_url: Optional[str] = None
    input_type: str
    input_config_json: dict = {}
    correct_answer_json: Any = None
    marking_notes: Optional[str] = None
    points: Optional[float] = None
    multi_input: bool = False


class QuestionUpdateRequest(BaseModel):
    order: Optional[int] = None
    prompt_text: Optional[str] = None
    prompt_image_url: Optional[str] = None
    input_type: Optional[str] = None
    input_config_json: Optional[dict] = None
    correct_answer_json: Any = None
    marking_notes: Optional[str] = None
    points: Optional[float] = None


class BulkMarkRequest(BaseModel):
    marks: list[dict]  # [{team_id, question_id, points_awarded, admin_note}]


class ScoreEventRequest(BaseModel):
    team_id: str
    points: float
    note: str
    category: str = "bonus"


class RenamePlayerRequest(BaseModel):
    player_id: str
    new_name: str


# ============================================================
# ADMIN AUTH
# ============================================================

@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest, response: JSONResponse = None):
    device_id = req.device_id.strip()
    now = time.time()

    # Rate limiting: max 5 attempts per device per 10 minutes
    attempts = _login_attempts.get(device_id, [])
    attempts = [t for t in attempts if now - t < LOGIN_WINDOW_SECONDS]
    if len(attempts) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 10 minutes.")
    attempts.append(now)
    _login_attempts[device_id] = attempts

    if not bcrypt.checkpw(req.password.encode(), _admin_hash):
        raise HTTPException(status_code=401, detail="Incorrect password.")

    token = secrets.token_urlsafe(32)
    _sessions[token] = now_utc() + timedelta(hours=SESSION_TTL_HOURS)
    _login_attempts.pop(device_id, None)

    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        key="admin_session",
        value=token,
        httponly=True,
        secure=IS_PRODUCTION,
        samesite="lax",
        max_age=SESSION_TTL_HOURS * 3600,
    )
    log_activity("admin_login", "admin", None, "admin", {"device_id": device_id})
    return resp


@app.post("/api/admin/logout")
async def admin_logout(admin_session: Optional[str] = Cookie(default=None)):
    if admin_session and admin_session in _sessions:
        del _sessions[admin_session]
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("admin_session")
    return resp


@app.get("/api/admin/me")
async def admin_me_check(admin_session: Optional[str] = Cookie(default=None)):
    if not admin_session or admin_session not in _sessions:
        return JSONResponse({"authenticated": False})
    if _sessions[admin_session] < now_utc():
        del _sessions[admin_session]
        return JSONResponse({"authenticated": False})
    return JSONResponse({"authenticated": True})


# ============================================================
# PUBLIC ENDPOINTS
# ============================================================

@app.get("/api/public/event-config")
async def public_event_config():
    res = sb().table("event_config").select("*").eq("id", 1).single().execute()
    return res.data


@app.get("/api/public/teams")
async def public_teams():
    res = sb().table("teams").select(
        "id, name, image_id, status, creator_name"
    ).in_("status", ["approved", "pending"]).order("created_at").execute()
    teams = res.data

    # Attach member counts
    for team in teams:
        count_res = sb().table("players").select("id", count="exact").eq(
            "team_id", team["id"]).eq("status", "active").execute()
        team["member_count"] = count_res.count or 0

    return teams


@app.get("/api/public/image-presets")
async def public_image_presets():
    res = sb().table("image_presets").select("*").eq("is_active", True).order("category").execute()
    return res.data


@app.get("/api/public/check-name")
async def public_check_name(name: str = ""):
    name_clean = name.strip()
    if not name_clean:
        return {"available": False}
    active = sb().table("players").select("display_name").eq("status", "active").execute()
    taken = any(p["display_name"].lower() == name_clean.lower() for p in (active.data or []))
    return {"available": not taken}


@app.get("/api/public/team-status/{team_id}")
async def public_team_status(team_id: str):
    res = sb().table("teams").select("id, status, rejection_message").eq(
        "id", team_id).single().execute()
    if not res.data:
        return {"status": "not_found", "rejection_message": None}
    return {"status": res.data["status"], "rejection_message": res.data.get("rejection_message")}


# ============================================================
# PLAYER ENDPOINTS  (X-Device-ID header required)
# ============================================================

@app.post("/api/player/join-team")
async def player_join_team(req: JoinTeamRequest, request: Request):
    device_id = get_device_id(request)

    # Validate team exists and is approved
    team_res = sb().table("teams").select("id, name, status").eq(
        "id", req.team_id).single().execute()
    if not team_res.data or team_res.data["status"] != "approved":
        raise HTTPException(status_code=404, detail="Team not found.")

    # Validate passcode
    pc_res = sb().table("team_passcodes").select("passcode").eq(
        "team_id", req.team_id).single().execute()
    if not pc_res.data or pc_res.data["passcode"] != req.passcode:
        raise HTTPException(status_code=401, detail="Incorrect passcode.")

    # Check display name uniqueness globally (case-insensitive, Python-side comparison)
    name_clean = req.display_name.strip()
    active_players = sb().table("players").select("display_name").eq("status", "active").execute()
    if any(p["display_name"].lower() == name_clean.lower() for p in (active_players.data or [])):
        raise HTTPException(status_code=409, detail="That name is already taken. Please choose a different name.")

    # Deactivate any existing active player record for this device
    sb().table("players").update({"status": "left"}).eq(
        "device_id", device_id).eq("status", "active").execute()

    # Create player record
    player_res = sb().table("players").insert({
        "display_name": name_clean,
        "team_id": req.team_id,
        "device_id": device_id,
        "status": "active",
    }).execute()
    player = player_res.data[0]

    log_activity("player_joined", "player", player["id"], name_clean,
                 {"team_id": req.team_id, "team_name": team_res.data["name"]})

    # Include passcode in response so the team page can display it
    team_data = dict(team_res.data)
    team_data["passcode"] = pc_res.data["passcode"] if pc_res.data else None
    return {"player": player, "team": team_data}


@app.post("/api/player/create-team")
async def player_create_team(req: CreateTeamRequest, request: Request):
    device_id = get_device_id(request)

    # Check if team creation is enabled
    cfg = sb().table("event_config").select(
        "team_creation_enabled").eq("id", 1).single().execute()
    if not cfg.data or not cfg.data["team_creation_enabled"]:
        raise HTTPException(status_code=403, detail="Team creation is currently closed.")

    # Validate passcode is 4 digits
    if not req.passcode.isdigit() or len(req.passcode) != 4:
        raise HTTPException(status_code=400, detail="Passcode must be exactly 4 digits.")

    # Check name uniqueness — normalised to letters+numbers only, so "team name" == "teamname"
    name_clean = req.name.strip()
    normalized_new = normalize_team_name(name_clean)
    existing = sb().table("teams").select("name").in_(
        "status", ["pending", "approved"]).execute()
    for t in (existing.data or []):
        if normalize_team_name(t["name"]) == normalized_new:
            raise HTTPException(status_code=409, detail="That team name is already taken.")

    # Create pending team
    team_res = sb().table("teams").insert({
        "name": name_clean,
        "image_id": req.image_id,
        "status": "pending",
        "creator_name": req.creator_name.strip(),
    }).execute()
    team = team_res.data[0]

    # Store passcode
    sb().table("team_passcodes").insert({
        "team_id": team["id"],
        "passcode": req.passcode,
    }).execute()

    log_activity("team_created", "player", None, req.creator_name,
                 {"team_id": team["id"], "team_name": name_clean})
    return {"team": team}


@app.post("/api/player/cancel-team-creation")
async def player_cancel_team(request: Request, body: dict):
    device_id = get_device_id(request)
    team_id = body.get("team_id")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id required.")

    team_res = sb().table("teams").select("id, status, creator_name").eq(
        "id", team_id).single().execute()
    if not team_res.data or team_res.data["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending team not found.")

    sb().table("teams").delete().eq("id", team_id).execute()
    log_activity("team_cancelled", "player", None, team_res.data.get("creator_name"),
                 {"team_id": team_id})
    return {"ok": True}


@app.put("/api/player/draft")
async def player_update_draft(req: UpdateDraftRequest, request: Request):
    device_id = get_device_id(request)

    # Verify the question's round is still open
    q_res = sb().table("questions").select("round_id").eq(
        "id", req.question_id).single().execute()
    if not q_res.data:
        raise HTTPException(status_code=404, detail="Question not found.")

    r_res = sb().table("rounds").select("lifecycle_state").eq(
        "id", q_res.data["round_id"]).single().execute()
    if not r_res.data or r_res.data["lifecycle_state"] != "open":
        raise HTTPException(status_code=409, detail="Round is not open for edits.")

    sb().table("drafts").upsert({
        "team_id": req.team_id,
        "question_id": req.question_id,
        "value_json": req.value_json,
        "last_editor_player_id": req.player_id,
        "last_editor_name": req.player_name,
        "updated_at": now_utc().isoformat(),
    }).execute()
    return {"ok": True}


@app.post("/api/player/leave-team")
async def player_leave_team(req: LeaveTeamRequest, request: Request):
    device_id = get_device_id(request)
    sb().table("players").update({"status": "left"}).eq(
        "id", req.player_id).eq("device_id", device_id).execute()
    log_activity("player_left", "player", req.player_id, None, {})
    return {"ok": True}


@app.post("/api/player/boot-member")
async def player_boot_member(req: BootMemberRequest, request: Request):
    device_id = get_device_id(request)

    # Verify booting player is on the team and active
    booter = sb().table("players").select("id, display_name, team_id").eq(
        "id", req.booting_player_id).eq("device_id", device_id).eq(
        "status", "active").single().execute()
    if not booter.data or booter.data["team_id"] != req.team_id:
        raise HTTPException(status_code=403, detail="Not a member of this team.")

    # Cooldown check
    last_boot = _boot_timestamps.get(req.booting_player_id, 0)
    if time.time() - last_boot < BOOT_COOLDOWN_SECONDS:
        remaining = int(BOOT_COOLDOWN_SECONDS - (time.time() - last_boot))
        raise HTTPException(status_code=429,
                            detail=f"You need to wait {remaining}s before booting again.")

    # Boot target player
    target = sb().table("players").select("display_name").eq(
        "id", req.target_player_id).single().execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Player not found.")

    sb().table("players").update({"status": "kicked"}).eq("id", req.target_player_id).execute()
    _boot_timestamps[req.booting_player_id] = time.time()

    # Rotate passcode
    new_passcode = str(secrets.randbelow(9000) + 1000)
    sb().table("team_passcodes").update({
        "passcode": new_passcode,
        "updated_at": now_utc().isoformat(),
    }).eq("team_id", req.team_id).execute()

    log_activity("player_booted_by_member", "player", req.booting_player_id,
                 booter.data["display_name"],
                 {"team_id": req.team_id, "target_id": req.target_player_id,
                  "target_name": target.data["display_name"], "new_passcode": new_passcode})
    return {"ok": True, "new_passcode": new_passcode}


@app.post("/api/player/message")
async def player_send_message(req: PlayerMessageRequest, request: Request):
    device_id = get_device_id(request)
    sb().table("messages").insert({
        "from_admin": False,
        "from_player_id": req.from_player_id,
        "from_player_name": req.from_player_name,
        "target_type": "admin",
        "body": req.body,
    }).execute()
    return {"ok": True}


@app.put("/api/player/heartbeat")
async def player_heartbeat(req: HeartbeatRequest, request: Request):
    device_id = get_device_id(request)
    sb().table("players").update({
        "last_seen_at": now_utc().isoformat()
    }).eq("id", req.player_id).eq("device_id", device_id).execute()
    return {"ok": True}


@app.get("/api/player/team-passcode")
async def player_get_team_passcode(request: Request):
    """Return the current passcode for the player's team (player must be active member)."""
    device_id = get_device_id(request)
    player_id = request.query_params.get("player_id", "").strip()
    if not player_id:
        raise HTTPException(status_code=400, detail="player_id query param required.")

    player_res = sb().table("players").select("team_id").eq(
        "id", player_id).eq("device_id", device_id).eq("status", "active").single().execute()
    if not player_res.data:
        raise HTTPException(status_code=403, detail="Not authenticated.")

    team_id = player_res.data["team_id"]
    if not team_id:
        raise HTTPException(status_code=404, detail="Player is not on a team.")

    pc = sb().table("team_passcodes").select("passcode").eq(
        "team_id", team_id).single().execute()
    if not pc.data:
        raise HTTPException(status_code=404, detail="Passcode not found.")

    return {"passcode": pc.data["passcode"]}


@app.get("/api/player/session")
async def player_session(request: Request):
    """Return the active player record for this device, if any."""
    device_id = get_device_id(request)
    res = sb().table("players").select(
        "id, display_name, team_id, status"
    ).eq("device_id", device_id).eq("status", "active").order(
        "joined_at", desc=True).limit(1).execute()
    if res.data:
        return {"player": res.data[0]}
    return {"player": None}


# ============================================================
# ADMIN — EVENT CONFIG
# ============================================================

@app.get("/api/admin/event-config")
async def admin_get_config(token: str = None,
                           admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("event_config").select("*").eq("id", 1).single().execute()
    return res.data


@app.patch("/api/admin/event-config")
async def admin_update_config(req: EventConfigUpdate,
                              admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    updates: dict = {"updated_at": now_utc().isoformat()}
    if req.team_creation_enabled is not None:
        updates["team_creation_enabled"] = req.team_creation_enabled
    if req.branding_json is not None:
        updates["branding_json"] = req.branding_json
    sb().table("event_config").update(updates).eq("id", 1).execute()

    if req.team_creation_enabled is False:
        # Auto-reject all pending teams
        pending = sb().table("teams").select("id").eq("status", "pending").execute()
        for t in (pending.data or []):
            sb().table("teams").update({
                "status": "deleted",
                "rejection_message": "Team creation has been closed by the admin.",
            }).eq("id", t["id"]).execute()
        log_activity("team_creation_locked", "admin", None, "admin",
                     {"auto_rejected": len(pending.data or [])})

    return {"ok": True}


@app.post("/api/admin/push")
async def admin_push(req: PushRequest,
                     admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("event_config").update({
        "push_destination": {
            "page": req.page,
            "data": req.data or {},
            "pushed_at": now_utc().isoformat(),
        },
        "updated_at": now_utc().isoformat(),
    }).eq("id", 1).execute()
    log_activity("admin_push", "admin", None, "admin", {"page": req.page})
    return {"ok": True}


# ============================================================
# ADMIN — MESSAGING
# ============================================================

@app.post("/api/admin/broadcast")
async def admin_broadcast(req: BroadcastRequest,
                          admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("messages").insert({
        "from_admin": True,
        "target_type": "broadcast",
        "body": req.body,
    }).execute()
    log_activity("broadcast_sent", "admin", None, "admin", {"body": req.body[:100]})
    return {"ok": True}


@app.post("/api/admin/message-team")
async def admin_message_team(req: TeamMessageRequest,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("messages").insert({
        "from_admin": True,
        "target_type": "team",
        "target_id": req.team_id,
        "body": req.body,
    }).execute()
    return {"ok": True}


@app.post("/api/admin/message-player")
async def admin_message_player(req: PlayerMessageAdminRequest,
                               admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("messages").insert({
        "from_admin": True,
        "target_type": "player",
        "target_id": req.target_player_id,
        "body": req.body,
    }).execute()
    return {"ok": True}


@app.get("/api/admin/messages")
async def admin_get_messages(admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("messages").select("*").order("sent_at", desc=True).limit(200).execute()
    msgs = res.data or []

    # Enrich player messages with team info
    for msg in msgs:
        if not msg.get("from_admin") and msg.get("from_player_id"):
            try:
                p = sb().table("players").select("team_id").eq(
                    "id", msg["from_player_id"]).single().execute()
                if p.data and p.data.get("team_id"):
                    t = sb().table("teams").select("id, name").eq(
                        "id", p.data["team_id"]).single().execute()
                    if t.data:
                        msg["from_team_id"] = t.data["id"]
                        msg["from_team_name"] = t.data["name"]
            except Exception:
                pass

    return msgs


@app.patch("/api/admin/messages/{message_id}/read")
async def admin_mark_read(message_id: str,
                          admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("messages").update({"is_read": True}).eq("id", message_id).execute()
    return {"ok": True}


# ============================================================
# ADMIN — TEAMS
# ============================================================

@app.get("/api/admin/teams")
async def admin_get_teams(admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    teams = sb().table("teams").select("*").not_.eq(
        "status", "deleted").order("created_at").execute().data

    for team in teams:
        # Attach passcode
        pc = sb().table("team_passcodes").select("passcode").eq(
            "team_id", team["id"]).single().execute()
        team["passcode"] = pc.data["passcode"] if pc.data else None

        # Active members
        members = sb().table("players").select("id, display_name, last_seen_at").eq(
            "team_id", team["id"]).eq("status", "active").execute()
        team["members"] = members.data or []
        team["member_count"] = len(team["members"])

        # Total score
        score_res = sb().table("score_events").select("points").eq(
            "team_id", team["id"]).execute()
        team["total_score"] = sum(float(e["points"]) for e in (score_res.data or []))

    return teams


@app.post("/api/admin/teams/{team_id}/approve")
async def admin_approve_team(team_id: str,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("teams").update({
        "status": "approved",
        "updated_at": now_utc().isoformat(),
    }).eq("id", team_id).eq("status", "pending").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Pending team not found.")
    team = res.data[0]
    log_activity("team_approved", "admin", None, "admin",
                 {"team_id": team_id, "team_name": team["name"]})
    return {"ok": True, "team": team}


@app.post("/api/admin/teams/{team_id}/reject")
async def admin_reject_team(team_id: str, req: RejectTeamRequest,
                            admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("teams").update({
        "status": "deleted",
        "rejection_message": req.message or "Your team was not approved.",
        "updated_at": now_utc().isoformat(),
    }).eq("id", team_id).eq("status", "pending").execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Pending team not found.")
    log_activity("team_rejected", "admin", None, "admin",
                 {"team_id": team_id, "message": req.message})
    return {"ok": True}


@app.patch("/api/admin/teams/{team_id}")
async def admin_update_team(team_id: str, req: TeamUpdateRequest,
                            admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    updates: dict = {"updated_at": now_utc().isoformat()}
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.image_id is not None:
        updates["image_id"] = req.image_id

    if updates:
        sb().table("teams").update(updates).eq("id", team_id).execute()

    if req.passcode is not None:
        if not req.passcode.isdigit() or len(req.passcode) != 4:
            raise HTTPException(status_code=400, detail="Passcode must be 4 digits.")
        sb().table("team_passcodes").upsert({
            "team_id": team_id,
            "passcode": req.passcode,
            "updated_at": now_utc().isoformat(),
        }).execute()

    log_activity("team_updated", "admin", None, "admin", {"team_id": team_id})
    return {"ok": True}


@app.delete("/api/admin/teams/{team_id}")
async def admin_delete_team(team_id: str,
                            admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    # Mark all members as left
    sb().table("players").update({"status": "left"}).eq(
        "team_id", team_id).eq("status", "active").execute()
    # Mark team deleted
    sb().table("teams").update({
        "status": "deleted",
        "rejection_message": "Your team has been removed by the admin.",
        "updated_at": now_utc().isoformat(),
    }).eq("id", team_id).execute()
    log_activity("team_deleted", "admin", None, "admin", {"team_id": team_id})
    return {"ok": True}


@app.post("/api/admin/teams/{team_id}/boot-player/{player_id}")
async def admin_boot_player(team_id: str, player_id: str,
                            admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("players").update({"status": "kicked"}).eq(
        "id", player_id).eq("team_id", team_id).execute()

    # Rotate passcode
    new_passcode = str(secrets.randbelow(9000) + 1000)
    sb().table("team_passcodes").update({
        "passcode": new_passcode,
        "updated_at": now_utc().isoformat(),
    }).eq("team_id", team_id).execute()

    log_activity("player_booted_by_admin", "admin", None, "admin",
                 {"team_id": team_id, "player_id": player_id, "new_passcode": new_passcode})
    return {"ok": True, "new_passcode": new_passcode}


@app.patch("/api/admin/teams/{team_id}/rename-player")
async def admin_rename_player(team_id: str, req: RenamePlayerRequest,
                              admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("players").update({"display_name": req.new_name.strip()}).eq(
        "id", req.player_id).eq("team_id", team_id).execute()
    return {"ok": True}


# ============================================================
# ADMIN — ROUNDS
# ============================================================

@app.get("/api/admin/rounds")
async def admin_get_rounds(admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    rounds = sb().table("rounds").select("*").order("order").execute().data
    for r in rounds:
        q_count = sb().table("questions").select("id", count="exact").eq(
            "round_id", r["id"]).execute()
        r["question_count"] = q_count.count or 0
    return rounds


@app.post("/api/admin/rounds")
async def admin_create_round(req: RoundCreateRequest,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    if req.order is None:
        max_res = sb().table("rounds").select("order").order(
            "order", desc=True).limit(1).execute()
        req.order = ((max_res.data[0]["order"] + 1) if max_res.data else 1)

    res = sb().table("rounds").insert({
        "order": req.order,
        "title": req.title,
        "description": req.description,
        "points_per_correct": req.points_per_correct,
        "display_questions_in_app": req.display_questions_in_app,
    }).execute()
    log_activity("round_created", "admin", None, "admin", {"title": req.title})
    return res.data[0]


@app.patch("/api/admin/rounds/{round_id}")
async def admin_update_round(round_id: str, req: RoundUpdateRequest,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    updates: dict = {"updated_at": now_utc().isoformat()}
    for field in ["title", "description", "points_per_correct",
                  "display_questions_in_app", "order"]:
        val = getattr(req, field)
        if val is not None:
            updates[field] = val
    sb().table("rounds").update(updates).eq("id", round_id).execute()
    return {"ok": True}


@app.delete("/api/admin/rounds/{round_id}")
async def admin_delete_round(round_id: str,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("rounds").delete().eq("id", round_id).execute()
    return {"ok": True}


LIFECYCLE_SEQUENCE = ["draft", "open", "locked", "marked", "revealed"]


@app.post("/api/admin/rounds/{round_id}/advance-state")
async def admin_advance_round(round_id: str,
                              admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    r = sb().table("rounds").select("lifecycle_state, title").eq(
        "id", round_id).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Round not found.")

    current = r.data["lifecycle_state"]
    idx = LIFECYCLE_SEQUENCE.index(current)
    if idx >= len(LIFECYCLE_SEQUENCE) - 1:
        raise HTTPException(status_code=400, detail="Round is already in the final state.")

    new_state = LIFECYCLE_SEQUENCE[idx + 1]
    sb().table("rounds").update({
        "lifecycle_state": new_state,
        "updated_at": now_utc().isoformat(),
    }).eq("id", round_id).execute()

    # When locking: snapshot drafts as submissions for all teams
    if new_state == "locked":
        await _lock_round(round_id)

    # When finalising (revealed): publish committed score events
    if new_state == "revealed":
        pass  # score events were already committed in "marked" step

    log_activity(f"round_{new_state}", "admin", None, "admin",
                 {"round_id": round_id, "title": r.data["title"]})
    return {"ok": True, "new_state": new_state}


@app.post("/api/admin/rounds/{round_id}/revert-state")
async def admin_revert_round(round_id: str,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    r = sb().table("rounds").select("lifecycle_state").eq(
        "id", round_id).single().execute()
    current = r.data["lifecycle_state"]
    idx = LIFECYCLE_SEQUENCE.index(current)
    if idx <= 0:
        raise HTTPException(status_code=400, detail="Round is already in draft state.")
    new_state = LIFECYCLE_SEQUENCE[idx - 1]
    sb().table("rounds").update({
        "lifecycle_state": new_state,
        "updated_at": now_utc().isoformat(),
    }).eq("id", round_id).execute()
    return {"ok": True, "new_state": new_state}


async def _lock_round(round_id: str):
    """Copy drafts → submissions for all teams. Teams with no draft get empty submission."""
    questions = sb().table("questions").select("id").eq(
        "round_id", round_id).execute().data
    question_ids = [q["id"] for q in (questions or [])]

    approved_teams = sb().table("teams").select("id").eq(
        "status", "approved").execute().data
    team_ids = [t["id"] for t in (approved_teams or [])]

    for team_id in team_ids:
        for q_id in question_ids:
            draft = sb().table("drafts").select("value_json").eq(
                "team_id", team_id).eq("question_id", q_id).execute()
            value = draft.data[0]["value_json"] if draft.data else {}
            sb().table("submissions").upsert({
                "team_id": team_id,
                "question_id": q_id,
                "value_json": value,
                "submitted_at": now_utc().isoformat(),
                "auto_submitted": not bool(draft.data),
            }).execute()


# ============================================================
# ADMIN — QUESTIONS
# ============================================================

@app.get("/api/admin/rounds/{round_id}/questions")
async def admin_get_questions(round_id: str,
                              admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("questions").select("*").eq(
        "round_id", round_id).order("order").execute()
    return res.data


@app.post("/api/admin/rounds/{round_id}/questions")
async def admin_create_question(round_id: str, req: QuestionCreateRequest,
                                admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    if req.order is None:
        max_res = sb().table("questions").select("order").eq(
            "round_id", round_id).order("order", desc=True).limit(1).execute()
        req.order = ((max_res.data[0]["order"] + 1) if max_res.data else 1)

    res = sb().table("questions").insert({
        "round_id": round_id,
        "order": req.order,
        "prompt_text": req.prompt_text,
        "prompt_image_url": req.prompt_image_url,
        "input_type": req.input_type,
        "input_config_json": req.input_config_json,
        "correct_answer_json": req.correct_answer_json,
        "marking_notes": req.marking_notes,
        "points": req.points,
        "multi_input": req.multi_input,
    }).execute()
    return res.data[0]


@app.patch("/api/admin/questions/{question_id}")
async def admin_update_question(question_id: str, req: QuestionUpdateRequest,
                                admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    updates: dict = {"updated_at": now_utc().isoformat()}
    for field in ["order", "prompt_text", "prompt_image_url", "input_type",
                  "input_config_json", "correct_answer_json", "marking_notes", "points"]:
        val = getattr(req, field)
        if val is not None:
            updates[field] = val
    sb().table("questions").update(updates).eq("id", question_id).execute()
    return {"ok": True}


@app.delete("/api/admin/questions/{question_id}")
async def admin_delete_question(question_id: str,
                                admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("questions").delete().eq("id", question_id).execute()
    return {"ok": True}


@app.post("/api/admin/rounds/{round_id}/csv-import")
async def admin_csv_import(round_id: str, request: Request,
                           admin_session: Optional[str] = Cookie(default=None)):
    """
    Import questions from CSV. Expected columns:
    order, prompt_text, input_type, options_json, correct_answer, marking_notes, points
    """
    require_admin(admin_session)
    body = await request.body()
    text = body.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))
    created = []
    for i, row in enumerate(reader):
        try:
            q = {
                "round_id": round_id,
                "order": int(row.get("order") or i + 1),
                "prompt_text": row.get("prompt_text") or None,
                "input_type": row.get("input_type", "free_text").strip(),
                "input_config_json": {},
                "correct_answer_json": row.get("correct_answer") or None,
                "marking_notes": row.get("marking_notes") or None,
                "points": float(row["points"]) if row.get("points") else None,
                "multi_input": False,
            }
            if q["input_type"] == "multiple_choice" and row.get("options_json"):
                import json as _json
                opts = _json.loads(row["options_json"])
                q["input_config_json"] = {"options": opts}
            res = sb().table("questions").insert(q).execute()
            created.append(res.data[0])
        except Exception as e:
            pass  # skip malformed rows
    return {"created": len(created), "questions": created}


# ============================================================
# ADMIN — MARKING
# ============================================================

@app.get("/api/admin/rounds/{round_id}/submissions")
async def admin_get_submissions(round_id: str,
                                admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    questions = sb().table("questions").select("*").eq(
        "round_id", round_id).order("order").execute().data or []
    q_ids = [q["id"] for q in questions]

    teams = sb().table("teams").select("id, name, image_id").eq(
        "status", "approved").execute().data or []

    result = []
    for team in teams:
        team_data = dict(team)
        team_data["answers"] = {}
        team_data["marks"] = {}

        for q in questions:
            sub = sb().table("submissions").select("value_json").eq(
                "team_id", team["id"]).eq("question_id", q["id"]).execute()
            team_data["answers"][q["id"]] = sub.data[0]["value_json"] if sub.data else {}

            mark = sb().table("marks").select("points_awarded, admin_note").eq(
                "team_id", team["id"]).eq("question_id", q["id"]).execute()
            if mark.data:
                team_data["marks"][q["id"]] = mark.data[0]

        result.append(team_data)

    return {"teams": result, "questions": questions}


@app.put("/api/admin/marks")
async def admin_bulk_marks(req: BulkMarkRequest,
                           admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    for m in req.marks:
        sb().table("marks").upsert({
            "team_id": m["team_id"],
            "question_id": m["question_id"],
            "points_awarded": m.get("points_awarded", 0),
            "admin_note": m.get("admin_note"),
            "marked_at": now_utc().isoformat(),
        }).execute()
    return {"ok": True}


@app.post("/api/admin/rounds/{round_id}/commit-scores")
async def admin_commit_scores(round_id: str,
                              admin_session: Optional[str] = Cookie(default=None)):
    """Create draft score events from marks (round state → marked)."""
    require_admin(admin_session)
    r = sb().table("rounds").select("title, lifecycle_state").eq(
        "id", round_id).single().execute()
    if not r.data:
        raise HTTPException(status_code=404, detail="Round not found.")

    teams = sb().table("teams").select("id, name").eq("status", "approved").execute().data or []
    questions = sb().table("questions").select("id").eq("round_id", round_id).execute().data or []
    q_ids = [q["id"] for q in questions]

    for team in teams:
        # Sum all marks for this team in this round
        total = 0.0
        for q_id in q_ids:
            mark = sb().table("marks").select("points_awarded").eq(
                "team_id", team["id"]).eq("question_id", q_id).execute()
            if mark.data:
                total += float(mark.data[0]["points_awarded"])

        # Upsert score event (one per round per team)
        existing = sb().table("score_events").select("id").eq(
            "team_id", team["id"]).eq("round_id", round_id).execute()
        if existing.data:
            sb().table("score_events").update({
                "points": total,
                "note": f"Round score: {r.data['title']}",
                "awarded_at": now_utc().isoformat(),
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            sb().table("score_events").insert({
                "team_id": team["id"],
                "points": total,
                "note": f"Round score: {r.data['title']}",
                "category": "round",
                "round_id": round_id,
            }).execute()

    # Advance round to marked
    sb().table("rounds").update({
        "lifecycle_state": "marked",
        "updated_at": now_utc().isoformat(),
    }).eq("id", round_id).execute()

    log_activity("round_scores_committed", "admin", None, "admin",
                 {"round_id": round_id, "teams": len(teams)})
    return {"ok": True}


@app.post("/api/admin/rounds/{round_id}/finalise-scores")
async def admin_finalise_scores(round_id: str,
                                admin_session: Optional[str] = Cookie(default=None)):
    """Advance round from marked → revealed (teams can now see their results)."""
    require_admin(admin_session)
    sb().table("rounds").update({
        "lifecycle_state": "revealed",
        "updated_at": now_utc().isoformat(),
    }).eq("id", round_id).eq("lifecycle_state", "marked").execute()
    log_activity("round_revealed", "admin", None, "admin", {"round_id": round_id})
    return {"ok": True}


# ============================================================
# ADMIN — SCORE EVENTS
# ============================================================

@app.get("/api/admin/score-events")
async def admin_get_score_events(admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("score_events").select(
        "*, teams(name)"
    ).order("awarded_at", desc=True).execute()
    return res.data


@app.post("/api/admin/score-events")
async def admin_create_score_event(req: ScoreEventRequest,
                                   admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("score_events").insert({
        "team_id": req.team_id,
        "points": req.points,
        "note": req.note,
        "category": req.category,
    }).execute()
    log_activity("score_event_created", "admin", None, "admin",
                 {"team_id": req.team_id, "points": req.points, "note": req.note})
    return res.data[0]


@app.delete("/api/admin/score-events/{event_id}")
async def admin_delete_score_event(event_id: str,
                                   admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    sb().table("score_events").delete().eq("id", event_id).execute()
    return {"ok": True}


# ============================================================
# ADMIN — LEADERBOARD
# ============================================================

@app.get("/api/admin/leaderboard")
async def admin_leaderboard(admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    teams = sb().table("teams").select("id, name, image_id").eq(
        "status", "approved").execute().data or []

    leaderboard = []
    for team in teams:
        score_res = sb().table("score_events").select("points, category").eq(
            "team_id", team["id"]).execute()
        events = score_res.data or []
        total = sum(float(e["points"]) for e in events)
        breakdown: dict[str, float] = {}
        for e in events:
            breakdown[e["category"]] = breakdown.get(e["category"], 0) + float(e["points"])
        leaderboard.append({
            "team_id": team["id"],
            "name": team["name"],
            "image_id": team["image_id"],
            "total_score": total,
            "breakdown": breakdown,
        })

    leaderboard.sort(key=lambda x: x["total_score"], reverse=True)
    for i, entry in enumerate(leaderboard):
        entry["rank"] = i + 1
    return leaderboard


# ============================================================
# ADMIN — ACTIVITY LOG
# ============================================================

@app.get("/api/admin/activity-log")
async def admin_activity_log(limit: int = 100,
                             admin_session: Optional[str] = Cookie(default=None)):
    require_admin(admin_session)
    res = sb().table("activity_log").select("*").order(
        "created_at", desc=True).limit(limit).execute()
    return res.data


# ============================================================
# SERVE REACT SPA (production)
# ============================================================

_frontend_dist = "frontend/dist"

if os.path.exists(_frontend_dist):
    app.mount(
        "/assets",
        StaticFiles(directory=f"{_frontend_dist}/assets"),
        name="assets",
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404)
    index = f"{_frontend_dist}/index.html"
    if os.path.exists(index):
        return FileResponse(index)
    return JSONResponse(
        {"message": "Frontend not built. Run: cd frontend && npm run build"},
        status_code=503,
    )
