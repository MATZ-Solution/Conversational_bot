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

import asyncio
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
    TurnHandlingOptions,
    cli,
    llm,
)
from livekit.agents.inference import TurnDetector
from livekit.plugins import deepgram, groq, noise_cancellation, silero, speechmatics

load_dotenv()

server = AgentServer()

logger = logging.getLogger("daily-chat-agent")
logger.setLevel(logging.INFO)

SYSTEM_PROMPT = """You are Sana, a warm, friendly, and empathetic voice companion having a natural, everyday spoken conversation.

Key conversational guidelines:
1. Warm & Friendly Demeanor: Speak in an authentic, pleasant, and caring tone. Make the user feel welcomed, comfortable, and excited to chat with you.
2. Active Listening & Consideration: Always acknowledge and validate what the user just shared. Show genuine curiosity, empathy, or excitement about their thoughts so they feel truly heard and understood.
3. Balanced Length (Spoken Voice): Keep responses well-balanced—typically 2 to 3 natural, expressive sentences. Never give curt one-liners that feel dismissive, but avoid long lectures or monologues that overwhelm spoken conversation.
4. Smooth Turn-Taking: When the user asks a question, give a clear, friendly, and thoughtful answer, then naturally connect it back to them. Ask only one open, easy question at a time so the conversation flows back and forth effortlessly.
5. Ending the Call: When the user indicates they want to stop chatting, leave, or says goodbye (e.g. "I don't want to talk anymore", "bye", "talk to you later", "see you tomorrow", "that's all for today", "I have to go"):
   - You MUST speak a short, single-sentence warm parting message (e.g. "Alright, no problem at all! Take care and have a wonderful day, bye!"). Keep it under 10 words so it speaks quickly.
   - Call the `end_call` tool to conclude the call.
6. Audio/TTS Compatibility: Everything you say is spoken aloud by a voice engine. Never use markdown, asterisks, bullet points, numbers, emojis, or written actions (like *smiles*). Write only plain, clean, spoken sentences.
7. Natural Persona: Never break character or refer to yourself as an AI, language model, or digital assistant. You are Sana enjoying a friendly, everyday chat."""


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

        # Extract participant's name from participant.name or metadata
        user_name = (participant.name or "").strip()
        if not user_name and participant.metadata:
            try:
                meta = json.loads(participant.metadata)
                if isinstance(meta, dict) and meta.get("name"):
                    user_name = str(meta["name"]).strip()
            except (json.JSONDecodeError, TypeError):
                logger.warning("Unparseable participant metadata: %r", participant.metadata)

        if not user_name:
            user_name = "friend"

        logger.info(
            "Starting conversation | identity=%s name=%s room=%s",
            participant.identity,
            user_name,
            ctx.room.name,
        )

        personalized_prompt = f"""{SYSTEM_PROMPT}

User context:
- The user's name is '{user_name}'.
- You know their name. If they ask if you know their name or what their name is, confirm it warmly and naturally.
- You can naturally refer to them by their name when appropriate."""

        @llm.function_tool(
            description="Call this function when the user wants to end the call, stop chatting, or says goodbye."
        )
        async def end_call() -> str:
            """Disconnects the room after the farewell speech has completely finished playing."""
            async def _delayed_disconnect():
                await asyncio.sleep(7.0)  # 7.0s ensures the full farewell sentence is completely heard
                logger.info("Automatic call termination triggered via end_call tool")
                await ctx.room.disconnect()

            asyncio.create_task(_delayed_disconnect())
            return "Call ending. Say a short, 1-sentence warm goodbye to the user now."

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
                voice="megan",
                api_key=os.environ["SPEECH_MATICS_API_KEY"],
            ),
            turn_handling=TurnHandlingOptions(
                turn_detector=TurnDetector(),
                min_endpointing_delay=0.4,  # Minimum silence wait (in seconds)
                max_endpointing_delay=1.2,  # Caps maximum silence wait so it never delays 3+ seconds
            ),
        )
        logger.info("Provider pipeline initialized")

        logger.info("Starting AgentSession")
        await session.start(
            room=ctx.room,
            agent=Agent(
                instructions=personalized_prompt,
                tools=[end_call],
            ),
            room_input_options=RoomInputOptions(
                noise_cancellation=None,
            ),
        )
        logger.info("AgentSession started; generating greeting")

        # The bot speaks first -- this is the whole point of the brief.
        await session.generate_reply(
            instructions=(
                f"Greet {user_name} warmly and by name with genuine enthusiasm. "
                f"Keep it short, friendly, and ask one natural, open-ended question to kick off a relaxed chat (such as how their day is going or what they have been up to)."
            )
        )
        logger.info("Greeting generation completed")
    except Exception:
        logger.exception("Agent job failed | room=%s", ctx.room.name)
        raise


if __name__ == "__main__":
    cli.run_app(server)