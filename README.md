# Cloudflare Bypass API

HTTP service and Node.js module for automatic Cloudflare protection bypass.
Designed to integrate with **web-screenshot-capture** or any other tool.

## Security and Legal Warnings

**AUTHORIZED USE ONLY:**
- SOC (Security Operations Center) and cybersecurity threat analysis
- Malicious website analysis in controlled environments
- Authorized penetration testing with written permission
- Security research for educational and defensive purposes
- Forensic analysis of phishing/malware pages

**STRICTLY PROHIBITED:**
- Unauthorized data scraping
- Violation of website Terms of Service
- Illegal or malicious activities
- DDoS or intentional server overload
- Protection bypass without explicit authorization

## Features

- HTTP REST API for easy integration
- Automatic Cloudflare detection and bypass attempt
- Intelligent dynamic waiting (no fixed delays)
- Full-page screenshots with cookies export
- Multiple integration options (HTTP, Node.js module, Python client)
- Docker-ready with health checks
- Proxy management and User-Agent rotation

## Project Structure

```
cloudflare-bypass-scraper/
|-- server.js            # HTTP API server (Express)
|-- api.js               # Reusable Node.js module
|-- client.js            # JavaScript client for HTTP API
|-- main.js              # Standalone automation script
|-- cli.js               # Command-line interface
|-- integrations/
|   |-- python_client.py          # Python async client
|   |-- web_screenshot_capture.py # Integration module
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
`-- venv/                # Python virtual environment
```

## Installation

### Prerequisites

- Docker and Docker Compose installed
- Or Node.js 20+ for local execution
- Python 3.10+ for Python client (with venv)

### Docker Method (Recommended)

```bash
cd cloudflare-bypass-scraper

# Build and start the API server
docker compose build api
docker compose up -d api

# Check health
curl http://localhost:3001/health
```

### Python Client Setup

```bash
# Create and activate venv
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install aiohttp playwright
playwright install chromium
```

## HTTP API Usage

### Start the Server

```bash
# Docker (recommended)
docker compose up -d api

# Check logs
docker compose logs api --tail 20
```

The API will be available at http://localhost:3001

### API Endpoints

#### GET /health - Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "service": "cloudflare-bypass",
  "version": "1.0.0",
  "timestamp": "2026-02-03T22:18:03.591Z"
}
```

#### POST /detect - Detect Cloudflare Protection

```bash
curl -X POST http://localhost:3001/detect \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "cloudflareDetected": false,
    "indicator": null,
    "pageTitle": "Example Domain",
    "finalUrl": "https://example.com/"
  }
}
```

#### POST /bypass - Bypass Cloudflare and Capture

```bash
curl -X POST http://localhost:3001/bypass \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","options":{"timeout":60000,"fullPage":true}}'
```

Response:
```json
{
  "success": true,
  "data": {
    "screenshot": "base64...",
    "screenshotFormat": "png",
    "cookies": [],
    "finalUrl": "https://example.com/",
    "title": "Example Domain",
    "contentLength": 1234,
    "cloudflareDetected": false,
    "bypassSuccessful": false,
    "timing": {
      "browserInit": 50,
      "navigation": 1200,
      "detection": 1250,
      "bypass": 1250,
      "screenshot": 1500,
      "total": 1500
    }
  }
}
```

#### GET /stats - Service Statistics

```bash
curl http://localhost:3001/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalRequests": 2,
    "successfulBypasses": 0,
    "failedBypasses": 1,
    "cloudflareDetections": 1,
    "uptime": 570033,
    "uptimeFormatted": "0h 9m 30s",
    "successRate": 0
  }
}
```

### API Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| timeout | number | 60000 | Timeout in milliseconds |
| headless | boolean | true | Browser headless mode |
| screenshot | boolean | true | Capture screenshot |
| fullPage | boolean | true | Full-page screenshot |
| userAgent | string | random | Custom User-Agent |
| proxy | string | null | Proxy server URL |
| width | number | 1920 | Viewport width |
| height | number | 1080 | Viewport height |
| waitAfterBypass | number | 3000 | Wait after bypass (ms) |

## Python Client Usage

