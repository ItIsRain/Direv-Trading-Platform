"""
Deriv API Token Generator
Creates API tokens with all scopes enabled using Playwright
Based on working Playwright MCP flow

Usage:
  python create_deriv_token_final.py <email> <password>
"""

import asyncio
import time
import sys
from playwright.async_api import async_playwright


# Deriv credentials - can be overridden by command line arguments
EMAIL = "mohamed@lynq.ae"
PASSWORD = "Max112233!!"
APP_ID = "36544"

# Override with command line arguments if provided
if len(sys.argv) >= 3:
    EMAIL = sys.argv[1]
    PASSWORD = sys.argv[2]


def log(message: str, level: str = "INFO"):
    """Print log message with timestamp"""
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}")


class DerivTokenCreator:
    def __init__(self):
        self.browser = None
        self.page = None
        self.playwright = None

    async def init_browser(self, headless=False):
        """Initialize browser"""
        log("Starting Playwright...")
        self.playwright = await async_playwright().start()
        log(f"Launching Chromium (headless={headless})...")
        self.browser = await self.playwright.chromium.launch(headless=headless)
        self.context = await self.browser.new_context(viewport={'width': 1280, 'height': 900})
        self.page = await self.context.new_page()
        log("Browser ready")

    async def close(self):
        """Close browser"""
        log("Closing resources...")
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        log("Closed")

    async def login(self):
        """Login to Deriv via OAuth"""
        log("=" * 50)
        log("LOGGING IN")
        log("=" * 50)

        login_url = f"https://oauth.deriv.com/oauth2/authorize?app_id={APP_ID}&l=en&route=%2F"
        log(f"Navigating to: {login_url}")

        await self.page.goto(login_url)
        log("Waiting for page...")
        await self.page.wait_for_timeout(3000)

        # Fill email
        log(f"Filling email: {EMAIL}")
        try:
            email_input = await self.page.wait_for_selector('input[name="email"], input[type="email"]', timeout=10000)
            await email_input.fill(EMAIL)
        except Exception as e:
            log(f"ERROR: {e}", "ERROR")
            return False

        # Fill password
        log("Filling password...")
        try:
            password_input = await self.page.wait_for_selector('input[name="password"], input[type="password"]', timeout=5000)
            await password_input.fill(PASSWORD)
        except Exception as e:
            log(f"ERROR: {e}", "ERROR")
            return False

        # Click login
        log("Clicking login...")
        try:
            login_btn = await self.page.wait_for_selector('button[type="submit"], button:has-text("Log in")', timeout=5000)
            await login_btn.click()
        except Exception as e:
            log(f"ERROR: {e}", "ERROR")
            return False

        # Wait for redirect
        log("Waiting for redirect...")
        try:
            await self.page.wait_for_url("**deriv.com/**", timeout=30000)
            log(f"Redirected to: {self.page.url}")
            log("LOGIN SUCCESSFUL!")
        except Exception as e:
            log(f"Redirect issue: {e}", "WARN")

        await self.page.wait_for_timeout(3000)
        return True

    async def navigate_to_api_token(self):
        """Navigate to API token page"""
        log("=" * 50)
        log("NAVIGATING TO API TOKEN PAGE")
        log("=" * 50)

        await self.page.goto("https://app.deriv.com/account/api-token")
        log("Waiting for page to load...")
        await self.page.wait_for_timeout(5000)
        log(f"Current URL: {self.page.url}")

    async def click_all_scopes(self):
        """Click all scope checkboxes"""
        log("=" * 50)
        log("CLICKING ALL SCOPES")
        log("=" * 50)

        # Scope selectors based on the working Playwright MCP flow
        scopes = [
            ("Read", "ReadThis scope will allow"),
            ("Trade", "TradeThis scope will allow"),
            ("Payments", "PaymentsThis scope will allow"),
            ("Trading information", "Trading informationThis scope"),
            ("Admin", "AdminThis scope will allow"),
        ]

        for scope_name, scope_text in scopes:
            try:
                log(f"Clicking {scope_name}...")
                await self.page.get_by_text(scope_text).click()
                log(f"  Clicked: {scope_name}")
                await self.page.wait_for_timeout(500)
            except Exception as e:
                log(f"  Failed to click {scope_name}: {e}", "WARN")

        await self.page.wait_for_timeout(1000)

    async def fill_token_name(self, token_name: str):
        """Fill the token name input"""
        log(f"Filling token name: {token_name}")

        try:
            await self.page.get_by_role("textbox", name="Token name").fill(token_name)
            log("Token name filled")
            return True
        except Exception as e:
            log(f"Failed to fill token name: {e}", "WARN")
            return False

    async def click_create(self):
        """Click the Create button"""
        log("Clicking Create button...")

        try:
            await self.page.wait_for_timeout(1000)
            await self.page.get_by_role("button", name="Create").click()
            log("Create button clicked")
            await self.page.wait_for_timeout(3000)
            return True
        except Exception as e:
            log(f"Could not click Create: {e}", "WARN")
            return False

    async def extract_token(self):
        """Extract the created token"""
        log("Extracting token...")

        # Click visibility toggle to reveal token
        try:
            # Click the second toggle visibility icon (for the newly created token)
            toggle_icons = await self.page.query_selector_all('[data-testid="dt_toggle_visibility_icon"]')
            if len(toggle_icons) >= 2:
                await toggle_icons[1].click()
                log("Clicked reveal button")
                await self.page.wait_for_timeout(2000)
            elif len(toggle_icons) == 1:
                await toggle_icons[0].click()
                log("Clicked reveal button")
                await self.page.wait_for_timeout(2000)
        except Exception as e:
            log(f"No reveal button or already visible: {e}")

        # Extract token from the page - look specifically near "Token" headings
        token = await self.page.evaluate('''
            () => {
                // Words that are NOT tokens
                const excludeWords = [
                    'Read', 'Trade', 'Payments', 'Admin', 'Never', 'Token', 'Scopes',
                    'Trading', 'information', 'Create', 'FullAccess', 'Assessments',
                    'Verification', 'Password', 'Settings', 'Account', 'Login',
                    'Deriv', 'Email', 'Name', 'Last', 'Used', 'Copy', 'Hide'
                ];

                // Find all h5 elements with "Token" text
                const tokenHeadings = document.querySelectorAll('h5');
                for (const heading of tokenHeadings) {
                    if (heading.textContent?.trim() === 'Token') {
                        // Look at the parent and find nearby paragraphs
                        let parent = heading.parentElement;
                        for (let i = 0; i < 3 && parent; i++) {
                            const paragraphs = parent.querySelectorAll('p');
                            for (const p of paragraphs) {
                                const text = p.textContent?.trim();
                                // Token is alphanumeric, 12-20 chars, no spaces
                                if (text && /^[a-zA-Z0-9]{12,20}$/.test(text)) {
                                    if (!excludeWords.some(ex => text.toLowerCase().includes(ex.toLowerCase()))) {
                                        return text;
                                    }
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                }

                // Fallback: look for any element that looks like a token
                const allElements = document.querySelectorAll('p, span, code');
                for (const el of allElements) {
                    const text = (el.textContent || '').trim();
                    // More strict pattern: exactly 15 chars, mixed case alphanumeric
                    if (/^[a-zA-Z0-9]{15}$/.test(text)) {
                        if (!excludeWords.some(ex => text.toLowerCase().includes(ex.toLowerCase()))) {
                            return text;
                        }
                    }
                }

                return null;
            }
        ''')

        if token:
            log(f"TOKEN FOUND: {token}")
        else:
            log("Token not found via JS", "WARN")

        return token


