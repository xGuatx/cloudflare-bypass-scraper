/**
 * Cloudflare Bypass API Module
 *
 * Reusable module for Cloudflare bypass.
 * Can be used directly in Node.js or via the HTTP server.
 *
 * Usage:
 *   const { CloudflareBypassAPI } = require('./api.js');
 *   const api = new CloudflareBypassAPI();
 *   const result = await api.bypass('https://example.com');
 */

const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

const CLOUDFLARE_INDICATORS = [
  'cloudflare',
  'cf-ray',
  'cf-challenge',
  'challenge-platform',
  'turnstile',
  'verify you are human',
  'just a moment',
  'checking your browser',
  'ddos protection',
  'security check',
  'please wait'
];

class CloudflareBypassAPI {
  constructor() {
    this.browser = null;
    this.stats = {
      totalRequests: 0,
      successfulBypasses: 0,
      failedBypasses: 0,
      cloudflareDetections: 0,
      startTime: Date.now()
    };
  }

  /**
   * Get a random User-Agent
   */
  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Initialize browser if needed
   */
  async ensureBrowser(options = {}) {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: options.headless !== false,
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-breakpad',
          '--disable-crash-reporter',
          '--js-flags=--max-old-space-size=512'
        ]
      });
      console.log('[INFO] Browser initialized');
    }
    return this.browser;
  }

  /**
   * Detect Cloudflare protection on a page
   */
  async detectCloudflareOnPage(page) {
    try {
      const title = await page.title();
      const url = page.url();

      // Check title
      const titleLower = title.toLowerCase();
      if (titleLower.includes('cloudflare') || titleLower.includes('just a moment')) {
        return { detected: true, indicator: 'title' };
      }

      // Check URL
      if (url.includes('challenges.cloudflare.com')) {
        return { detected: true, indicator: 'url' };
      }

      // Check page content
      const contentCheck = await page.evaluate(() => {
        const content = document.documentElement.outerHTML.toLowerCase();
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';

        const indicators = [
          'cloudflare', 'cf-ray', 'challenge-platform', 'turnstile',
          'verify you are human', 'just a moment', 'checking your browser',
          'please wait', 'security check', 'ddos protection'
        ];

        for (const indicator of indicators) {
          if (content.includes(indicator) || bodyText.includes(indicator)) {
            return { found: true, indicator };
          }
        }
        return { found: false };
      });

      if (contentCheck.found) {
        return { detected: true, indicator: contentCheck.indicator };
      }

      return { detected: false };

    } catch (error) {
      console.warn('[WARN] Error during Cloudflare detection:', error.message);
      return { detected: false, error: error.message };
    }
  }

  /**
   * Try to interact with Cloudflare challenge
   */
  async interactWithChallenge(page) {
    console.log('[INFO] Attempting to interact with Cloudflare challenge...');

    try {
      // Wait for Turnstile iframe to load
      await page.waitForTimeout(2000);

      // Approach 1: Search in frames
      const frames = page.frames();
      for (const frame of frames) {
        if (frame.url().includes('challenges.cloudflare.com')) {
          console.log('[INFO] Found Cloudflare challenge frame');
          try {
            const checkbox = await frame.$('input[type="checkbox"]');
            if (checkbox) {
              console.log('[INFO] Clicking checkbox in frame...');
              await checkbox.click();
              await page.waitForTimeout(3000);
              return true;
            }
          } catch (e) {
            console.log('[DEBUG] Frame interaction failed:', e.message);
          }
        }
      }

      // Approach 2: Selectors on main page
      const selectors = [
        'input[type="checkbox"]',
        '.cf-turnstile',
        '[data-sitekey]',
        '.challenge-form input[type="checkbox"]'
      ];

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element && await element.isVisible()) {
            console.log(`[INFO] Clicking element: ${selector}`);
            await element.click({ timeout: 3000 });
            await page.waitForTimeout(3000);
            return true;
          }
        } catch (e) {
          // Continue
        }
      }

      // Approach 3: Generic interactions
      try {
        await page.click('body');
        await page.waitForTimeout(500);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      } catch (e) {
        // Ignore
      }

      return false;

    } catch (error) {
      console.warn('[WARN] Challenge interaction error:', error.message);
      return false;
    }
  }

  /**
   * Wait for Cloudflare bypass to complete
   */
  async waitForBypass(page, timeout = 90000) {
    console.log('[INFO] Waiting for Cloudflare bypass...');

    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && (Date.now() - startTime) < timeout) {
      attempts++;
      console.log(`[INFO] Bypass attempt ${attempts}/${maxAttempts}`);

      // Try interaction
      await this.interactWithChallenge(page);

      try {
        // Wait for challenge to disappear
        await page.waitForFunction(
          () => {
            const url = window.location.href;
            const title = document.title.toLowerCase();
            const bodyText = document.body ? document.body.innerText.toLowerCase() : '';

            const notOnChallenge = !url.includes('challenges.cloudflare.com');
            const noIndicators = !['cloudflare', 'just a moment', 'checking your browser', 'verify you are human']
              .some(ind => title.includes(ind) || bodyText.includes(ind));
            const hasContent = bodyText.length > 500;

            return notOnChallenge && noIndicators && hasContent;
          },
          { timeout: 30000, polling: 2000 }
        );

        console.log('[INFO] Bypass successful!');
        return true;

      } catch (e) {
        console.log(`[WARN] Bypass attempt ${attempts} timed out`);
      }
    }

    console.log('[WARN] Bypass may have failed, continuing anyway...');
    return false;
  }

  /**
   * Perform a complete Cloudflare bypass
   *
   * @param {string} url - Target URL
   * @param {object} options - Configuration options
   * @returns {object} Result with screenshot, cookies, etc.
   */
  async bypass(url, options = {}) {
    this.stats.totalRequests++;
    const startTime = Date.now();
    const timing = {};

    const config = {
      timeout: options.timeout || 60000,
      headless: options.headless !== false,
      screenshot: options.screenshot !== false,
      fullPage: options.fullPage !== false,
      userAgent: options.userAgent || this.getRandomUserAgent(),
      proxy: options.proxy || null,
      width: options.width || 1920,
      height: options.height || 1080,
      waitAfterBypass: options.waitAfterBypass || 3000
    };

    let context = null;
    let page = null;

    try {
      // Initialize browser
      timing.browserInit = Date.now() - startTime;
      await this.ensureBrowser(config);

      // Create isolated context
      const contextOptions = {
        viewport: { width: config.width, height: config.height },
        userAgent: config.userAgent,
        ignoreHTTPSErrors: true,
        bypassCSP: true
      };

      if (config.proxy) {
        contextOptions.proxy = { server: config.proxy };
      }

      context = await this.browser.newContext(contextOptions);
      page = await context.newPage();
      timing.contextCreation = Date.now() - startTime;

      // Navigate to URL
      console.log(`[INFO] Navigating to ${url}...`);
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeout
      });
      timing.navigation = Date.now() - startTime;

      // Wait for initial redirects
      await page.waitForTimeout(2000);

      // Detect Cloudflare
      const detection = await this.detectCloudflareOnPage(page);
      timing.detection = Date.now() - startTime;

      let bypassSuccessful = false;

      if (detection.detected) {
        console.log(`[INFO] Cloudflare detected (indicator: ${detection.indicator})`);
        this.stats.cloudflareDetections++;

        // Perform bypass
        bypassSuccessful = await this.waitForBypass(page, config.timeout);

        if (bypassSuccessful) {
          this.stats.successfulBypasses++;
        } else {
          this.stats.failedBypasses++;
        }

        // Wait after bypass
        await page.waitForTimeout(config.waitAfterBypass);
      }

      timing.bypass = Date.now() - startTime;

      // Capture screenshot
      let screenshotBase64 = null;
      if (config.screenshot) {
        const screenshot = await page.screenshot({
          fullPage: config.fullPage,
          type: 'png'
        });
        screenshotBase64 = screenshot.toString('base64');
      }
      timing.screenshot = Date.now() - startTime;

      // Get cookies
      const cookies = await context.cookies();

      // Get page info
      const pageInfo = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        contentLength: document.body ? document.body.innerText.length : 0
      }));

      timing.total = Date.now() - startTime;

      return {
        screenshot: screenshotBase64,
        screenshotFormat: 'png',
        cookies,
        finalUrl: pageInfo.url,
        title: pageInfo.title,
        contentLength: pageInfo.contentLength,
        cloudflareDetected: detection.detected,
        cloudflareIndicator: detection.indicator || null,
        bypassSuccessful,
        timing,
        config: {
          width: config.width,
          height: config.height,
          fullPage: config.fullPage,
          userAgent: config.userAgent
        }
      };

    } catch (error) {
      console.error(`[ERROR] Bypass failed for ${url}:`, error.message);
      throw error;

    } finally {
      // Cleanup
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }

  /**
   * Detect if a URL uses Cloudflare (without full bypass)
   */
  async detect(url, options = {}) {
    let context = null;
    let page = null;

    try {
      await this.ensureBrowser(options);

      context = await this.browser.newContext({
        viewport: { width: 1024, height: 768 },
        userAgent: this.getRandomUserAgent(),
        ignoreHTTPSErrors: true
      });

      page = await context.newPage();

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeout || 30000
      });

      await page.waitForTimeout(2000);

      const detection = await this.detectCloudflareOnPage(page);

      return {
        url,
        cloudflareDetected: detection.detected,
        indicator: detection.indicator || null,
        pageTitle: await page.title(),
        finalUrl: page.url()
      };

    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
  }

  /**
   * Capture a screenshot with automatic bypass if needed
   */
  async screenshot(url, options = {}) {
    return this.bypass(url, {
      ...options,
      screenshot: true
    });
  }

  /**
   * Return service statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      uptimeFormatted: this.formatUptime(Date.now() - this.stats.startTime),
      successRate: this.stats.cloudflareDetections > 0
        ? Math.round((this.stats.successfulBypasses / this.stats.cloudflareDetections) * 100)
        : 100
    };
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    if (this.browser) {
      console.log('[INFO] Closing browser...');
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { CloudflareBypassAPI, CLOUDFLARE_INDICATORS, USER_AGENTS };
