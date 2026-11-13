/**
 * Tavily Web Research Service
 * Integrates with the official Tavily Search API (https://api.tavily.com)
 * Handles temporal 30-day filtering, targeted multi-angle queries, and source deduplication.
 */

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/**
 * Extract clean domain name from URL (e.g. "techcrunch.com")
 */
function extractDomain(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Format raw publication date string into clean date (e.g. "Nov 10, 2026")
 */
function formatPublishedDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(d);
    }
  } catch {
    // Ignore date parse errors
  }
  return null;
}

/**
 * Execute a single query against Tavily Search API
 * @param {string} query
 * @param {object} options
 */
async function executeTavilyQuery(query, apiKey, options = {}) {
  const { topic = 'news', days = 30, maxResults = 8, searchDepth = 'advanced' } = options;

  const payload = {
    api_key: apiKey,
    query,
    search_depth: searchDepth,
    topic,
    days,
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
    exclude_domains: [
      'zippia.com',
      'glassdoor.com',
      'zoominfo.com',
      'comparably.com',
      'salary.com',
      'wikipedia.org',
      'hiperlocalmarketing.com',
      'fourweekmba.com',
      'tavily.com',
      'linkedin.com'
    ]
  };

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMessage = errorBody;
    try {
      const errJson = JSON.parse(errorBody);
      parsedMessage = errJson.error || errJson.message || errorBody;
    } catch {
      // Keep raw string
    }

    if (response.status === 401) {
      throw new Error(`Invalid Tavily API Key. Please verify your TAVILY_API_KEY in the .env file.`);
    } else if (response.status === 429) {
      throw new Error(`Tavily API rate limit exceeded. Please wait a moment or upgrade your plan.`);
    } else {
      throw new Error(`Tavily API error (${response.status}): ${parsedMessage}`);
    }
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Conduct comprehensive 30-day pre-meeting research for a given subject
 * Uses multi-angle queries:
 * 1. General recent news & major announcements
 * 2. Product launches, partnerships, and executive/leadership changes
 *
 * @param {string} subject - Company name or individual name
 * @param {object} windowInfo - Research window info from computeResearchWindow
 * @returns {Promise<Array>} Deduplicated, scored, and normalized research items
 */
async function searchRecentDevelopments(subject, windowInfo) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your-tavily-api-key')) {
    throw new Error(
      'Tavily API key is not configured. Please add your Tavily API key to the TAVILY_API_KEY variable in the .env file.'
    );
  }

  // 1. Build targeted search queries
  const cleanSubject = subject.replace(/["']/g, '');
  const queries = [
    `"${cleanSubject}" news announcements developments`,
    `"${cleanSubject}" product launch executive hires leadership updates`
  ];

  // 2. Fetch both query streams in parallel for speed & breadth
  const searchPromises = queries.map(q =>
    executeTavilyQuery(q, apiKey, {
      topic: 'news',
      days: 30,
      maxResults: 6,
      searchDepth: 'advanced'
    }).catch(err => {
      console.warn(`Query failed: "${q}":`, err.message);
      return [];
    })
  );

  const rawResultsNested = await Promise.all(searchPromises);
  const flattened = rawResultsNested.flat();

  // 3. Deduplicate by canonical URL
  const seenUrls = new Set();
  const normalizedArticles = [];

  const BLOCKED_DOMAINS = new Set([
    'zippia.com',
    'glassdoor.com',
    'zoominfo.com',
    'comparably.com',
    'salary.com',
    'wikipedia.org',
    'signalhire.com',
    'hiperlocalmarketing.com',
    'fourweekmba.com',
    'tavily.com',
    'linkedin.com'
  ]);

  for (const item of flattened) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);

    // Filter out video streams and playlist links
    if (item.url.includes('/watch?v=') || item.url.includes('/playlist?list=')) continue;

    const site = extractDomain(item.url);
    if (BLOCKED_DOMAINS.has(site.toLowerCase())) continue;
    const publishedDateFormatted = formatPublishedDate(item.published_date) || windowInfo.startDateFormatted;

    normalizedArticles.push({
      title: item.title ? item.title.trim() : 'Untitled Update',
      url: item.url,
      site,
      publishedDate: publishedDateFormatted,
      rawPublishedDate: item.published_date || null,
      content: item.content ? item.content.trim() : '',
      score: item.score || 0
    });
  }

  // 4. Sort by relevance score descending
  normalizedArticles.sort((a, b) => b.score - a.score);

  return normalizedArticles;
}

module.exports = {
  searchRecentDevelopments,
  extractDomain,
  formatPublishedDate
};
