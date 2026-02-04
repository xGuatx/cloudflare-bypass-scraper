const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    console.log(`[${level.charAt(0).toUpperCase()}] ${message}`);
    fs.appendFileSync(path.join(this.logDir, 'run.log'), logEntry);
  }

  error(message, error) {
    this.log('error', message);
    if (error) {
      const errorLog = `${new Date().toISOString()} - ${error.stack}\n`;
      fs.appendFileSync(path.join(this.logDir, 'error.log'), errorLog);
    }
  }
}

function validateConfig(config) {
  const required = ['url'];
  const missing = required.filter(field => !config[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required config fields: ${missing.join(', ')}`);
  }

  try {
    new URL(config.url);
  } catch {
    throw new Error(`Invalid URL: ${config.url}`);
  }

  return {
    url: config.url,
    screenshot: config.screenshot ?? true,
    headless: config.headless ?? true,
    bypassCloudflare: config.bypassCloudflare ?? false,
    timeout: config.timeout ?? 15000,
    userAgent: config.userAgent ?? getRandomUserAgent(),
    output: config.output ?? './screenshots',
    debug: config.debug ?? false,
    proxy: config.proxy ?? null,
    userAgentRotation: config.userAgentRotation ?? false
  };
}

async function detectCloudflare(page) {
  try {
    const title = await page.title();
    const url = page.url();
    
    // Skip detection if we have legitimate authentication pages
    if (title.toLowerCase().includes('user authentication') || 
        title.toLowerCase().includes('please verify your identity') ||
        title.toLowerCase().includes('identity verification') ||
        title.toLowerCase().includes('login') ||
        title.toLowerCase().includes('sign in')) {
      return false;
    }
    
    const [titleCheck, contentCheck] = await Promise.all([
      title.toLowerCase().includes('cloudflare') || title.toLowerCase().includes('just a moment'),
      page.evaluate(() => {
        const content = document.documentElement.outerHTML.toLowerCase();
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
        
        const indicators = [
          'cloudflare', 'cf-ray', 'ddos protection', 'challenge-platform', 
          'turnstile', 'verify you are human', 'just a moment',
          'checking your browser', 'please wait', 'security check'
        ];
        
        return indicators.some(indicator => 
          content.includes(indicator) || bodyText.includes(indicator)
        );
      })
    ]);
    
    const urlCheck = url.includes('challenges.cloudflare.com');
    
    return titleCheck || contentCheck || urlCheck;
  } catch {
    return false;
  }
}

async function tryInteractWithChallenge(page, logger) {
  logger.log('info', 'Trying to interact with challenge elements...');
  
  // More aggressive approach - try clicking within the Turnstile iframe
  try {
    logger.log('info', 'Looking for Turnstile checkbox specifically...');
    
    // Wait for the Turnstile iframe to load
    await page.waitForTimeout(2000);
    
    // Try multiple approaches to find and click the checkbox
    const approaches = [
      // Approach 1: Direct iframe access
      async () => {
        const frames = await page.frames();
        logger.log('info', `Found ${frames.length} frames`);
        
        for (const frame of frames) {
          if (frame.url().includes('challenges.cloudflare.com')) {
            logger.log('info', `Checking frame: ${frame.url()}`);
            try {
              const checkbox = await frame.$('input[type="checkbox"]');
              if (checkbox) {
                logger.log('info', 'Found checkbox in Cloudflare frame, clicking...');
                await checkbox.click();
                await page.waitForTimeout(5000);
                return true;
              }
            } catch (frameError) {
              logger.log('debug', `Frame interaction failed: ${frameError.message}`);
            }
          }
        }
        return false;
      },
      
      // Approach 2: Main page selectors
      async () => {
        const selectors = [
          'input[type="checkbox"]',
          '.cf-turnstile',
          '.cf-turnstile iframe',
          '[data-sitekey]',
          '.challenge-form input[type="checkbox"]'
        ];
        
        for (const selector of selectors) {
          try {
            const element = await page.$(selector);
            if (element && await element.isVisible()) {
              logger.log('info', `Clicking element: ${selector}`);
              await element.click({ timeout: 3000 });
              await page.waitForTimeout(3000);
              return true;
            }
          } catch (error) {
            // Continue to next selector
          }
        }
        return false;
      },
      
      // Approach 3: Coordinate-based clicking on the checkbox area
      async () => {
        try {
          logger.log('info', 'Trying coordinate-based click on checkbox area...');
          // Click in the typical checkbox area (based on the screenshot)
          await page.click('body', { position: { x: 636, y: 93 } });
          await page.waitForTimeout(3000);
          return true;
        } catch (error) {
          return false;
        }
      }
    ];
    
    // Try each approach
    for (let i = 0; i < approaches.length; i++) {
      logger.log('info', `Trying approach ${i + 1}...`);
      const success = await approaches[i]();
      if (success) {
        logger.log('info', `Approach ${i + 1} succeeded`);
        return true;
      }
    }
    
  } catch (error) {
    logger.log('warn', `Challenge interaction error: ${error.message}`);
  }
  
  return false;
}

async function waitForCloudflareBypass(page, logger) {
  logger.log('info', 'Waiting for Cloudflare challenge to complete...');
  
  // Try immediate interaction
  await tryInteractWithChallenge(page, logger);
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    logger.log('info', `Bypass attempt ${attempts}/${maxAttempts}`);
    
    try {
      // Wait for either challenge to disappear or URL to change away from challenges.cloudflare.com
      await page.waitForFunction(
        () => {
          const url = window.location.href;
          const title = document.title.toLowerCase();
          const content = document.documentElement.outerHTML.toLowerCase();
          const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
          
          // Check if we're no longer on a challenge page
          const notOnChallengePage = !url.includes('challenges.cloudflare.com');
          
          // Check if challenge indicators are gone
          const challengeIndicators = [
            'challenge-platform', 'cf-challenge-running', 'turnstile',
            'verify you are human', 'just a moment', 'checking your browser',
            'account protection', 'please wait while we check', 'browser check'
          ];
          
          const noChallengeInContent = !challengeIndicators.some(indicator => 
            content.includes(indicator) || bodyText.includes(indicator) || title.includes(indicator)
          );
          
          // Check if we're truly past the challenge
          const reallyPastChallenge = notOnChallengePage && noChallengeInContent;
          
          // Additional check: make sure we have actual page content, not just challenge remnants
          const hasRealPageContent = (bodyText.length > 1000) && // Reduced requirement
                                    (bodyText.includes('login') ||
                                     bodyText.includes('password') ||
                                     bodyText.includes('email') ||
                                     bodyText.includes('signin') ||
                                     bodyText.includes('form') ||
                                     bodyText.includes('submit') ||
                                     bodyText.includes('authentication') ||
                                     bodyText.includes('verify your identity') ||
                                     content.includes('<form') ||
                                     content.includes('input type="password"') ||
                                     content.includes('action='));
          
          // Must have BOTH conditions: past challenge AND real content
          const trulySuccessful = reallyPastChallenge && hasRealPageContent;
          
          if (trulySuccessful) {
            console.log(`Success detected: URL changed and real content found (${bodyText.length} chars)`);
          }
          
          return trulySuccessful;
        },
        { timeout: 90000, polling: 3000 }
      );
      
      logger.log('info', 'Cloudflare challenge completed successfully');
      
      // Additional wait to ensure page is fully loaded
      await page.waitForTimeout(3000);
      
      return true;
      
    } catch (error) {
      logger.log('warn', `Bypass attempt ${attempts} timed out`);
      
      if (attempts < maxAttempts) {
        // Try another interaction attempt
        const interacted = await tryInteractWithChallenge(page, logger);
        
        if (!interacted) {
          // Fallback: try clicking common areas
          logger.log('info', 'Trying fallback interactions...');
          try {
            await page.click('body', { timeout: 3000 });
            await page.waitForTimeout(1000);
            await page.keyboard.press('Space');
            await page.waitForTimeout(1000);
            await page.keyboard.press('Tab');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(2000);
          } catch (interactionError) {
            logger.log('warn', 'Could not perform fallback interactions');
          }
        }
      }
    }
  }
  
  logger.log('warn', 'All bypass attempts failed');
  return false;
}

async function bypassCloudflare(page, config, logger) {
  logger.log('info', 'Starting Cloudflare bypass process...');
  
  const initialUrl = page.url();
  logger.log('info', `Initial URL: ${initialUrl}`);
  
  const success = await waitForCloudflareBypass(page, logger);
  
  if (!success) {
    logger.log('warn', 'Bypass unsuccessful, but proceeding anyway...');
    
    // Check if we have crash indicators in the logs or page content
    try {
      const pageContent = await page.evaluate(() => document.documentElement.outerHTML);
      if (pageContent.toLowerCase().includes('crashed_retry') || 
          pageContent.toLowerCase().includes('hung')) {
        logger.log('error', 'Turnstile widget crashed or hung - challenge cannot be completed automatically');
      }
    } catch (e) {
      // Continue anyway
    }
  } else {
    logger.log('info', 'Bypass completed successfully');
  }
  
  // Wait longer for any final redirects to the actual content
  logger.log('info', 'Waiting for final content to load...');
  
  // Try to wait for the real content to appear
  try {
    await page.waitForFunction(
      () => {
        const bodyText = document.body ? document.body.innerText : '';
        const content = document.documentElement.outerHTML.toLowerCase();
        
        // Look for indicators of real page content (not challenge page)
        const hasLogin = bodyText.toLowerCase().includes('login') || 
                        bodyText.toLowerCase().includes('password') || 
                        bodyText.toLowerCase().includes('email') ||
                        bodyText.toLowerCase().includes('authentication') ||
                        bodyText.toLowerCase().includes('verify your identity') ||
                        content.includes('<form');
        
        const hasSubstantialContent = bodyText.length > 500; // Even more lenient
        const notChallengeUrl = !window.location.href.includes('challenges.cloudflare.com');
        
        return hasLogin && hasSubstantialContent && notChallengeUrl;
      },
      { timeout: 30000, polling: 2000 }
    );
    
    logger.log('info', 'Real page content detected - waiting for network idle');
    
    // Now wait for network to be idle
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    logger.log('info', 'Final page fully loaded');
    
  } catch (waitError) {
    logger.log('warn', 'Timeout waiting for final content, proceeding with current state');
    
    // Still try to wait for network idle
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      logger.log('info', 'Page reached network idle state');
    } catch {
      logger.log('info', 'Network activity ongoing, proceeding anyway');
    }
  }
  
  const finalUrl = page.url();
  logger.log('info', `Final URL after bypass: ${finalUrl}`);
  
  // Final analysis of what we got
  const pageContent = await page.evaluate(() => {
    return {
      title: document.title,
      bodyLength: document.body ? document.body.innerText.length : 0,
      url: window.location.href,
      hasForm: document.querySelector('form') !== null,
      hasLogin: document.body ? document.body.innerText.toLowerCase().includes('login') : false
    };
  });
  
  logger.log('info', `Page analysis: Title="${pageContent.title}", Content=${pageContent.bodyLength} chars, HasForm=${pageContent.hasForm}, HasLogin=${pageContent.hasLogin}`);
  
  // Double-check if we're still on a challenge page
  const stillOnChallenge = await detectCloudflare(page);
  if (stillOnChallenge) {
    logger.log('warn', 'Still detected on Cloudflare challenge page');
    logger.log('warn', `Current page title: ${pageContent.title}`);
  } else {
    logger.log('info', 'Successfully bypassed Cloudflare protection');
    logger.log('info', `Reached content page with ${pageContent.bodyLength} characters`);
  }
}

async function run() {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
  const logDir = '/tmp/logs';
  
  // Ensure directories exist with proper permissions
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o755 });
  }
  
  const logger = new Logger(logDir);

  let config;
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    config = validateConfig(JSON.parse(configContent));
  } catch (err) {
    logger.error('Failed to read or validate configuration', err);
    process.exit(1);
  }

  const outputDir = '/tmp/screenshots';
  let browser = null;

  try {
    logger.log('info', `Starting navigation to ${config.url}`);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
    }

    const launchOptions = { 
      headless: config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    };

    if (config.proxy) {
      launchOptions.proxy = {
        server: config.proxy
      };
    }

    browser = await chromium.launch(launchOptions);

    const contextOptions = {
      userAgent: config.userAgentRotation ? getRandomUserAgent() : config.userAgent,
      viewport: { width: 1920, height: 1080 }
    };

    if (config.proxy) {
      contextOptions.proxy = {
        server: config.proxy
      };
    }

    const context = await browser.newContext(contextOptions);

    const page = await context.newPage();
    
    if (config.debug) {
      page.on('console', msg => {
        const text = msg.text();
        
        // Special handling for Turnstile crash messages
        if (text.toLowerCase().includes('turnstile widget seem to have hung') ||
            text.toLowerCase().includes('crashed') ||
            text.toLowerCase().includes('hung')) {
          logger.log('warn', `Console ALERT: ${text}`);
        } else {
          logger.log('debug', `Console: ${text}`);
        }
      });
      
      page.on('response', response => {
        const url = response.url();
        
        // Special handling for crash retry URLs
        if (url.includes('crashed_retry') || url.includes('failure_retry')) {
          logger.log('warn', `Response RETRY: ${response.status()} ${url}`);
        } else {
          logger.log('debug', `Response: ${response.status()} ${url}`);
        }
      });
    }

    logger.log('info', 'Navigating to target URL...');
    await page.goto(config.url, { 
      waitUntil: 'domcontentloaded',
      timeout: config.timeout 
    });
    
    logger.log('info', 'Initial page load completed');
    
    // Wait for potential JavaScript redirects
    const initialUrl = page.url();
    logger.log('info', `Initial URL: ${initialUrl}`);
    
    // Wait up to 10 seconds for redirects to occur
    let redirectWaitTime = 0;
    const maxRedirectWait = 10000;
    
    while (redirectWaitTime < maxRedirectWait) {
      await page.waitForTimeout(1000);
      redirectWaitTime += 1000;
      
      const currentUrl = page.url();
      logger.log('debug', `URL check after ${redirectWaitTime}ms: ${currentUrl}`);
      
      if (currentUrl !== initialUrl && !currentUrl.includes('chrome-error://')) {
        logger.log('info', `Redirect detected to: ${currentUrl}`);
        // Wait a bit more for the redirected page to load
        await page.waitForTimeout(3000);
        break;
      }
      
      if (currentUrl.includes('chrome-error://')) {
        logger.log('error', `Chrome error detected: ${currentUrl}`);
        // Try to get page content for debugging
        try {
          const pageContent = await page.content();
          logger.log('debug', `Page content length: ${pageContent.length}`);
        } catch (e) {
          logger.log('error', 'Could not get page content');
        }
        break;
      }
    }

    await page.waitForTimeout(3000);

    if (config.bypassCloudflare) {
      await bypassCloudflare(page, config, logger);
    } else {
      const hasCloudflare = await detectCloudflare(page);
      if (hasCloudflare) {
        logger.log('info', 'Cloudflare detected automatically, attempting bypass...');
        await bypassCloudflare(page, config, logger);
      }
    }

    await page.waitForTimeout(2000);
    
    if (config.screenshot) {
      const screenshotPath = path.join(outputDir, 'page.png');
      const finalUrl = page.url();
      
      logger.log('info', `Taking screenshot of final page: ${finalUrl}`);
      await page.screenshot({ 
        path: screenshotPath,
        fullPage: true,
        type: 'png'
      });
      logger.log('info', `Screenshot saved to ${screenshotPath}`);
    }

    logger.log('info', 'Automation completed successfully');

  } catch (err) {
    logger.error('Error during automation', err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = { run, validateConfig, Logger };