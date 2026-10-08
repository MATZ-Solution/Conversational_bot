# Daily Chat Bot -- Architecture & Setup

## How the pieces fit together

```
React Native app                FastAPI backend              LiveKit Cloud
-----------------                ----------------              -------------
1. User types name
2. POST /api/start-conversation ->  issues a room token
                                     (name -> participant
                                      metadata, fresh room)
3. <- {livekit_url, token, room}
4. Connects to LiveKit room  --------------------------------->  room created
                                                                   |
                                                                   v
                                                        LiveKit dispatches your
                                                        Agent worker into the room
                                                        (agent/agent.py, always
                                                        running, registered with
                                                        your project)
5. Bot speaks first (reads name from metadata) <--------------- Deepgram STT
                                                                  Groq LLM
                                                                  Cartesia TTS
6. Live voice conversation over WebRTC, no further backend involvement
```

Key point: **FastAPI never touches audio.** Its only job is minting a
short-lived LiveKit token per "Start Conversation" tap. Once the RN app
holds a valid token, it talks to LiveKit Cloud directly over WebRTC, and
LiveKit Cloud is what invokes your always-on agent worker. This is why
the agent worker is a separate long-running process from the API --
scale them independently (FastAPI is stateless and cheap; agent workers
each hold one active voice session in memory).

## Why these framework choices

- **AgentSession** (not the older `VoicePipelineAgent`) is the current
  LiveKit Agents API -- it wires STT/LLM/TTS/VAD/turn-detection together
  and handles interruption handling, endpointing, and barge-in for you.
- **MultilingualModel turn detector**: relying on raw VAD silence
  timeouts makes the bot interrupt users who pause mid-sentence. The
  turn-detector model reads semantic completeness, not just silence, so
  turn-taking feels human. Worth the small extra model load.
- **noise_cancellation.BVC()**: phones pick up a lot of ambient noise;
  this runs before STT and meaningfully improves Deepgram's accuracy on
  a mobile mic.
- **Groq's `openai/gpt-oss-120b`**: Groq deprecated the Llama 3.x chat
  models in August 2026 in favor of the GPT-OSS family. Re-check
  `console.groq.com/docs/models` periodically -- Groq's lineup moves fast.

## Local setup

```bash
# 1. Agent worker
cd agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in LiveKit + Deepgram + Cartesia + Groq keys
python agent.py dev    # registers with LiveKit Cloud, hot-reloads on save

# 2. Backend (separate terminal)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in LiveKit URL + API key/secret
uvicorn main:app --reload --port 8000

# 3. Test frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`), enter a name, and click
**Start conversation**. The page requests a token from FastAPI, connects to
LiveKit, enables the browser microphone, and plays the agent audio. Browser
console messages are prefixed with `[daily-chat]`; the same events appear in
the on-page Diagnostics panel. Set `VITE_API_BASE_URL` in `frontend/.env` when
the backend is not running at `http://localhost:8000`.

Get your `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` from
the LiveKit Cloud dashboard -- same three values go in both `.env` files.

## React Native Mobile Application

For full, step-by-step instructions on setting up, building, and running the React Native / Expo app (including Android/iOS native dev builds, network IP configuration, and troubleshooting), see the dedicated [Mobile Application Setup Guide](file:///d:/chatbot/daily-chat-bot/daily-chat-mobile/README.md).

### Quick Mobile Run:
```bash
# 1. Update config.js with your computer's local Wi-Fi IP (not localhost)
cd daily-chat-mobile
npm install

# 2. Run local native Android build (WebRTC requires a Dev Build, NOT standard Expo Go)
npx expo run:android

# 3. Start the bundler
npx expo start --dev-client
```

## Deploying (given your existing EC2/Nginx/pm2/Certbot workflow)

- **FastAPI**: same pattern as your other FastAPI services -- gunicorn
  with uvicorn workers behind Nginx, pm2 to keep it alive, Certbot for
  TLS. It's stateless, so it's fine behind a load balancer if you scale
  out later.
- **Agent worker**: this is *not* a request/response service -- it's a
  long-lived process that stays registered with LiveKit Cloud and gets
  jobs pushed to it. Run it under pm2 (or systemd) as its own process
  (`python agent.py start`), not behind Nginx. Run 2+ worker processes
  for redundancy once you have real traffic -- LiveKit load-balances
  jobs across whatever workers are registered.
- No DB needed anywhere in this version, per your call to skip
  persistence -- rooms and tokens are ephemeral and self-cleaning.

## Natural next steps (not built yet, flag if you want them)

- Persist conversation transcripts (you'd need Supabase, which you're
  already using elsewhere)
- Guest-to-account upgrade path if you later want returning users
- Push notifications / reconnect handling if the app backgrounds mid-call
- Swap the fixed system prompt for a small state machine if you want the
  bot to walk through a fixed set of topics rather than free-flowing chat
