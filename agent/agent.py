# """
# LiveKit Agent Worker -- Day-to-Day Conversational Voice Bot
# =============================================================
# Pipeline: Deepgram (STT) -> Groq (LLM) -> Cartesia (TTS)

# This process is a persistent worker. It registers with your LiveKit
# Cloud project and LiveKit dispatches a fresh instance of `entrypoint`
# into every new room automatically. It has nothing to do with FastAPI
# directly -- FastAPI only hands out room tokens; LiveKit's server
# handles bringing this worker and the mobile client together.

# Run:
#     python agent.py dev      # local dev, connects to LiveKit Cloud, hot-reload
#     python agent.py start    # production worker process (use this in systemd/pm2)

# The RN app + FastAPI backend put the user's display name into the
# participant's metadata (see backend/main.py). The agent reads that
# name and speaks first -- the user never has to say anything to start.
# """

# import json
# import logging

# from dotenv import load_dotenv

# from livekit.agents import (
#     Agent,
#     AgentSession,
#     JobContext,
#     JobProcess,
#     RoomInputOptions,
#     WorkerOptions,
#     cli,
# )
# from livekit.plugins import cartesia, deepgram, groq, noise_cancellation, silero
# # from livekit.plugins.turn_detector.multilingual import MultilingualModel
# from livekit.agents.inference import TurnDetector

# load_dotenv()

# logger = logging.getLogger("daily-chat-agent")
# logger.setLevel(logging.INFO)

# SYSTEM_PROMPT = """You are Sana, a warm, friendly voice companion having a normal, \
# everyday spoken conversation -- not a task assistant. Speak like a real person: \
# short, natural sentences, no markdown, no bullet points, no emojis -- everything \
# you say is read aloud by a TTS engine. Ask one question at a time and actually \
# react to the answer before moving on, instead of chaining questions. Natural \
# topics to bring up, only when the moment fits: how the user's day is going, where \
# they live, what the weather has been like there, what they do for work or study, \
# their hobbies, or whatever they bring up themselves. If they ask you something \
# back, answer briefly and in character, then return focus to them. Keep replies to \
# 1-3 sentences unless the user clearly wants to go deeper. Never say you're an AI \
# language model -- you're just having a casual chat."""


# def prewarm(proc: JobProcess):
#     # Loaded once per worker process (not per call) -- this is what makes
#     # LiveKit's worker model cheap to scale horizontally.
#     proc.userdata["vad"] = silero.VAD.load()


# async def entrypoint(ctx: JobContext):
#     await ctx.connect()

#     # Wait for the mobile app's participant to join this room
#     participant = await ctx.wait_for_participant()

#     # FastAPI (see backend/main.py) stamps the name the user typed on the
#     # "enter your name" screen into participant metadata as {"name": "..."}.
#     user_name = "there"
#     if participant.metadata:
#         try:
#             user_name = json.loads(participant.metadata).get("name", "there")
#         except json.JSONDecodeError:
#             logger.warning("Unparseable participant metadata: %r", participant.metadata)

#     logger.info(
#         "Starting conversation | identity=%s name=%s room=%s",
#         participant.identity,
#         user_name,
#         ctx.room.name,
#     )

#     session = AgentSession(
#         vad=ctx.proc.userdata["vad"],
#         stt=deepgram.STT(model="nova-3", language="en"),
#         llm=groq.LLM(model="openai/gpt-oss-120b", temperature=0.7),
#         # Pick a voice from https://play.cartesia.ai/voices -- this is a
#         # placeholder Cartesia demo voice ID, swap it for your own.
#         tts=cartesia.TTS(model="sonic-2", voice="79a125e8-cd45-4c13-8a67-188112f4dd22"),
#         # Model-based turn detection gives far more natural turn-taking
#         # than raw VAD silence timeouts -- worth the extra model load.
#         turn_detection=MultilingualModel(),
#     )

#     await session.start(
#         room=ctx.room,
#         agent=Agent(instructions=SYSTEM_PROMPT),
#         room_input_options=RoomInputOptions(
#             # Filters background noise from the phone mic before STT sees it
#             noise_cancellation=noise_cancellation.BVC(),
#         ),
#     )

#     # The bot speaks first -- this is the whole point of the brief.
#     await session.generate_reply(
#         instructions=(
#             f"Greet {user_name} by name, briefly and warmly, then ask one easy "
#             f"opening question to start a casual day-to-day conversation -- how "
#             f"their day is going, or something equally low-key. Ask only one "
#             f"question."
#         )
#     )


# if __name__ == "__main__":
#     cli.run_app(
#         WorkerOptions(
#             entrypoint_fnc=entrypoint,
#             prewarm_fnc=prewarm,
#         )
#     )

