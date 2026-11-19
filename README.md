# Briefly — AI-Powered Pre-Meeting Briefing Agent

Briefly turns recent, source-backed web research into a concise pre-meeting briefing. Enter a company or person, meeting date, and meeting time to generate a briefing with executive takeaways, key developments, strategic insights, discussion points, citations, history, and PDF export.

## Features

- Strict 30-day research window before the scheduled meeting.
- Tavily news search with parallel, multi-angle queries.
- Bifrost/OpenAI-compatible model gateway for structured briefing generation.
- Deterministic fallback synthesis when Bifrost is unavailable.
- Verified, reported, and uncertain attribution labels.
- Clickable source citations and publication dates.
- Saved briefing history in `data/briefings/`.
- One-click print/PDF download.
- Responsive, print-friendly frontend served by Express.
- Health-check endpoint for local or hosted deployments.

## Architecture

```text
Browser UI (index.html)
        |
        | POST /api/briefing
        v
Express server (server.js)
        |
        +--> 30-day date validation (src/utils/date.js)
        +--> Tavily search (src/services/tavily.js)
        +--> Bifrost model gateway (src/services/bifrost.js)
        +--> Verification and fallback synthesis (src/services/briefingGenerator.js)
        +--> JSON persistence (data/briefings/)
```

## Project structure

```text
.
├── index.html                     # Frontend UI, history view, and print styles
├── server.js                      # Express app and static file server
├── package.json                   # Scripts and dependencies
├── .env.example                   # Environment variable template
├── data/
│   └── briefings/                 # Persisted generated briefing JSON files
└── src/
    ├── routes/
    │   └── briefing.js            # Briefing, history, retrieval, and PDF routes
    ├── services/
    │   ├── tavily.js              # Tavily search and source normalization
    │   ├── bifrost.js             # Bifrost/OpenAI-compatible model client
    │   └── briefingGenerator.js   # Verification, synthesis, and fallback logic
    └── utils/
        └── date.js                # Meeting date/time validation and date windows
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A Tavily API key
- Optional: a running Bifrost gateway or another OpenAI-compatible endpoint

Node.js 18+ is recommended because the server uses the built-in `fetch` API.

## Setup on Windows

Open PowerShell or Command Prompt:

```powershell
git clone https://github.com/srushtimanjunath-059/Briefly_Tavily.git
cd Briefly_Tavily
npm install
Copy-Item .env.example .env
```

If using Command Prompt instead of PowerShell, copy the environment template with:

```cmd
copy .env.example .env
```

Open `.env`, add your API key, and start the server:

```powershell
npm start
```

Then open <http://localhost:3000>.

## Setup on Linux

```bash
git clone https://github.com/srushtimanjunath-059/Briefly_Tavily.git
cd Briefly_Tavily
npm install
cp .env.example .env
nano .env
npm start
```

Then open <http://localhost:3000> in a browser.

## Environment variables

Create `.env` from `.env.example` and configure:

```env
PORT=3000
TAVILY_API_KEY=tvly-your-tavily-api-key-here
BIFROST_BASE_URL=http://localhost:8080/v1
BIFROST_API_KEY=your-bifrost-key-or-leave-blank
LLM_MODEL=openai/gpt-4o-mini
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `3000`. |
| `TAVILY_API_KEY` | Yes | Tavily Search API key. |
| `BIFROST_BASE_URL` | No | Bifrost or OpenAI-compatible base URL. Defaults to `http://localhost:8080/v1`. |
| `BIFROST_API_KEY` | No | Gateway API key. |
| `LLM_MODEL` | No | Model name sent to the gateway. Defaults to `openai/gpt-4o-mini`. |

Keep `.env` private. It is excluded from Git by `.gitignore`; only `.env.example` should be committed.

## Run and verify

Start the application:

```bash
npm start
```

Check that the server is running:

```text
http://localhost:3000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "Briefly Pre-Meeting Briefing Agent"
}
```

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server health check. |
| `POST` | `/api/briefing` | Generate and save a briefing. |
| `GET` | `/api/briefing/history` | List saved briefings. |
| `GET` | `/api/briefing/:id` | Retrieve one saved briefing. |
| `GET` | `/api/briefing/download/:id` | Download one briefing as a PDF. |

Example request:

```json
{
  "subject": "Google",
  "meetingDate": "2026-11-20",
  "meetingTime": "10:00"
}
```

Each generated briefing is saved as a JSON file under `data/briefings/`. The history screen reads these files through the API.

## Troubleshooting

- **Tavily API key error:** confirm that `TAVILY_API_KEY` is set in `.env` and restart the server.
- **Bifrost connection error:** confirm that the gateway is running and that `BIFROST_BASE_URL`, `BIFROST_API_KEY`, and `LLM_MODEL` are correct. Briefly can use its fallback synthesizer if the gateway is unavailable.
- **Port already in use:** change `PORT` in `.env`, then open the matching port in your browser.
- **Old results in history:** generated files are stored in `data/briefings/`; remove only the specific local JSON files you no longer need.

## Git workflow

Keep secrets out of commits. A typical contribution workflow is:

```bash
git switch -c your-feature-branch
git add .
git commit -m "Describe your changes"
git push -u origin your-feature-branch
```

Then open a pull request against the target repository's `main` branch.

