import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Navigating to index.html...")
        await page.goto('http://localhost:8000/projects/media/index.html')

        print("Waiting for loading screen to disappear...")
        await page.wait_for_selector('#site-loading', state='hidden', timeout=60000)

        print("Clicking how does it work...")
        await page.click('#how-it-works-btn')

        print("Waiting for menu to appear...")
        await page.wait_for_timeout(1000) # give UI a bit of time

        print("Clicking media archive btn...")
        await page.click('#media-archive-btn')

        print("Waiting for models to update...")
        await page.wait_for_timeout(2000) # allow time to render

        print("Taking screenshot after clicking media archive...")
        await page.screenshot(path='after_media_shader.png')

        await browser.close()
        print("Done.")

if __name__ == '__main__':
    asyncio.run(main())