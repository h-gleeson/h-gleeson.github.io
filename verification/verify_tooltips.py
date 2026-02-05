from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local index.html
        cwd = os.getcwd()
        page.goto(f'file://{cwd}/index.html')

        page.wait_for_timeout(2000)

        # Inject CSS to force display block !important, overriding the JS animation loop
        page.add_style_tag(content="#tooltip { display: block !important; }")

        # Inject content
        page.evaluate("""
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = '<h3>The Palace</h3><p>A conceptual exploration of form and void.</p>';
        """)

        screenshot_path = 'verification/tooltip_visual_check.png'
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == '__main__':
    run()
