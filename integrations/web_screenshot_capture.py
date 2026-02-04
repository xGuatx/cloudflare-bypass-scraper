"""
Integration with web-screenshot-capture

This module integrates Cloudflare bypass into the web-screenshot-capture API.
It can be used as a plugin or middleware.

Usage in web-screenshot-capture:
    from integrations.web_screenshot_capture import CloudflareBypassMiddleware

    # In capture.py
    bypass_middleware = CloudflareBypassMiddleware("http://cloudflare-bypass:3001")

    async def capture_with_bypass(url: str, options: dict) -> dict:
        # Check if bypass is needed
        if await bypass_middleware.needs_bypass(url):
            return await bypass_middleware.capture(url, options)
        else:
            # Normal capture
            return await normal_capture(url, options)
"""

import asyncio
import base64
from typing import Optional, Dict, Any, List
import aiohttp
import logging

logger = logging.getLogger(__name__)


class CloudflareBypassMiddleware:
    """
    Middleware to integrate Cloudflare bypass into web-screenshot-capture.

    This middleware automatically detects Cloudflare-protected sites
    and delegates capture to the cloudflare-bypass-api service.
    """

    def __init__(
        self,
        bypass_service_url: str = "http://localhost:3001",
        timeout: int = 120,
        auto_detect: bool = True,
        fallback_to_normal: bool = True
    ):
        """
        Initialize the middleware.

        Args:
            bypass_service_url: URL of cloudflare-bypass-api service
            timeout: Request timeout in seconds
            auto_detect: Automatically detect if bypass is needed
            fallback_to_normal: If bypass fails, try normal capture
        """
        self.service_url = bypass_service_url.rstrip("/")
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.auto_detect = auto_detect
        self.fallback_to_normal = fallback_to_normal
        self._service_available = None

    async def is_service_available(self) -> bool:
        """Check if the bypass service is available."""
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.get(f"{self.service_url}/health") as response:
                    if response.ok:
                        data = await response.json()
                        self._service_available = data.get("status") == "healthy"
                        return self._service_available
        except Exception as e:
            logger.warning(f"Cloudflare bypass service unavailable: {e}")
            self._service_available = False

        return False

    async def detect_cloudflare(self, url: str) -> Dict[str, Any]:
        """
        Detect if a URL is protected by Cloudflare.

        Args:
            url: URL to test

        Returns:
            Dict with detected (bool), indicator, etc.
        """
        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.post(
                    f"{self.service_url}/detect",
                    json={"url": url},
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.ok:
                        data = await response.json()
                        if data.get("success"):
                            return data["data"]

        except Exception as e:
            logger.error(f"Cloudflare detection failed for {url}: {e}")

        return {"cloudflareDetected": False, "error": "Detection failed"}

    async def needs_bypass(self, url: str) -> bool:
        """
        Determine if a URL needs Cloudflare bypass.

        Args:
            url: URL to test

        Returns:
            True if bypass is needed
        """
        if not self.auto_detect:
            return False

        if not await self.is_service_available():
            return False

        result = await self.detect_cloudflare(url)
        return result.get("cloudflareDetected", False)

    async def capture(
        self,
        url: str,
        full_page: bool = False,
        width: int = 1024,
        height: int = 768,
        delay: int = 0,
        grab_html: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Capture a page via the Cloudflare bypass service.

        Compatible with web-screenshot-capture interface.

        Args:
            url: URL to capture
            full_page: Full-page capture
            width: Viewport width
            height: Viewport height
            delay: Delay before capture
            grab_html: Capture HTML source
            **kwargs: Additional arguments

        Returns:
            Dict compatible with web-screenshot-capture response format
        """
        options = {
            "fullPage": full_page,
            "width": width,
            "height": height,
            "waitAfterBypass": delay * 1000 if delay > 0 else 3000,
            "screenshot": True
        }

        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                async with session.post(
                    f"{self.service_url}/bypass",
                    json={"url": url, "options": options},
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.ok:
                        data = await response.json()
                        if data.get("success"):
                            bypass_data = data["data"]

                            # Convert to web-screenshot-capture format
                            result = {
                                "screenshot": bypass_data.get("screenshot"),
                                "screenshot_format": "png",
                                "network_logs": [],
                                "dom_elements": {
                                    "clickable_elements": [],
                                    "forms": [],
                                    "scripts": [],
                                    "popups": []
                                },
                                "final_url": bypass_data.get("finalUrl", url),
                                "capture_config": {
                                    "full_page": full_page,
                                    "width": width,
                                    "height": height,
                                    "delay": delay
                                },
                                "cloudflare_bypass": {
                                    "detected": bypass_data.get("cloudflareDetected", False),
                                    "indicator": bypass_data.get("cloudflareIndicator"),
                                    "successful": bypass_data.get("bypassSuccessful", False),
                                    "timing": bypass_data.get("timing", {})
                                }
                            }

                            # Add cookies as network info
                            cookies = bypass_data.get("cookies", [])
                            if cookies:
                                result["cookies"] = cookies

                            return result

                    error_text = await response.text()
                    raise Exception(f"Bypass service error: {error_text}")

        except Exception as e:
            logger.error(f"Cloudflare bypass capture failed for {url}: {e}")
            raise

    async def capture_with_fallback(
        self,
        url: str,
        normal_capture_func,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Capture with fallback to normal method if bypass fails.

        Args:
            url: URL to capture
            normal_capture_func: Normal capture function (async)
            **kwargs: Capture arguments

        Returns:
            Capture result
        """
        try:
            # Check if bypass is needed
            if await self.needs_bypass(url):
                logger.info(f"Cloudflare detected for {url}, using bypass service")
                return await self.capture(url, **kwargs)

        except Exception as e:
            logger.warning(f"Bypass failed for {url}: {e}")
            if not self.fallback_to_normal:
                raise

            logger.info(f"Falling back to normal capture for {url}")

        # Normal capture
        return await normal_capture_func(url, **kwargs)


class CloudflareBypassPlugin:
    """
    Plugin for web-screenshot-capture that adds Cloudflare support.

    Usage:
        plugin = CloudflareBypassPlugin("http://cloudflare-bypass:3001")
        app.add_middleware(plugin)  # or manual integration
    """

    def __init__(self, service_url: str = "http://localhost:3001"):
        self.middleware = CloudflareBypassMiddleware(service_url)

    async def process_capture(
        self,
        url: str,
        original_capture_func,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Capture hook that detects and bypasses Cloudflare automatically.

        Args:
            url: URL to capture
            original_capture_func: Original capture function
            **kwargs: Capture arguments

        Returns:
            Capture result
        """
        return await self.middleware.capture_with_fallback(
            url,
            original_capture_func,
            **kwargs
        )


# Example integration in web-screenshot-capture
async def example_integration():
    """
    Example integration in web-screenshot-capture/api/capture.py
    """
    # Create middleware
    cf_middleware = CloudflareBypassMiddleware(
        bypass_service_url="http://localhost:3001",
        auto_detect=True,
        fallback_to_normal=True
    )

    async def capture_with_cloudflare_support(
        url: str,
        full_page: bool = False,
        width: int = 1024,
        height: int = 768,
        delay: int = 0,
        **kwargs
    ):
        """Capture function with Cloudflare support."""

        # Original capture function (placeholder)
        async def original_capture(url, **kw):
            # This would be the real capture function
            return {"screenshot": None, "url": url}

        # Use middleware
        return await cf_middleware.capture_with_fallback(
            url,
            original_capture,
            full_page=full_page,
            width=width,
            height=height,
            delay=delay,
            **kwargs
        )

    return capture_with_cloudflare_support


if __name__ == "__main__":
    # Basic test
    async def test():
        middleware = CloudflareBypassMiddleware()

        if await middleware.is_service_available():
            print("Service available!")

            # Test detection
            result = await middleware.detect_cloudflare("https://example.com")
            print(f"Detection result: {result}")

        else:
            print("Service not available")

    asyncio.run(test())
