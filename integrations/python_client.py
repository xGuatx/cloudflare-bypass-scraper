"""
Cloudflare Bypass Python Client

Python client for integration with web-screenshot-capture
or any other Python tool.

Usage:
    from python_client import CloudflareBypassClient

    client = CloudflareBypassClient("http://localhost:3001")

    # Bypass with screenshot
    result = await client.bypass("https://protected-site.com")
    screenshot_b64 = result["screenshot"]
    cookies = result["cookies"]

    # Detection only
    detection = await client.detect("https://maybe-protected.com")
    if detection["cloudflareDetected"]:
        print("Site protected by Cloudflare")
"""

import asyncio
import aiohttp
from typing import Optional, Dict, Any
import base64


class CloudflareBypassClient:
    """Async HTTP client for cloudflare-bypass-api service."""

    def __init__(
        self,
        base_url: str = "http://localhost:3001",
        timeout: int = 120,
        headers: Optional[Dict[str, str]] = None
    ):
        """
        Initialize the client.

        Args:
            base_url: URL of cloudflare-bypass-api service
            timeout: Request timeout in seconds
            headers: Additional HTTP headers
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.headers = {"Content-Type": "application/json"}
        if headers:
            self.headers.update(headers)

    async def _request(
        self,
        method: str,
        endpoint: str,
        json: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make an HTTP request to the API."""
        url = f"{self.base_url}{endpoint}"

        async with aiohttp.ClientSession(timeout=self.timeout) as session:
            async with session.request(method, url, json=json, headers=self.headers) as response:
                data = await response.json()

                if not response.ok:
                    raise Exception(data.get("error", f"HTTP {response.status}"))

                return data

    async def is_healthy(self) -> bool:
        """Check if the service is available."""
        try:
            result = await self._request("GET", "/health")
            return result.get("status") == "healthy"
        except Exception:
            return False

    async def wait_for_service(self, max_attempts: int = 30, interval: float = 2.0) -> bool:
        """Wait for the service to become available."""
        for _ in range(max_attempts):
            if await self.is_healthy():
                return True
            await asyncio.sleep(interval)

        raise Exception(f"Service not available after {max_attempts} attempts")

    async def bypass(
        self,
        url: str,
        timeout: Optional[int] = None,
        headless: bool = True,
        screenshot: bool = True,
        full_page: bool = True,
        user_agent: Optional[str] = None,
        proxy: Optional[str] = None,
        width: int = 1920,
        height: int = 1080,
        wait_after_bypass: int = 3000
    ) -> Dict[str, Any]:
        """
        Perform Cloudflare bypass and return screenshot.

        Args:
            url: URL to capture
            timeout: Bypass timeout in ms
            headless: Headless mode
            screenshot: Capture screenshot
            full_page: Full-page screenshot
            user_agent: Custom User-Agent
            proxy: HTTP proxy
            width: Viewport width
            height: Viewport height
            wait_after_bypass: Delay after bypass in ms

        Returns:
            Dict with screenshot (base64), cookies, finalUrl, etc.
        """
        options = {
            "headless": headless,
            "screenshot": screenshot,
            "fullPage": full_page,
            "width": width,
            "height": height,
            "waitAfterBypass": wait_after_bypass
        }

        if timeout:
            options["timeout"] = timeout
        if user_agent:
            options["userAgent"] = user_agent
        if proxy:
            options["proxy"] = proxy

        result = await self._request("POST", "/bypass", {"url": url, "options": options})

        if not result.get("success"):
            raise Exception(result.get("error", "Bypass failed"))

        return result["data"]

    async def detect(self, url: str) -> Dict[str, Any]:
        """
        Detect if a URL uses Cloudflare protection.

        Args:
            url: URL to test

        Returns:
            Dict with cloudflareDetected, indicator, pageTitle, finalUrl
        """
        result = await self._request("POST", "/detect", {"url": url})

        if not result.get("success"):
            raise Exception(result.get("error", "Detection failed"))

        return result["data"]

    async def screenshot(
        self,
        url: str,
        **options
    ) -> Dict[str, Any]:
        """
        Capture a screenshot with automatic bypass if needed.

        Args:
            url: URL to capture
            **options: Capture options (see bypass())

        Returns:
            Dict with screenshot (base64) and metadata
        """
        result = await self._request("POST", "/screenshot", {"url": url, "options": options})

        if not result.get("success"):
            raise Exception(result.get("error", "Screenshot failed"))

        return result["data"]

    async def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        result = await self._request("GET", "/stats")

        if not result.get("success"):
            raise Exception(result.get("error", "Failed to get stats"))

        return result["data"]

    async def health(self) -> Dict[str, Any]:
        """Check service health status."""
        return await self._request("GET", "/health")

    def decode_screenshot(self, base64_data: str) -> bytes:
        """Decode a base64 screenshot to bytes."""
        return base64.b64decode(base64_data)

    async def save_screenshot(self, base64_data: str, filepath: str) -> None:
        """Save a decoded screenshot to a file."""
        screenshot_bytes = self.decode_screenshot(base64_data)
        with open(filepath, "wb") as f:
            f.write(screenshot_bytes)


# Usage example
async def example():
    """Example usage of the client."""
    client = CloudflareBypassClient("http://localhost:3001")

    # Wait for service to be ready
    print("Waiting for service...")
    await client.wait_for_service()
    print("Service ready!")

    # Test detection
    url = "https://example.com"
    print(f"\nDetecting Cloudflare on {url}...")
    detection = await client.detect(url)
    print(f"Cloudflare detected: {detection['cloudflareDetected']}")

    # Capture with bypass
    print(f"\nCapturing {url}...")
    result = await client.bypass(url)
    print(f"Final URL: {result['finalUrl']}")
    print(f"Title: {result['title']}")
    print(f"Cloudflare detected: {result['cloudflareDetected']}")
    print(f"Bypass successful: {result['bypassSuccessful']}")
    print(f"Cookies: {len(result['cookies'])} cookies")

    # Save screenshot
    if result.get("screenshot"):
        await client.save_screenshot(result["screenshot"], "capture.png")
        print("Screenshot saved to capture.png")


if __name__ == "__main__":
    asyncio.run(example())
