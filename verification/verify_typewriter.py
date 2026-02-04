from playwright.sync_api import sync_playwright
import os
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local index.html
        cwd = os.getcwd()
        page.goto(f'file://{cwd}/index.html')

        page.wait_for_timeout(2000)

        # Inject CSS to force tooltip visibility for debugging IF it was hidden by default,
        # but here we rely on the JS logic to show it.
        # However, we need to trigger the typewriter.
        # We can simulate the hover logic by calling the startTypewriter function directly via evaluate.

        print("Starting typewriter effect...")
        page.evaluate("""
            const data = { title: "TEST PROJECT", description: "This is a test description that appears gradually." };
            startTypewriter(data);
        """)

        # Take snapshot at 100ms
        page.wait_for_timeout(100)
        page.screenshot(path='verification/typewriter_1_start.png')
        print("Captured start screenshot")

        # Take snapshot at 1000ms
        page.wait_for_timeout(900)
        page.screenshot(path='verification/typewriter_2_mid.png')
        print("Captured mid screenshot")

        # Take snapshot at 3000ms (should be done)
        page.wait_for_timeout(2000)
        page.screenshot(path='verification/typewriter_3_end.png')
        print("Captured end screenshot")

        browser.close()

if __name__ == '__main__':
    run()
