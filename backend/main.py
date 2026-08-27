# """
# FastAPI backend -- issues LiveKit room access tokens.

# No auth, no database: the name typed on the RN app's entry screen
# becomes the participant's display name for that one session only.
# Each "start conversation" tap gets a fresh, throwaway room.
# """

# import json
# import logging
# import os
# import time
# import uuid

# from dotenv import load_dotenv
# from fastapi import FastAPI, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from livekit import api
# from pydantic import BaseModel, Field

# load_dotenv()

# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger("token-server")

# LIVEKIT_URL = os.environ["LIVEKIT_URL"]
# LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
# LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]

# app = FastAPI(title="Daily Chat Bot - Token Server")

# # Tighten this to your app's actual origin(s)/scheme before shipping.
# # React Native apps don't send a browser Origin header, so this mainly
# # matters if you ever add a web client too.
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
#     allow_methods=["POST", "GET"],
#     allow_headers=["*"],
# )


# class StartConversationRequest(BaseModel):
#     name: str = Field(min_length=1, max_length=50)


# class StartConversationResponse(BaseModel):
#     livekit_url: str
#     token: str
#     room_name: str


# @app.post("/api/start-conversation", response_model=StartConversationResponse)
# async def start_conversation(payload: StartConversationRequest) -> StartConversationResponse:
#     clean_name = payload.name.strip()
#     if not clean_name:
#         raise HTTPException(status_code=400, detail="Name is required")

#     identity = f"user-{uuid.uuid4().hex[:8]}"
#     room_name = f"chat-{uuid.uuid4().hex[:10]}"
#     metadata = json.dumps({"name": clean_name})

#     token = (
#         api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
#         .with_identity(identity)
#         .with_name(clean_name)
#         .with_metadata(metadata)
#         .with_ttl(60 * 30)  # room link expires in 30 min if unused
#         .with_grants(
#             api.VideoGrants(
#                 room_join=True,
#                 room=room_name,
#                 can_publish=True,
#                 can_subscribe=True,
#                 can_publish_data=True,
#             )
#         )
#         .to_jwt()
#     )

#     logger.info("Issued token | identity=%s room=%s", identity, room_name)

#     return StartConversationResponse(
#         livekit_url=LIVEKIT_URL,
#         token=token,
#         room_name=room_name,
#     )


# @app.get("/healthz")
# async def healthz():
#     return {"status": "ok", "ts": int(time.time())}

"""
FastAPI backend -- issues LiveKit room access tokens.

No auth, no database: the name typed on the RN app's entry screen
becomes the participant's display name for that one session only.
Each "start conversation" tap gets a fresh, throwaway room.
"""

import json
import logging
import os
import time
import uuid
from datetime import timedelta

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("token-server")

LIVEKIT_URL = os.environ["LIVEKIT_URL"]
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]

app = FastAPI(title="Daily Chat Bot - Token Server")

# Tighten this to your app's actual origin(s)/scheme before shipping.
# React Native apps don't send a browser Origin header, so this mainly
# matters if you ever add a web client too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS",["http://localhost:5173,http://localhost:5174"]),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class StartConversationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class StartConversationResponse(BaseModel):
    livekit_url: str
    token: str
    room_name: str


@app.post("/api/start-conversation", response_model=StartConversationResponse)
async def start_conversation(payload: StartConversationRequest) -> StartConversationResponse:
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Name is required")

    identity = f"user-{uuid.uuid4().hex[:8]}"
    room_name = f"chat-{uuid.uuid4().hex[:10]}"
    metadata = json.dumps({"name": clean_name})

    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(clean_name)
        .with_metadata(metadata)
        .with_ttl(timedelta(minutes=30))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        )
        .to_jwt()
    )

    logger.info("Issued token | identity=%s room=%s", identity, room_name)

    return StartConversationResponse(
        livekit_url=LIVEKIT_URL,
        token=token,
        room_name=room_name,
    )


@app.get("/health")
async def healthz():
    return {"status": "ok", "ts": int(time.time())}