# Secrets & environment variables

> Env var names, what they key, and where they're consumed. Never store actual secret VALUES here: names and purposes only.

| Env var | Keys what | Consumed in |
|---|---|---|
| `OPENROUTER_API_KEY` | OpenRouter: Gemini text-to-speech and the transcription check, on the owner's machine only. The game never calls OpenRouter. | `scripts/voice/generate.mjs` |
| `FFMPEG` (optional) | Full path to an ffmpeg binary, when `where.exe ffmpeg` finds none. Not a secret. | `scripts/voice/generate.mjs` |
