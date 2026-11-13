/**
 * Bifrost Model Gateway Service
 * Manages model requests, prompt structuring, and LLM gateway routing via Bifrost.
 * Bifrost exposes an OpenAI-compatible gateway interface (/v1/chat/completions).
 */

const DEFAULT_BIFROST_URL = 'http://localhost:8080/v1';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * Builds the system prompt enforcing strict reliability, executive scannability, and source grounding
 */
function buildSystemPrompt() {
  return `You are Briefly, an AI Pre-Meeting Briefing Agent designed for busy executives.
Your job is to analyze real-time web research from Tavily and generate an executive-ready, one-page pre-meeting briefing.

STRICT EXECUTIVE BRIEFING & CITATION RULES:
1. Ground every single claim in the provided search results. NEVER hallucinate or fabricate events, product launches, dates, or executive names.
2. ACCURATE EXECUTIVE TITLES & ROLES:
   - When citing leadership, NEVER confuse historical or past roles with current titles. (For example, Neal Mohan has been YouTube's CEO since 2023, previously Chief Product Officer).
   - If an executive is departing to join another company (e.g. Sony hiring a former YouTube director), state clearly that the individual has moved to Sony, rather than stating YouTube hired them.
   - Do not guess or assume titles that are not explicitly stated in the source text.
3. Provide an "executiveSummary": An array of 3-4 concise, high-impact bullet takeaways. Each takeaway must be 1-2 punchy sentences highlighting specific names, product announcements, leadership changes, or dates.
4. For each key development, assign:
   - "title": A concise, bold headline (max 10-12 words).
   - "summary": A clean, readable summary of 2-3 sentences. Strip any raw website navigation, phone numbers, image captions, or boilerplates.
   - "category": One of ["Leadership", "Product Launch", "Partnerships & Deals", "Financial & Strategic", "Company News"].
   - "relevance": One of ["High", "Medium", "Low"] based on strategic significance to a business meeting.
   - "date": The publication date from the source (e.g. "Nov 5, 2026").
   - "status": One of:
     * "verified" (fact directly confirmed by primary source or official company blog/release)
     * "reported" (credibly reported by established news media like Variety, BBC, Reuters)
     * "uncertain" (needs verification, unconfirmed report, rumor, or third-party claim)
   - "sourceIndex": The 0-based integer index of the specific source item supporting this claim.
   - "context": 1-2 sentences of additional background evidence for when the executive expands the card.
4. Extract 2 "insights" explaining high-level strategic momentum.
5. Formulate 3-4 actionable "discussionPoints" that the user can ask or raise during the meeting. Where relevant, prefix the question with the topic it relates to (e.g., "[Leadership] How will the new CTO appointment impact...").
6. Provide a concise 2-sentence "overview" introducing the meeting subject and timeframe.
7. Return your response ONLY as valid JSON matching the requested schema.`;
}

/**
 * Builds the user prompt containing meeting context and retrieved Tavily articles
 */
function buildUserPrompt(subject, windowInfo, articles) {
  const sourcesText = articles.map((a, i) => {
    return `[Source #${i}]
Title: ${a.title}
Site: ${a.site}
Date: ${a.publishedDate || 'Unknown'}
URL: ${a.url}
Content Snippet: ${a.content || 'No snippet available.'}`;
  }).join('\n\n');

  return `MEETING CONTEXT:
- Subject: ${subject}
- Meeting Date: ${windowInfo.meetingDateFormatted} (${windowInfo.meetingTimeFormatted})
- Research Window: 30 days preceding the meeting (${windowInfo.windowLabel})

RETRIEVED RESEARCH FROM TAVILY:
${sourcesText}

Generate the structured JSON briefing following the system prompt rules. Output JSON format:
{
  "overview": "Brief meeting overview...",
  "executiveSummary": [
    "Takeaway 1 highlighting key name, event, and date.",
    "Takeaway 2 highlighting product or partnership.",
    "Takeaway 3 highlighting strategic direction."
  ],
  "developments": [
    {
      "title": "Headline",
      "summary": "Clean 2-3 sentence summary",
      "category": "Leadership",
      "relevance": "High",
      "date": "Nov 5, 2026",
      "status": "verified",
      "sourceIndex": 0,
      "context": "Additional evidence for progressive disclosure."
    }
  ],
  "insights": [
    {
      "headline": "Strategic Shift",
      "takeaway": "Insight description..."
    }
  ],
  "discussionPoints": [
    "[Leadership] What is the expected impact of...",
    "[Product] Following the launch of..."
  ]
}`;
}

/**
 * Route request through the Bifrost AI Model Gateway
 *
 * @param {string} subject
 * @param {object} windowInfo
 * @param {Array} articles - Normalized research results from Tavily
 * @returns {Promise<object>} Structured briefing synthesis
 */
async function generateBriefingWithBifrost(subject, windowInfo, articles) {
  const rawBaseUrl = process.env.BIFROST_BASE_URL || DEFAULT_BIFROST_URL;
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const apiKey = process.env.BIFROST_API_KEY || 'sk-bf-default';
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const endpoint = `${baseUrl}/chat/completions`;

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(subject, windowInfo, articles) }
  ];

  const payload = {
    model,
    messages,
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey && apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    throw new Error(
      `Cannot connect to Bifrost Gateway at ${baseUrl}. Ensure Bifrost is running or configure BIFROST_BASE_URL in .env. Details: ${netErr.message}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let message = errorBody;
    try {
      const errJson = JSON.parse(errorBody);
      message = errJson.error?.message || errJson.message || errorBody;
    } catch {
      // Keep raw
    }
    throw new Error(`Bifrost Gateway error (HTTP ${response.status}): ${message}`);
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error('Bifrost Gateway returned an empty completion response.');
  }

  try {
    const parsed = JSON.parse(rawContent);
    return parsed;
  } catch (parseErr) {
    throw new Error(`Failed to parse JSON response from Bifrost Gateway: ${parseErr.message}`);
  }
}

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  generateBriefingWithBifrost
};
