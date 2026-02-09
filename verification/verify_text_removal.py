import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        print("Navigating to index.html...")
        page.goto("http://localhost:8000/index.html")

        # Wait for button to enter
        print("Waiting for enter button...")
        try:
            page.wait_for_selector("#btn-enter", state="visible", timeout=10000)
            page.click("#btn-enter")
        except Exception as e:
            print(f"Failed to find enter button: {e}")

        # Wait for landing page to close
        time.sleep(1)

        # Wait for scene to load
        print("Waiting for canvas...")
        page.wait_for_selector("#canvas-container", state="visible")

        # Give it a moment for Three.js to initialize
        time.sleep(2)

        # Check for overlay text
        print("Checking for overlay text...")
        try:
            overlay_text = page.locator("#overlay").text_content()
            if "something is being built here" in overlay_text:
                print("Overlay text FOUND (Unexpected if trying to remove).")
            else:
                print("Overlay text NOT FOUND (Expected if removed).")
        except Exception as e:
            print(f"Overlay element not found: {e} (This is good if we removed the whole div)")

        # Take screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/text_removal_check.png")

        browser.close()

if __name__ == "__main__":
    run()