```python
import asyncio
import aiohttp
import base64

async def test_bypass():
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
        # Test detection
        async with session.post('http://localhost:3001/detect',
            json={'url': 'https://example.com'}) as resp:
            data = await resp.json()
            print('Cloudflare detected:', data['data']['cloudflareDetected'])

        # Capture screenshot
        async with session.post('http://localhost:3001/bypass',
            json={'url': 'https://example.com'}) as resp:
            data = await resp.json()
            if data['success']:
                # Save screenshot
                with open('screenshot.png', 'wb') as f:
                    f.write(base64.b64decode(data['data']['screenshot']))
                print('Screenshot saved')

asyncio.run(test_bypass())
```

## Test Results

### Sites Without Cloudflare

Test on https://example.com:
- Detection: cloudflareDetected = false
- Screenshot: OK (35KB)
- Title: "Example Domain"

### Sites With Cloudflare Turnstile

Test on sites protected by Cloudflare Turnstile interactive challenge:
- Detection: cloudflareDetected = true
- Indicator: "title" (page shows "Just a moment...")
- Bypass: FAILED (interactive challenge requires human verification)
- Screenshot: Captured the challenge page (49KB)

The tool correctly detects Cloudflare protection but cannot automatically bypass
the interactive Turnstile challenge ("Verify you are human").

## Cloudflare Protection Levels

| Level | Auto-Bypass | Description |
|-------|-------------|-------------|
| JavaScript Challenge | Possible | Simple JS verification |
| Managed Challenge | Difficult | May show Turnstile |
| Interactive Challenge | No | Requires human click |
| CAPTCHA | No | Requires solving |

## Solutions for Turnstile Bypass

### Paid Solutions

| Service | Price | Description |
|---------|-------|-------------|
| 2captcha | ~$2.99/1000 | CAPTCHA solving service |
| Anti-Captcha | ~$2/1000 | CAPTCHA solving service |
| CapSolver | ~$1.5/1000 | CAPTCHA solving service |
| Residential Proxies | $5-15/GB | Bright Data, Oxylabs |

### Free Solutions

1. **Whitelist IP in Cloudflare Dashboard**
   - Security > WAF > Tools > IP Access Rules
   - Add server IP with action "Allow"

2. **Reduce Security Level**
   - Security > Settings > Security Level
   - Set to "Essentially Off" for testing

3. **Import Existing Cookies**
   - Pass challenge manually once in browser
   - Export cf_clearance cookie
   - Reuse in API requests

4. **Page Rules**
   - Disable security on specific paths

## Architecture

```
+----------------------------------+
|        External Clients          |
| (web-screenshot-capture, curl)   |
+----------------+-----------------+
                 | HTTP (port 3001)
                 v
+----------------------------------+
|      server.js (Express)         |
|  /bypass  /detect  /health       |
+----------------+-----------------+
                 |
                 v
+----------------------------------+
|  api.js (CloudflareBypassAPI)    |
|  - Cloudflare detection          |
|  - Challenge interaction         |
|  - Screenshot capture            |
|  - Cookies extraction            |
+----------------+-----------------+
                 |
                 v
+----------------------------------+
|     Playwright (Chromium)        |
|  - Headless browser              |
|  - Custom user-agents            |
+----------------------------------+
```

## Docker Commands

```bash
# Build image
docker compose build api

# Start service
docker compose up -d api

# View logs
docker compose logs api --tail 50

# Stop service
docker compose down

# Restart service
docker compose restart api
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | HTTP API port |
| NODE_ENV | production | Environment mode |

## Troubleshooting

### Service not responding
```bash
docker compose logs api --tail 20
docker compose restart api
```

### Timeout errors
- Increase timeout in options: `{"timeout": 120000}`
- Check network connectivity to target site

### Cloudflare bypass failing
- This is expected for interactive Turnstile challenges
- Use free solutions (whitelist IP, reduce security level)
- Or integrate paid CAPTCHA solving service

## Integration with web-screenshot-capture

Copy `integrations/web_screenshot_capture.py` to your project:

```python
from web_screenshot_capture import CloudflareBypassMiddleware

middleware = CloudflareBypassMiddleware("http://localhost:3001")

async def capture_url(url):
    if await middleware.needs_bypass(url):
        return await middleware.capture(url, full_page=True)
    else:
        return await normal_capture(url)
```

## License

MIT - For educational and defensive security purposes only.
