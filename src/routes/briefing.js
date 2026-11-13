const express = require('express');
const router = express.Router();
const { computeResearchWindow } = require('../utils/date');
const { searchRecentDevelopments } = require('../services/tavily');
const { generateVerifiedBriefing } = require('../services/briefingGenerator');

/**
 * POST /api/briefing
 * End-to-end Pre-Meeting Briefing Pipeline
 * 1. Validates inputs & calculates 30-day research window
 * 2. Executes targeted web research with Tavily
 * 3. Synthesizes & verifies briefing with Bifrost Gateway
 * 4. Returns structured one-page briefing for Canva UI
 */
router.post('/briefing', async (req, res) => {
  try {
    const { subject, meetingDate, meetingTime } = req.body;

    // 1. Input Validation
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Missing Name',
        error: 'Please enter a valid company name or individual name to research.'
      });
    }

    if (!meetingDate) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Missing Meeting Date',
        error: 'Please select your scheduled meeting date.'
      });
    }

    // 2. Compute 30-day research window
    let windowInfo;
    try {
      windowInfo = computeResearchWindow(meetingDate, meetingTime);
    } catch (dateErr) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Invalid Schedule',
        error: dateErr.message || 'Please check the scheduled meeting date and time.'
      });
    }

    const trimmedSubject = subject.trim();

    // 3. Web Research via Tavily (strict 30 days)
    let rawArticles;
    try {
      rawArticles = await searchRecentDevelopments(trimmedSubject, windowInfo);
    } catch (searchErr) {
      console.error('[BriefingRoute] Tavily search error:', searchErr.message);
      return res.status(502).json({
        success: false,
        errorTitle: 'Research Provider Error',
        error: searchErr.message || 'Unable to connect to Tavily. Please check your TAVILY_API_KEY in .env.'
      });
    }

    // 4. Handle empty search results gracefully
    if (!rawArticles || rawArticles.length === 0) {
      return res.status(404).json({
        success: false,
        errorTitle: 'No Recent Coverage Found',
        error: `We couldn't find source-linked coverage for "${trimmedSubject}" in the 30 days before this meeting (${windowInfo.windowLabel}). Try a more specific name or verify that public news is available.`
      });
    }

    // 5. Bifrost Gateway Analysis & Factual Verification
    let briefingData;
    try {
      briefingData = await generateVerifiedBriefing(trimmedSubject, windowInfo, rawArticles);
    } catch (synthesisErr) {
      console.error('[BriefingRoute] Synthesis error:', synthesisErr.message);
      return res.status(500).json({
        success: false,
        errorTitle: 'Briefing Generation Failed',
        error: 'An error occurred while synthesizing the briefing report. Please try again.'
      });
    }

    // 6. Return verified, structured briefing
    return res.status(200).json({
      success: true,
      data: briefingData
    });

  } catch (error) {
    console.error('[BriefingRoute] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      errorTitle: 'Internal Server Error',
      error: 'An unexpected internal error occurred. Please try again.'
    });
  }
});

module.exports = router;
