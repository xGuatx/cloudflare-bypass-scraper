/**
 * Cloudflare Bypass Client
 *
 * Client HTTP pour se connecter au service cloudflare-bypass-api.
 * A utiliser dans web-screenshot-capture ou tout autre outil.
 *
 * Usage:
 *   const CloudflareBypassClient = require('cloudflare-bypass-client');
 *   const client = new CloudflareBypassClient('http://localhost:3001');
 *
 *   // Bypass avec screenshot
 *   const result = await client.bypass('https://protected-site.com');
 *
 *   // Detection seule
 *   const detection = await client.detect('https://maybe-protected.com');
 */

class CloudflareBypassClient {
  /**
   * @param {string} baseUrl - URL du service cloudflare-bypass-api (ex: http://localhost:3001)
   * @param {object} options - Options de configuration
   * @param {number} options.timeout - Timeout des requetes en ms (defaut: 120000)
   * @param {object} options.headers - Headers additionnels
   */
  constructor(baseUrl = 'http://localhost:3001', options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout || 120000;
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }

  /**
   * Effectue une requete HTTP vers l'API
   */
  async request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;

    const options = {
      method,
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout)
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;

    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Verifie si le service est disponible
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      const result = await this.request('GET', '/health');
      return result.status === 'healthy';
    } catch {
      return false;
    }
  }

  /**
   * Attend que le service soit disponible
   * @param {number} maxAttempts - Nombre max de tentatives
   * @param {number} interval - Intervalle entre tentatives en ms
   */
  async waitForService(maxAttempts = 30, interval = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.isHealthy()) {
        return true;
      }
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Service not available after ${maxAttempts} attempts`);
  }

  /**
   * Effectue un bypass Cloudflare et retourne le screenshot
   *
   * @param {string} url - URL a capturer
   * @param {object} options - Options de capture
   * @param {number} options.timeout - Timeout du bypass en ms
   * @param {boolean} options.headless - Mode headless (defaut: true)
   * @param {boolean} options.screenshot - Capturer screenshot (defaut: true)
   * @param {boolean} options.fullPage - Screenshot full-page (defaut: true)
   * @param {string} options.userAgent - User-Agent personnalise
   * @param {string} options.proxy - Proxy HTTP
   * @param {number} options.width - Largeur viewport
   * @param {number} options.height - Hauteur viewport
   * @param {number} options.waitAfterBypass - Delai apres bypass en ms
   *
   * @returns {Promise<object>} Resultat avec screenshot, cookies, etc.
   */
  async bypass(url, options = {}) {
    const result = await this.request('POST', '/bypass', { url, options });

    if (!result.success) {
      throw new Error(result.error || 'Bypass failed');
    }

    return result.data;
  }

  /**
   * Detecte si une URL utilise une protection Cloudflare
   *
   * @param {string} url - URL a tester
   * @returns {Promise<object>} Resultat de detection
   */
  async detect(url) {
    const result = await this.request('POST', '/detect', { url });

    if (!result.success) {
      throw new Error(result.error || 'Detection failed');
    }

    return result.data;
  }

  /**
   * Capture un screenshot avec bypass automatique si necessaire
   *
   * @param {string} url - URL a capturer
   * @param {object} options - Options de capture
   * @returns {Promise<object>} Resultat avec screenshot
   */
  async screenshot(url, options = {}) {
    const result = await this.request('POST', '/screenshot', { url, options });

    if (!result.success) {
      throw new Error(result.error || 'Screenshot failed');
    }

    return result.data;
  }

  /**
   * Obtient les statistiques du service
   * @returns {Promise<object>} Stats du service
   */
  async getStats() {
    const result = await this.request('GET', '/stats');

    if (!result.success) {
      throw new Error(result.error || 'Failed to get stats');
    }

    return result.data;
  }

  /**
   * Verifie l'etat de sante du service
   * @returns {Promise<object>} Health status
   */
  async health() {
    return this.request('GET', '/health');
  }
}

/**
 * Factory function pour creer un client avec configuration
 */
function createClient(baseUrl, options) {
  return new CloudflareBypassClient(baseUrl, options);
}

module.exports = CloudflareBypassClient;
module.exports.createClient = createClient;
module.exports.CloudflareBypassClient = CloudflareBypassClient;
