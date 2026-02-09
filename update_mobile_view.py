
import os

def update_index_html():
    filepath = 'index.html'
    with open(filepath, 'r') as f:
        content = f.read()

    # Block 1: replace resize handler
    resize_handler_search = """        // Handle Window Resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            focusRenderer.setSize(window.innerWidth, window.innerHeight);
        });"""

    resize_handler_replace = """        // Handle Window Resize
        let currentDeviceType = 'desktop';

        function updateSize() {
            let width, height;
            if (currentDeviceType === 'mobile') {
                // Force 4:3 aspect ratio
                if (window.innerWidth / window.innerHeight > 4/3) {
                    height = window.innerHeight;
                    width = height * 4/3;
                } else {
                    width = window.innerWidth;
                    height = width * 3/4;
                }

                // Center the canvas
                renderer.domElement.style.position = 'absolute';
                renderer.domElement.style.left = ((window.innerWidth - width) / 2) + 'px';
                renderer.domElement.style.top = ((window.innerHeight - height) / 2) + 'px';

                // Focus renderer matches main renderer
                focusRenderer.domElement.style.position = 'absolute';
                focusRenderer.domElement.style.left = ((window.innerWidth - width) / 2) + 'px';
                focusRenderer.domElement.style.top = ((window.innerHeight - height) / 2) + 'px';

                camera.aspect = 4/3;
            } else {
                width = window.innerWidth;
                height = window.innerHeight;

                // Reset styles
                renderer.domElement.style.position = '';
                renderer.domElement.style.left = '';
                renderer.domElement.style.top = '';

                focusRenderer.domElement.style.position = '';
                focusRenderer.domElement.style.left = '';
                focusRenderer.domElement.style.top = '';

                camera.aspect = width / height;
            }

            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
            focusRenderer.setSize(width, height);
        }

        window.addEventListener('resize', updateSize);"""

    if resize_handler_search not in content:
        print("Error: Could not find resize handler block.")
        return

    content = content.replace(resize_handler_search, resize_handler_replace)

    # Block 2: replace setDeviceView
    set_device_view_search = """        function setDeviceView(type) {
            const lookAtTarget = new THREE.Vector3(-4, 0.5, 1);

            if (type === 'mobile') {
                // Adjust for mobile portrait view - further back/up to see more desk width
                // Original: (-1.1, 1.1, -0.5)
                // Adjusted to avoid clipping while maintaining wide view: (-1.1, 1.4, -0.2)
                camera.position.set(-1.1, 1.4, -0.2);
            } else {
                // Desktop / Default
                camera.position.set(-1.1, 1.1, -0.5);
            }

            camera.lookAt(lookAtTarget);
            // Re-apply the slight Y rotation offset used in initialization
            camera.rotation.y -= 0.1;
        }"""

    set_device_view_replace = """        function setDeviceView(type) {
            currentDeviceType = type;
            updateSize();

            if (type === 'mobile') {
                // Top-down architectural plan view
                camera.position.set(-4, 8, 1);
                camera.up.set(0, 0, -1);
                camera.lookAt(-4, 0, 1);
                // No rotation offset for plan view
            } else {
                // Desktop / Default
                camera.up.set(0, 1, 0);
                camera.position.set(-1.1, 1.1, -0.5);
                const lookAtTarget = new THREE.Vector3(-4, 0.5, 1);
                camera.lookAt(lookAtTarget);
                // Re-apply the slight Y rotation offset used in initialization
                camera.rotation.y -= 0.1;
            }
        }"""

    if set_device_view_search not in content:
        # Try finding simpler version if spacing is an issue, but indentation should match if copied correctly.
        # Let's print a warning if not found
        print("Error: Could not find setDeviceView block.")
        return

    content = content.replace(set_device_view_search, set_device_view_replace)

    with open(filepath, 'w') as f:
        f.write(content)

    print("Successfully updated index.html")

if __name__ == "__main__":
    update_index_html()
