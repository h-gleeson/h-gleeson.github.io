from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8000")

    # Wait for the page to load (canvas)
    page.wait_for_selector("#canvas-container")
    time.sleep(2) # Give WebGL time to init

    print("Page loaded. Taking initial screenshot.")
    page.screenshot(path="verification/initial_state.png")

    # Simulate clicking on a project group.
    # Since we can't easily click 3D objects, we will use an exposed function
    # that we will add to index.html for testing purposes: window.testFocus('palace')
    # If not available, we try to click the screen center where we expect something.
    # But reliable testing requires deterministic input.

    try:
        print("Attempting to trigger focus on 'palace' group via JS...")
        page.evaluate("window.testFocus('palace')")
        time.sleep(1) # Animation time

        print("Checking if #project-controls is visible...")
        controls = page.locator("#project-controls")
        if controls.is_visible():
            print("Project controls are visible.")
        else:
            print("Project controls NOT visible.")

        page.screenshot(path="verification/focused_state.png")

        # Check 'Project Details' button
        details_btn = page.locator("#btn-details")
        if details_btn.is_visible():
            print("Details button visible.")

        # Click Close
        print("Clicking Close button...")
        close_btn = page.locator("#btn-close")
        close_btn.click()
        time.sleep(1) # Animation time

        if not controls.is_visible():
            print("Project controls hidden after close.")
        else:
            print("Project controls still visible after close.")

        page.screenshot(path="verification/closed_state.png")

    except Exception as e:
        print(f"Error during interaction: {e}")
        # Take error screenshot
        page.screenshot(path="verification/error_state.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
