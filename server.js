require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const briefingRouter = require('./src/routes/briefing');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (including index.html and any local assets)
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Briefly Pre-Meeting Briefing Agent',
    timestamp: new Date().toISOString()
  });
});

// API Routes
// The router's POST / handler is exposed as the documented /api/briefing endpoint.
app.use('/api/briefing', briefingRouter);

// Fallback to index.html for any frontend navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Briefly Server running on http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(` Serving Canva-designed frontend at http://localhost:${PORT}`);
  console.log(`====================================================`);
});
