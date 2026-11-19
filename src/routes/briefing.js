// src/routes/briefing.js
const express = require('express');
const router = express.Router();
const { generateVerifiedBriefing } = require('../services/briefingGenerator');
const { computeResearchWindow } = require('../utils/date');
const fs = require('fs');
const path = require('path');

// Directory to store persisted briefings
const BRIEFINGS_DIR = path.join(__dirname, '../../data/briefings');
if (!fs.existsSync(BRIEFINGS_DIR)) {
  fs.mkdirSync(BRIEFINGS_DIR, { recursive: true });
}

/**
 * POST /api/briefing
 * Generates a briefing and saves it for later retrieval.
 * Returns { success:true, data:{ id, ...briefing } }
 */
router.post('/', async (req, res) => {
  try {
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const meetingDate = typeof req.body?.meetingDate === 'string' ? req.body.meetingDate.trim() : '';
    const meetingTime = typeof req.body?.meetingTime === 'string' ? req.body.meetingTime.trim() : '';

    if (!subject) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Subject is required',
        error: 'Enter a company or person name before generating a briefing.'
      });
    }

    if (subject.length > 200) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Subject is too long',
        error: 'Use a company or person name with no more than 200 characters.'
      });
    }
    let windowInfo;
    try {
      windowInfo = computeResearchWindow(meetingDate, meetingTime);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        errorTitle: 'Invalid meeting details',
        error: validationError.message
      });
    }
    const rawArticles = await require('../services/tavily').searchRecentDevelopments(subject, windowInfo);
    const briefing = await generateVerifiedBriefing(subject, windowInfo, rawArticles);

    // Persist the briefing – simple timestamp id
    const id = Date.now().toString();
    const filePath = path.join(BRIEFINGS_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ id, subject, meetingDate, meetingTime, createdAt: new Date().toISOString(), briefing }, null, 2));

    res.json({ success: true, data: { id, ...briefing } });
  } catch (err) {
    console.error('[Briefing route] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/briefing/history
 * Returns an array of saved briefings (id, subject, meetingDate, createdAt)
 */
router.get('/history', (req, res) => {
  try {
    const files = fs.readdirSync(BRIEFINGS_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      const content = JSON.parse(fs.readFileSync(path.join(BRIEFINGS_DIR, f), 'utf8'));
      return { id: content.id, subject: content.subject, meetingDate: content.meetingDate, createdAt: content.createdAt };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: list });
  } catch (err) {
    console.error('[Briefings history] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/briefing/:id
 * Returns one saved briefing for the history viewer.
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid briefing id.' });
    }

    const filePath = path.join(BRIEFINGS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Briefing not found' });
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data: { ...content, ...content.briefing } });
  } catch (err) {
    console.error('[Briefing retrieval] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/briefing/download/:id
 * Streams the selected briefing as a PDF.
 */
router.get('/download/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(BRIEFINGS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Briefing not found' });
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${content.subject}_briefing_${id}.pdf"`);
    doc.pipe(res);

    const heading = (txt, size = 20) => { doc.moveDown().fontSize(size).fillColor('#183B56').text(txt, { underline: true }); };
    const sub = (txt, size = 14) => { doc.moveDown().fontSize(size).fillColor('#4F83CC').text(txt); };
    const normal = (txt) => { doc.moveDown().fontSize(12).fillColor('#333333').text(txt); };

    heading('Pre‑Meeting Briefing');
    normal(`Subject: ${content.subject}`);
    normal(`Meeting: ${content.meetingDate} ${content.meetingTime}`);
    normal(`Generated on: ${new Date(content.createdAt).toLocaleString()}`);

    heading('Executive Summary');
    content.briefing.executiveSummary.forEach(t => normal(t));

    heading('Key Developments');
    content.briefing.developments.forEach(dev => {
      sub(`${dev.title} (${dev.date})`);
      normal(`${dev.category} – ${dev.relevance}`);
      normal(dev.summary);
    });

    heading('Suggested Discussion Points');
    content.briefing.discussionPoints.forEach(p => normal(p));

    heading('Sources');
    content.briefing.sources.forEach(src => {
      normal(`${src.title} – ${src.site} – ${src.publishedDate}`);
    });

    doc.end();
  } catch (err) {
    console.error('[Briefing download] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