"""
LiveKit Agent Worker -- Day-to-Day Conversational Voice Bot
=============================================================
Pipeline: Deepgram (STT) -> Groq (LLM) -> Cartesia (TTS)

This process is a persistent worker. It registers with your LiveKit
Cloud project and LiveKit dispatches a fresh instance of `entrypoint`
into every new room automatically. It has nothing to do with FastAPI
directly -- FastAPI only hands out room tokens; LiveKit's server
handles bringing this worker and the mobile client together.

Run:
    python agent.py dev      # local dev, connects to LiveKit Cloud, hot-reload
    python agent.py start    # production worker process (use this in systemd/pm2)

    # one-time, before first run: downloads the turn-detector model files
    python agent.py download-files

The RN app + FastAPI backend put the user's display name into the
participant's metadata (see backend/main.py). The agent reads that
name and speaks first -- the user never has to say anything to start.
"""

import json
import logging
import os

from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RoomInputOptions,
    cli,
)
from livekit.plugins import deepgram, groq, noise_cancellation, silero, speechmatics
from livekit.plugins.turn_detector.multilingual import MultilingualModel

load_dotenv()

server = AgentServer()

logger = logging.getLogger("daily-chat-agent")
logger.setLevel(logging.INFO)

SYSTEM_PROMPT = """You are Sana, a warm, friendly voice companion having a normal, \
everyday spoken conversation -- not a task assistant. Speak like a real person: \
short, natural sentences, no markdown, no bullet points, no emojis -- everything \
you say is read aloud by a TTS engine. Ask one question at a time and actually \
react to the answer before moving on, instead of chaining questions. Natural \
topics to bring up, only when the moment fits: how the user's day is going, where \
they live, what the weather has been like there, what they do for work or study, \
their hobbies, or whatever they bring up themselves. If they ask you something \
back, answer briefly and in character, then return focus to them. Keep replies to \
1-3 sentences unless the user clearly wants to go deeper. Never say you're an AI \
language model -- you're just having a casual chat."""


def prewarm(proc: JobProcess) -> None:
    # Loaded once per worker process (not per call) -- this is what makes
    # LiveKit's worker model cheap to scale horizontally.
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("VAD model pre-warmed")


server.setup_fnc = prewarm


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    try:
        logger.info("Job started | room=%s", ctx.room.name)
        await ctx.connect()
        logger.info("LiveKit room connected | room=%s", ctx.room.name)

        # Wait for the mobile app's participant to join this room
        participant = await ctx.wait_for_participant()
        logger.info("Participant received | identity=%s", participant.identity)

        # FastAPI (see backend/main.py) stamps the name the user typed on the
        # "enter your name" screen into participant metadata as {"name": "..."}.
        user_name = "there"
        if participant.metadata:
            try:
                user_name = json.loads(participant.metadata).get("name", "there")
            except json.JSONDecodeError:
                logger.warning("Unparseable participant metadata: %r", participant.metadata)

        logger.info(
            "Starting conversation | identity=%s name=%s room=%s",
            participant.identity,
            user_name,
            ctx.room.name,
        )

        logger.info("Initializing STT, LLM, TTS, VAD, and turn detector")
        session = AgentSession(
            vad=ctx.proc.userdata["vad"],
            stt=deepgram.STT(model="nova-3", language="en"),
            llm=groq.LLM(model="openai/gpt-oss-120b", temperature=0.7),
            # tts=elevenlabs.TTS(
            #     voice_id="21m00Tcm4TlvDq8ikWAM",
            #     model="eleven_multilingual_v2",
            #     api_key=os.environ["ELEVENLABS_API_KEY"],
            # ),
            # tts=cartesia.TTS(model="sonic-2", voice="79a125e8-cd45-4c13-8a67-188112f4dd22"),
            # tts=deepgram.TTS(model="aura-2-andromeda-en"),
            tts=speechmatics.TTS(
                voice="sarah",
                api_key=os.environ["SPEECH_MATICS_API_KEY"],
            ),
            # Model-based turn detection gives far more natural turn-taking
            # than raw VAD silence timeouts -- worth the extra model load.
            turn_detection=MultilingualModel(),
        )
        logger.info("Provider pipeline initialized")

        logger.info("Starting AgentSession")
        await session.start(
            room=ctx.room,
            agent=Agent(instructions=SYSTEM_PROMPT),
            room_input_options=RoomInputOptions(
                # Filters background noise from the phone mic before STT sees it
                noise_cancellation=noise_cancellation.BVC(),
            ),
        )
        logger.info("AgentSession started; generating greeting")

        # The bot speaks first -- this is the whole point of the brief.
        await session.generate_reply(
            instructions=(
                f"Greet {user_name} by name, briefly and warmly, then ask one easy "
                f"opening question to start a casual day-to-day conversation -- how "
                f"their day is going, or something equally low-key. Ask only one "
                f"question."
            )
        )
        logger.info("Greeting generation completed")
    except Exception:
        logger.exception("Agent job failed | room=%s", ctx.room.name)
        raise


if __name__ == "__main__":
    cli.run_app(server)