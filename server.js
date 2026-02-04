/**
 * Cloudflare Bypass API Server
 *
 * HTTP server exposing Cloudflare bypass features
 * for integration with web-screenshot-capture or other tools.
 *
 * Usage: node server.js
 * Default port: 3001 (configurable via PORT env)
 */

const express = require('express');
const cors = require('cors');
const { CloudflareBypassAPI } = require('./api.js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Instance API
const bypassAPI = new CloudflareBypassAPI();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cloudflare-bypass',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /bypass
 * Perform Cloudflare bypass and return screenshot + data
 *
 * Body:
 * {
 *   "url": "https://example.com",
 *   "options": {
 *     "timeout": 60000,
 *     "headless": true,
 *     "screenshot": true,
 *     "fullPage": true,
 *     "userAgent": "custom-ua",
 *     "proxy": "http://proxy:port",
 *     "width": 1920,
 *     "height": 1080,
 *     "waitAfterBypass": 3000
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "screenshot": "base64...",
 *     "cookies": [...],
 *     "finalUrl": "https://...",
 *     "title": "Page Title",
 *     "cloudflareDetected": true,
 *     "bypassSuccessful": true,
 *     "timing": { ... }
 *   }
 * }
 */
app.post('/bypass', async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required',
      detail: 'Please provide a valid URL in the request body'
    });
  }

  try {
    const result = await bypassAPI.bypass(url, options);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`[ERROR] Bypass failed for ${url}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      detail: error.stack
    });
  }
});

/**
 * POST /detect
 * Detect if a URL uses Cloudflare protection
 *
 * Body: { "url": "https://example.com" }
 * Response: { "cloudflareDetected": true/false, "indicators": [...] }
 */
app.post('/detect', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    const result = await bypassAPI.detect(url);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`[ERROR] Detection failed for ${url}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /screenshot
 * Capture a simple screenshot (without forced bypass)
 * Bypass will be automatic if Cloudflare is detected
 */
app.post('/screenshot', async (req, res) => {
  const { url, options = {} } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'URL is required'
    });
  }

  try {
    const result = await bypassAPI.screenshot(url, options);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(`[ERROR] Screenshot failed for ${url}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /stats
 * Return service statistics
 */
app.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: bypassAPI.getStats()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    detail: err.message
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
============================================================
         Cloudflare Bypass API Server
============================================================
  Status:  RUNNING
  Port:    ${PORT}
  Time:    ${new Date().toISOString()}
------------------------------------------------------------
  Endpoints:
    POST /bypass     - Bypass Cloudflare + screenshot
    POST /detect     - Detect Cloudflare protection
    POST /screenshot - Capture with auto-bypass
    GET  /health     - Health check
    GET  /stats      - Service statistics
============================================================
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[INFO] SIGTERM received, shutting down...');
  await bypassAPI.cleanup();
  server.close(() => {
    console.log('[INFO] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[INFO] SIGINT received, shutting down...');
  await bypassAPI.cleanup();
  server.close(() => {
    console.log('[INFO] Server closed');
    process.exit(0);
  });
});

module.exports = app;