async def main():
    """Main function"""
    log("=" * 60)
    log("DERIV API TOKEN GENERATOR")
    log("=" * 60)

    # Run in headless mode when called with command line arguments (from API)
    headless = len(sys.argv) >= 3
    log(f"Headless mode: {headless}")

    creator = DerivTokenCreator()
    token_name = f"FullAccess_{int(time.time())}"
    log(f"Token name: {token_name}")

    try:
        await creator.init_browser(headless=headless)

        # Step 1: Login
        if not await creator.login():
            log("Login failed!", "ERROR")
            return None

        # Step 2: Navigate to API token page
        await creator.navigate_to_api_token()

        # Step 3: Click all scopes
        await creator.click_all_scopes()

        # Step 4: Fill token name
        await creator.fill_token_name(token_name)

        # Step 5: Click Create
        await creator.click_create()

        # Step 6: Extract token
        token = await creator.extract_token()

        # Results
        log("")
        log("=" * 60)
        log("RESULT")
        log("=" * 60)
        log(f"Token Name: {token_name}")
        log(f"Token: {token or 'Not found'}")

        if token:
            log("")
            log("=" * 60)
            log("SUCCESS! Your API token:")
            log(token)
            log("=" * 60)

            with open("generated_token.txt", "w") as f:
                f.write(f"Token Name: {token_name}\n")
                f.write(f"Token: {token}\n")
                f.write(f"Created: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            log("Saved to generated_token.txt")

        return token

    except Exception as e:
        log(f"ERROR: {e}", "ERROR")
        import traceback
        traceback.print_exc()
        return None

    finally:
        await creator.close()


if __name__ == "__main__":
    asyncio.run(main())
