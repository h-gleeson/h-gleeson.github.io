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

        # Verify the resume tooltip logic works (by manually triggering startTypewriter with resume data)
        # We can also check if resumeGroup has children, meaning the model loaded (or is loading)
        print("Checking resume tooltip...")

        page.evaluate("""
            const data = projectData.resume;
            if(!data) throw new Error("Resume data missing from projectData");
            startTypewriter(data);
        """)

        page.wait_for_timeout(500)
        page.screenshot(path='verification/resume_loaded_tooltip.png')
        print("Captured resume tooltip screenshot")

        # Verify the Resume Mesh was loaded into the scene
        # Since we use GLTFLoader, it's async. We waited 2000ms, which should be enough for a local file.
        has_mesh = page.evaluate("""
            () => {
               // Check if resumeGroup has children
               if (resumeGroup.children.length > 0) return true;
               return false;
            }
        """)

        if has_mesh:
            print("Resume model loaded in scene.")
        else:
            print("WARNING: Resume model not found in scene yet (might be slow loading or fail).")
            # Log any errors

        browser.close()

if __name__ == '__main__':
    run()
