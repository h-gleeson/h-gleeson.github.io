from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # Test Desktop View
        context_desktop = browser.new_context(viewport={'width': 1280, 'height': 720})
        page_desktop = context_desktop.new_page()
        page_desktop.goto("http://localhost:8000/index.html")
        page_desktop.wait_for_selector("#btn-desktop", state="visible")
        page_desktop.click("#btn-desktop")
        page_desktop.wait_for_timeout(2000) # Wait for any animations or model loading
        page_desktop.screenshot(path="verification/desktop_view.png")
        print("Desktop view screenshot taken.")
        context_desktop.close()

        # Test Mobile View (Selection)
        # Emulate a mobile device or just click the button?
        # The user said "when the 'mobile' option is selected". This refers to the button on the landing page.
        # But maybe they also want to test on a mobile viewport.
        # I'll use a desktop viewport but click "Mobile" to see the "Mobile" camera mode.
        # And also verify the aspect ratio logic I'm about to add.

        context_mobile_selection = browser.new_context(viewport={'width': 1280, 'height': 720})
        page_mobile = context_mobile_selection.new_page()
        page_mobile.goto("http://localhost:8000/index.html")
        page_mobile.wait_for_selector("#btn-mobile", state="visible")
        page_mobile.click("#btn-mobile")
        page_mobile.wait_for_timeout(2000)
        page_mobile.screenshot(path="verification/mobile_view_selection.png")
        print("Mobile view (selection) screenshot taken.")
        context_mobile_selection.close()

        browser.close()

if __name__ == "__main__":
    run()
