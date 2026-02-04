/**
 * Dynamically loads gallery images for a project.
 * Checks for files named {projectPrefix}_{i}.{ext} sequentially.
 *
 * @param {string} projectPrefix - The prefix of the image filenames (e.g., 'DirtPolitics').
 * @param {string} containerSelector - The CSS selector for the gallery container.
 * @param {number} maxImages - Maximum number of images to check (default 50).
 */
async function loadGallery(projectPrefix, containerSelector, maxImages = 50) {
    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error(`Gallery container '${containerSelector}' not found.`);
        return;
    }

    // Extensions to check (priority order)
    const extensions = ['png', 'jpg', 'JPG', 'PNG', 'jpeg', 'JPEG'];
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3; // Stop after 3 missing numbers

    for (let i = 1; i <= maxImages; i++) {
        let foundSrc = null;

        // check extensions sequentially
        for (const ext of extensions) {
            const src = `images/${projectPrefix}_${i}.${ext}`;
            const exists = await imageExists(src);
            if (exists) {
                foundSrc = src;
                break;
            }
        }

        if (foundSrc) {
            const img = document.createElement('img');
            img.src = foundSrc;
            img.className = 'project-image';
            img.alt = `${projectPrefix} image ${i}`;
            img.loading = 'lazy';
            container.appendChild(img);
            consecutiveFailures = 0; // Reset counter
        } else {
            consecutiveFailures++;
        }

        if (consecutiveFailures >= maxConsecutiveFailures) {
            // Assume end of gallery
            break;
        }
    }
}

/**
 * Checks if an image exists by attempting to load it.
 * @param {string} url
 * @returns {Promise<boolean>}
 */
function imageExists(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

// Expose to global scope
window.loadGallery = loadGallery;
