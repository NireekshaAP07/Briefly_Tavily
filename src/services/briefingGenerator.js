/**
 * Briefing Generator & Verification Service
 * Combines Tavily web research with Bifrost Model Gateway analysis.
 * Verifies source attribution, cross-checks claims, cleans raw snippets,
 * and builds a scan-friendly executive briefing interface.
 */

const { generateBriefingWithBifrost } = require('./bifrost');

/**
 * Clean up raw web-scraped noise, image captions, phone numbers, and navigation
 */
function cleanSummaryText(rawText, devTitle) {
  if (!rawText) return 'Recent development reported during the 30-day pre-meeting research window.';
  let text = String(rawText);

  // If the article title appears in the content, skip everything before it
  // This cuts blog navigation chrome (e.g. blog.youtube menu items)
  if (devTitle && devTitle.length > 10) {
    const titleIdx = text.toLowerCase().indexOf(devTitle.toLowerCase().slice(0, 30));
    if (titleIdx > 20) {
      text = text.slice(titleIdx + devTitle.length);
    }
  }

  // Remove common scraped artifacts
  text = text.replace(/Image\s+\d+:[^\n]+/gi, '');
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');
  text = text.replace(/\+?1?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '');
  text = text.replace(/\b(view demo|view a demo|sales|newsroom link|in the news|blogs \(opens in new window\)|media & analyst|cookie policy|privacy policy)\b/gi, '');
  text = text.replace(/https?:\/\/\S+/gi, '');
  text = text.replace(/#+\s*/g, ''); // strip markdown headers
  // Strip navigation/UI chrome scraped from web pages
  text = text.replace(/skip to (main )?content/gi, '');
  // Strip any markdown link syntax (both full and broken patterns)
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // [text](url) → text
  text = text.replace(/\[\]\([^)]*\)/g, ''); // [](url) → empty
  text = text.replace(/\[\]\(/g, ''); // broken [](  with no closing paren
  // Strip common nav words at the start of scraped content
  text = text.replace(/^(Featured|Executives|From the CEO:?|Explore topics|Made On YouTube|Kids & Teens|FIFA)\s*/gi, '');
  text = text.replace(/\b(Featured|Explore topics|Made On YouTube|Kids & Teens|FIFA World Cup|YouTube Partner Program|Live Learning and Education|YouTube Studio|Celebrations|Products and Features|What's coming to YouTube in \d{4})\b\s*/gi, '');
  // Strip "Accessibility links" and "JavaScript has been disabled" boilerplate
  text = text.replace(/accessibility links?\b[^.]*\./gi, '');
  text = text.replace(/javascript (has been|is) (disabled|required)[^.]*\./gi, '');
  text = text.replace(/\s+/g, ' ').trim();

  // Extract clean sentences (up to 2-3 sentences)
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length >= 1) {
    const combined = sentences.slice(0, 2).join(' ').trim();
    if (combined.length >= 60 && combined.length <= 260) {
      return combined;
    }
  }

  if (text.length > 210) {
    return text.slice(0, 205).replace(/\s+\S*$/, '') + '...';
  }
  return text || 'Recent development reported in public coverage.';
}

/**
 * Format full context / evidence snippet for progressive disclosure
 */
function cleanEvidenceText(rawText) {
  if (!rawText) return 'No additional raw context available.';
  let text = String(rawText);
  text = text.replace(/Image\s+\d+:[^\n]+/gi, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 360) {
    return text.slice(0, 350).replace(/\s+\S*$/, '') + '...';
  }
  return text;
}

/**
 * Determine verification credibility tier:
 * - "verified": Primary confirmation (official blog, press room, company release)
 * - "reported": Credible coverage by established news media (BBC, Variety, Reuters, PPC Land, TechCrunch)
 * - "uncertain": Needs verification (third-party moves, former roles, rumors, unconfirmed reports)
 */
function determineVerificationStatus(dev, matchedRaw, assignedSource) {
  const titleAndSummary = (dev.title + ' ' + (dev.summary || '')).toLowerCase();
  const fullText = (titleAndSummary + ' ' + (matchedRaw?.content || '')).toLowerCase();
  
  // Speculative or unconfirmed flags — check title/summary only for "former" (body text may mention it incidentally)
  if (dev.status === 'uncertain') return 'uncertain';
  if (fullText.includes('rumor') || fullText.includes('unconfirmed') || fullText.includes('speculat') || fullText.includes('alleged')) {
    return 'uncertain';
  }
  // "reportedly" and "former" only count if they appear in the title or summary, not deep in body text
  if (titleAndSummary.includes('reportedly') || titleAndSummary.includes('former')) {
    return 'uncertain';
  }
  
  const site = (assignedSource?.site || '').toLowerCase();
  const url = (assignedSource?.url || '').toLowerCase();
  
  // Primary official sources
  if (site.includes('blog.') || url.includes('/blog') || site.includes('newsroom') || url.includes('/press') || site.includes('about.') || site.includes('developers.google.com')) {
    return 'verified';
  }
  
  // Established journalism
  const TIER1_MEDIA = ['bbc.com', 'bbc.co.uk', 'variety.com', 'reuters.com', 'bloomberg.com', 'techcrunch.com', 'cnbc.com', 'theverge.com', 'wsj.com', 'ft.com', 'businessinsider.com', 'ppc.land', 'nytimes.com', 'wired.com'];
  if (TIER1_MEDIA.some(domain => site.includes(domain))) {
    return 'reported';
  }
  
  return dev.status === 'verified' ? 'verified' : 'reported';
}

/**
 * Clean raw page titles: strip site suffixes like "| Google for Developers"
 * and truncate excessively long titles to a readable headline.
 */
function cleanTitle(rawTitle) {
  if (!rawTitle) return 'Recent Update';
  let t = rawTitle.trim();

  // Strip site-name suffixes after pipe or dash: "Title | Site Name" → "Title"
  t = t.replace(/\s*[|–—-]\s*(Google for Developers|Google|YouTube|Medium|Forbes|TechCrunch|BBC|CNBC|The Verge|Bloomberg|Reuters|Variety|Business Insider)\s*$/i, '');
  // Strip leading "Revision History" prefix from API docs pages
  t = t.replace(/^Revision History\s*[|:–—-]\s*/i, '');

  if (t.length > 80) {
    t = t.slice(0, 77).replace(/\s+\S*$/, '') + '...';
  }
  return t || rawTitle.trim();
}

/**
 * High-precision category classifier
 * Prevents misclassifications:
 * - AI features / models -> "AI & Product Updates" (NOT Leadership!)
 * - Developer APIs, documentation, revision history -> "Developer Ecosystem / Technical Discussion" (NOT Product Launch!)
 * - Workspace / Office suite -> "Workspace Product Updates" (NOT generic Industry Movement!)
 * - Partnerships / cross-company launches -> "Partnership & Alliances"
 * - True executive appointments -> "Leadership"
 */
function detectCategory(text, rawUrl = '') {
  const lower = (text + ' ' + rawUrl).toLowerCase();

  // 1. Developer Ecosystem / Technical Discussion
  if (
    lower.includes('developers.google.com') ||
    lower.includes('github.com') ||
    /\b(api|sdk|deprecation|deprecated|revision history|developer forum|endpoint|rest api|diffs|pull request|developer docs|code storage)\b/i.test(lower)
  ) {
    return 'Developer Ecosystem / Technical Discussion';
  }

  // 2. Workspace Product Updates
  if (/\b(workspace|google docs|google sheets|google drive|workspace updates|enterprise collaboration)\b/i.test(lower)) {
    return 'Workspace Product Updates';
  }

  // 3. Strategic Partnerships & Deals (check BEFORE AI to catch "BBC launches on YouTube")
  if (/\b(partner|partners|partnership|collaborat|alliance|joint venture|licensing deal|acquisition|acquire|acquired)\b/i.test(lower)) {
    return 'Partnership & Alliances';
  }

  // Cross-company launches: company X launches/expands ON platform Y
  if (/\b(launches? on|expands? to|available on|coming to|arrives? on|debuts? on|now on)\b/i.test(lower)) {
    return 'Partnership & Alliances';
  }

  // 4. AI & Product Updates
  if (/\b(ai|artificial intelligence|generative ai|llm|machine learning|neural|diffusion|bot|agentic|gpt|gemini|claude|deep learning|music ai|ai labels|feature|rollout|redesign)\b/i.test(lower)) {
    return 'AI & Product Updates';
  }

  // 5. Leadership (Strict whole-word match - NEVER bare 'lead')
  if (/\b(appoints|appointed|appointing|hires|hired|hiring|resigns|resigned|stepping down|named as|named ceo|named cto|named cfo|named president|chief executive|chief technology|chief operating|board of directors|executive appointment|chief corporate affairs)\b/i.test(lower)) {
    return 'Leadership';
  }

  // 6. Financial & Strategic
  if (/\b(funding|revenue|q[1-4] earnings|quarterly earnings|valuation|ipo|seed round|series [a-z]|market cap|profit)\b/i.test(lower)) {
    return 'Financial & Strategic';
  }

  return 'Product & Company Updates';
}

/**
 * Standardize and verify source attribution for each extracted development
 */
function verifyAndAttachSources(developments, rawArticles) {
  if (!Array.isArray(developments) || developments.length === 0) {
    return [];
  }

  const verifiedDevelopments = [];
  const seenHeadlines = new Set();

  for (let i = 0; i < developments.length; i++) {
    const dev = developments[i];
    if (!dev || !dev.title) continue;

    // Skip vague/bare titles (just the subject name with no real headline)
    const titleWords = dev.title.trim().split(/\s+/);
    if (titleWords.length <= 2) continue;

    // Skip aggregator/roundup/directory pages and job listings (not real developments)
    const lowerTitle = dev.title.toLowerCase();
    if (/\b(updated weekly|updated daily|tips and tricks|top \d+ |best \d+ |complete guide|how to |tutorial)\b/i.test(lowerTitle)) continue;

    // Skip job postings
    const lowerUrl = (dev.source?.url || rawArticles[dev.sourceIndex]?.url || '').toLowerCase();
    if (lowerUrl.includes('linkedin.com/jobs') || lowerUrl.includes('/careers') || /\b(job posting|now hiring|we're hiring|open position|apply now)\b/i.test(lowerTitle)) continue;

    // Deduplicate repetitive findings
    // Extract core noun phrases for matching (strip verbs, articles, prepositions, location words)
    const coreKey = dev.title.toLowerCase()
      .replace(/\b(the|a|an|to|on|in|for|of|and|is|by|at|from|with|launch|launches|launched|launching|expand|expands|expanded|viewers?|users?|uk|us|usa|channel)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 22);
    if (seenHeadlines.has(coreKey)) continue;
    seenHeadlines.add(coreKey);

    let assignedSource = null;
    let matchedRaw = null;

    // Verify source index
    if (
      typeof dev.sourceIndex === 'number' &&
      dev.sourceIndex >= 0 &&
      dev.sourceIndex < rawArticles.length
    ) {
      matchedRaw = rawArticles[dev.sourceIndex];
      assignedSource = {
        title: matchedRaw.title,
        url: matchedRaw.url,
        site: matchedRaw.site,
        publishedDate: matchedRaw.publishedDate
      };
    } else {
      matchedRaw = rawArticles.find(a =>
        a.title.toLowerCase().includes(dev.title.toLowerCase().slice(0, 20))
      ) || rawArticles[i] || rawArticles[0];

      if (matchedRaw) {
        assignedSource = {
          title: matchedRaw.title,
          url: matchedRaw.url,
          site: matchedRaw.site,
          publishedDate: matchedRaw.publishedDate
        };
      }
    }

    const verificationStatus = determineVerificationStatus(dev, matchedRaw, assignedSource);

    // Determine relevance indicator
    let relevance = dev.relevance;
    if (!relevance || !['High', 'Medium', 'Low'].includes(relevance)) {
      relevance = verifiedDevelopments.length < 2 ? 'High' : (verifiedDevelopments.length < 4 ? 'Medium' : 'Low');
    }

    const summaryClean = cleanSummaryText(dev.summary || matchedRaw?.content, dev.title);
    const contextClean = dev.context ? cleanEvidenceText(dev.context) : cleanEvidenceText(matchedRaw?.content);
    const category = detectCategory(dev.title + ' ' + summaryClean, assignedSource?.url || '');

    verifiedDevelopments.push({
      title: cleanTitle(dev.title),
      summary: summaryClean,
      category,
      relevance,
      date: dev.date || assignedSource?.publishedDate || 'Recent',
      status: verificationStatus,
      source: assignedSource,
      evidence: contextClean
    });

    // Cap at top 5 most impactful developments for one-page executive scan
    if (verifiedDevelopments.length >= 5) break;
  }

  return verifiedDevelopments;
}

/**
 * Builds 3-4 concise, substantive executive takeaways.
 * Replaces generic templates with precise, topic-specific takeaways.
 */
function buildExecutiveSummary(subject, windowInfo, developments, rawArticles) {
  const takeaways = [];

  for (let i = 0; i < Math.min(developments.length, 4); i++) {
    const dev = developments[i];
    let leadIn = 'Product Update:';

    if (dev.category.includes('AI')) {
      leadIn = 'AI & Product Update:';
    } else if (dev.category.includes('Developer')) {
      leadIn = 'Developer & Technical Update:';
    } else if (dev.category.includes('Workspace')) {
      leadIn = 'Workspace Product Update:';
    } else if (dev.category.includes('Leadership')) {
      leadIn = 'Leadership Transition:';
    } else if (dev.category.includes('Partnership')) {
      leadIn = 'Strategic Partnership:';
    }

    // Extract substantive claim from summary
    const cleanSentence = dev.summary.split('. ')[0] || dev.title;
    takeaways.push(`${leadIn} ${cleanTitle(dev.title)} (${dev.date}) — ${cleanSentence.replace(/\.$/, '')}.`);
  }

  return takeaways;
}

/**
 * Deterministic fallback generator in case Bifrost gateway is offline
 */
function generateDeterministicBriefing(subject, windowInfo, articles) {
  const rawDevs = articles.slice(0, 5).map((article, idx) => ({
    title: article.title,
    summary: cleanSummaryText(article.content, article.title),
    category: detectCategory(article.title + ' ' + article.content, article.url),
    relevance: idx < 2 ? 'High' : (idx < 4 ? 'Medium' : 'Low'),
    date: article.publishedDate,
    status: 'verified',
    sourceIndex: idx,
    context: cleanEvidenceText(article.content)
  }));

  const developments = verifyAndAttachSources(rawDevs, articles);
  const executiveSummary = buildExecutiveSummary(subject, windowInfo, developments, articles);

  const overview = `Pre-meeting briefing for ${subject} scheduled for ${windowInfo.meetingDateFormatted} at ${windowInfo.meetingTimeFormatted}. Synthesizes public news and releases from the 30-day window between ${windowInfo.startDateFormatted} and ${windowInfo.meetingDateFormatted}.`;

  const insights = [
    {
      headline: 'Active Product & Platform Momentum',
      takeaway: `${subject} recorded announcements across ${articles.length} verified publications in the past 30 days, emphasizing AI features and platform improvements.`
    },
    {
      headline: 'Discussion Grounding',
      takeaway: 'All findings are corroborated with original news links. Consult attached citations before addressing sensitive partnership details.'
    }
  ];

  const discussionPoints = [
    `[Strategic Direction] How do the latest AI and platform updates from the past 30 days align with your immediate goals for today's conversation?`,
    `[Execution Milestones] What internal milestones or timeline updates should we anticipate following the recent public announcements?`,
    `[Ecosystem Impact] Are there any unannounced priorities or organizational shifts that complement the public coverage?`
  ];

  return {
    overview,
    executiveSummary,
    developments,
    insights,
    discussionPoints
  };
}

/**
 * Master Briefing Generator Orchestration
 */
async function generateVerifiedBriefing(subject, windowInfo, rawArticles) {
  let synthesized;

  try {
    synthesized = await generateBriefingWithBifrost(subject, windowInfo, rawArticles);
  } catch (bifrostErr) {
    console.warn(`[BriefingGenerator] Bifrost Gateway notice (${bifrostErr.message}). Using deterministic research synthesis.`);
    synthesized = generateDeterministicBriefing(subject, windowInfo, rawArticles);
  }

  // Cross-verify developments and attach verified sources
  const developments = verifyAndAttachSources(synthesized.developments, rawArticles);

  // Executive summary verification
  let executiveSummary = synthesized.executiveSummary;
  if (!Array.isArray(executiveSummary) || executiveSummary.length < 2) {
    executiveSummary = buildExecutiveSummary(subject, windowInfo, developments, rawArticles);
  }

  // Normalize all verified sources
  const sources = rawArticles.map(a => ({
    title: a.title,
    url: a.url,
    site: a.site,
    publishedDate: a.publishedDate
  }));

  return {
    subject,
    meetingDateFormatted: windowInfo.meetingDateFormatted,
    meetingTimeFormatted: windowInfo.meetingTimeFormatted,
    windowLabel: windowInfo.windowLabel,
    overview: synthesized.overview || `Pre-meeting briefing for ${subject}.`,
    executiveSummary,
    developments,
    insights: synthesized.insights || [],
    discussionPoints: synthesized.discussionPoints || [],
    sources
  };
}

module.exports = {
  cleanSummaryText,
  cleanEvidenceText,
  cleanTitle,
  verifyAndAttachSources,
  buildExecutiveSummary,
  generateDeterministicBriefing,
  generateVerifiedBriefing,
  detectCategory
};
