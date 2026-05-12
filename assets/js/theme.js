document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.documentElement;

    if (!themeToggle) return;

    // We already checked and applied the body class in the inline script to avoid FOUC,
    // but we need to update the button text to match.
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'light') {
        themeToggle.innerHTML = '<span class="accent">/</span>dark mode';
    } else {
        themeToggle.innerHTML = '<span class="accent">/</span>light mode';
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('light-mode');

        // Save user preference
        if (body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<span class="accent">/</span>dark mode';
        } else {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<span class="accent">/</span>light mode';
        }
    });
});
