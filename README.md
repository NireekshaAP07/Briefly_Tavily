# Briefly — AI-Powered Pre-Meeting Briefing Agent

> **Global AI Hackathon 2026** | **Tavily Track**  
> *Problem Statement 05: Build a Pre-Meeting Briefing Agent*

Briefly transforms recent web research into a concise, reliable, and source-backed one-page briefing to help professionals walk into any business meeting fully prepared and informed.

---

## 🌟 Key Features

- **Strict 30-Day Pre-Meeting Research**: Automatically calculates and searches the strict 30-day temporal window preceding the scheduled meeting date.
- **Tavily Web Research**: Integrates the official Tavily Search API (`days: 30`, `search_depth: 'advanced'`) with multi-angle queries targeting recent news, product launches, executive changes, and strategic announcements.
- **Bifrost AI Model Gateway**: Uses Bifrost (Maxim AI) as the AI gateway to manage LLM requests, enforce structured JSON schemas, and eliminate hallucinations.
- **Verified vs. Uncertain Attribution**: Evaluates and labels every extracted development with verification status badges (`Verified Fact` vs. `Uncertain / Unconfirmed`).
- **Clickable Citations**: Every claim is linked to the publisher domain with publication dates.
- **Meeting-Ready Insights & Discussion Points**: Synthesizes strategic implications and generates tailored discussion questions for the meeting.
- **Preserved Canva AI Visual Identity**: Retains a clean, cozy, professional blue-themed layout with print-optimized one-page PDF downloading.

---

## 🏛️ System Architecture

```text
[ Canva AI UI (index.html) ]
              │  POST /api/briefing
              ▼
   [ Express API Server ]
              │
    ┌─────────┴─────────┐
    ▼                   ▼
[ 30-Day Calculator ] [ Tavily Search Service ]
                        │
                        ▼ (Filtered Articles & Snippets)
              [ Bifrost Model Gateway ]
                        │
                        ▼ (Structured Completion)
         [ Factual Verifier & Attributor ]
                        │
                        ▼
            [ Verified One-Page Briefing ]
```

---

## 📂 Project Structure

```text
tavilypro/
├── index.html                   # Canva-designed frontend UI & print styles
├── server.js                    # Express server & static asset host
├── package.json                 # Node.js dependencies
├── .env.example                 # Environment variable template
├── .env                         # Local configuration & secret keys
└── src/
    ├── routes/
    │   └── briefing.js          # API route: /api/briefing
    ├── services/
    │   ├── tavily.js            # Tavily Search API integration & 30-day filtering
    │   ├── bifrost.js           # Bifrost Model Gateway integration
    │   └── briefingGenerator.js # Attribution verifier & one-page synthesis
    └── utils/
        └── date.js              # Strict 30-day date calculation & validation
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+ or v20+)
- **npm** (v9+)

### 2. Installation
```bash
# Clone the repository and navigate to folder
cd tavilypro

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
PORT=3000

# Tavily API Key (from https://tavily.com)
TAVILY_API_KEY=tvly-your-tavily-api-key

# Bifrost Gateway Configuration (from https://docs.getbifrost.ai)
BIFROST_BASE_URL=http://localhost:8080/v1
BIFROST_API_KEY=your-bifrost-api-key
LLM_MODEL=openai/gpt-4o-mini
```

> **Note**: If Bifrost Gateway is not locally running, the system includes an intelligent fallback synthesizer that processes live Tavily snippets directly.

### 4. Running the Application
```bash
npm start
```
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📋 Evaluation Alignment

| Requirement | Implementation in Briefly |
| :--- | :--- |
| **Meeting Context** | Accepts subject name (company/person), meeting date, and meeting time. |
| **Recent Research (30 Days)** | Enforces strict 30-day temporal bounds using Tavily's native `days: 30` filter. |
| **Concise One-Page Briefing** | Structured into Overview, Key Developments, Insights, Discussion Points, and Sources. |
| **Source Attribution** | Explicitly attributes claims to source URLs, domains, and publication dates. |
| **Uncertainty Distinction** | Flags unconfirmed rumors or leaks with an `Uncertain` badge while labeling corroborated claims as `Verified Fact`. |
| **Tavily Integration** | Primary research provider executing parallel multi-query sweeps across news and leadership. |
| **Bifrost Integration** | Gateway routing model requests through OpenAI-compatible proxy interface. |
| **Print / Export** | One-click "Download Briefing" using custom `@media print` CSS for clean one-page output. |
