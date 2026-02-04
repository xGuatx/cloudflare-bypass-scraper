#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function showHelp() {
  console.log(`
Web Automation Tool

Usage: node cli.js [options]

Options:
  -u, --url <url>          Target URL to visit
  -c, --config <path>      Path to config file (default: ./config.json)
  -o, --output <dir>       Output directory for screenshots
  --headless               Run in headless mode (default: true)
  --no-headless           Run with visible browser
  --bypass-cloudflare     Enable Cloudflare bypass
  --timeout <ms>          Timeout in milliseconds (default: 15000)
  --user-agent <agent>    Custom user agent string
  --debug                 Enable debug logging
  -h, --help              Show this help message

Examples:
  node cli.js --url https://example.com
  node cli.js --config ./custom-config.json --debug
  node cli.js --url https://site.com --no-headless --bypass-cloudflare
`);
}

function parseArgs(args) {
  const options = {
    configPath: './config.json'
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
        
      case '-u':
      case '--url':
        options.url = args[++i];
        break;
        
      case '-c':
      case '--config':
        options.configPath = args[++i];
        break;
        
      case '-o':
      case '--output':
        options.output = args[++i];
        break;
        
      case '--headless':
        options.headless = true;
        break;
        
      case '--no-headless':
        options.headless = false;
        break;
        
      case '--bypass-cloudflare':
        options.bypassCloudflare = true;
        break;
        
      case '--timeout':
        options.timeout = parseInt(args[++i]);
        break;
        
      case '--user-agent':
        options.userAgent = args[++i];
        break;
        
      case '--debug':
        options.debug = true;
        break;
        
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  
  return options;
}

function mergeConfigWithArgs(config, args) {
  const merged = { ...config };
  
  if (args.url) merged.url = args.url;
  if (args.output) merged.output = args.output;
  if (args.headless !== undefined) merged.headless = args.headless;
  if (args.bypassCloudflare !== undefined) merged.bypassCloudflare = args.bypassCloudflare;
  if (args.timeout) merged.timeout = args.timeout;
  if (args.userAgent) merged.userAgent = args.userAgent;
  if (args.debug !== undefined) merged.debug = args.debug;
  
  return merged;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  let config = {};
  if (fs.existsSync(args.configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(args.configPath, 'utf8'));
    } catch (err) {
      console.error(`[!] Failed to read config file: ${err.message}`);
      process.exit(1);
    }
  }
  
  const finalConfig = mergeConfigWithArgs(config, args);
  
  if (!finalConfig.url) {
    console.error('[!] No URL specified. Use --url or add url to config file.');
    showHelp();
    process.exit(1);
  }
  
  const tempConfigPath = path.join('/tmp', '.temp-config.json');
  fs.writeFileSync(tempConfigPath, JSON.stringify(finalConfig, null, 2));
  
  try {
    const { run } = require('./main.js');
    process.env.CONFIG_PATH = tempConfigPath;
    await run();
  } finally {
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[!] CLI Error:', err.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, mergeConfigWithArgs };