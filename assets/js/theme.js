document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;

    function updateBtn() {
        const isLight = document.documentElement.classList.contains('light-mode');
        btn.innerHTML = 'MODE: <span style="color:var(--orange)">' + (isLight ? 'LIGHT' : 'DARK') + '</span>';
    }

    updateBtn();

    btn.addEventListener('click', () => {
        document.documentElement.classList.toggle('light-mode');
        localStorage.setItem('theme',
            document.documentElement.classList.contains('light-mode') ? 'light' : 'dark'
        );
        updateBtn();
    });
});
