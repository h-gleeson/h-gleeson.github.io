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

        # Verify the resume tooltip
        print("Checking resume tooltip...")

        # We simulate this by checking if resume data exists in projectData
        # and manually triggering the typewriter
        page.evaluate("""
            const data = projectData.resume;
            if(!data) throw new Error("Resume data missing from projectData");
            startTypewriter(data);
        """)

        page.wait_for_timeout(500)
        page.screenshot(path='verification/resume_tooltip.png')
        print("Captured resume tooltip screenshot")

        # Verify the Resume Mesh was added to the scene
        has_mesh = page.evaluate("""
            () => {
                // Find the group
                const group = scene.children.find(c => c.children.some(child => child === resumeGroup));
                // Or rather, we added resumeGroup to deskGroup
                // Let's find deskGroup first
                // deskGroup is not globally exposed as a var window.deskGroup, but we can traverse scene
                let found = false;
                scene.traverse(n => {
                    if (n.isMesh && n.parent && n.parent.parent === deskGroup) {
                         // This is hard to pinpoint without names.
                         // But we know we added it to resumeGroup which is in deskGroup.
                    }
                });

                // Better check: Access the resumeGroup variable since it is in global scope of script
                return resumeGroup.children.length > 0;
            }
        """)

        if has_mesh:
            print("Resume mesh verified in scene.")
        else:
            print("ERROR: Resume mesh not found in scene.")

        browser.close()

if __name__ == '__main__':
    run()
