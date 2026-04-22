import time
from playwright.sync_api import sync_playwright

def test_scene():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/projects/media/index.html")
        page.wait_for_selector('#site-loading', state='hidden', timeout=60000)
        page.wait_for_timeout(2000)

        page.click('#how-it-works-btn', force=True)
        page.wait_for_selector('#how-it-works-menu', state='visible')
        page.wait_for_timeout(500)
        page.click('#floor-assembly-btn', force=True)
        page.wait_for_timeout(2000)

        page.screenshot(path="screenshot_glass.png")
        browser.close()

if __name__ == "__main__":
    test_scene()
