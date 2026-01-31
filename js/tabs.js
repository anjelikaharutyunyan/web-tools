document.querySelectorAll('#categoryTabs .nav-link').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
        const category = tabBtn.dataset.category;

        // Highlight active tab
        document.querySelectorAll('#categoryTabs .nav-link').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');

        // Show correct panel
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('d-none', panel.dataset.category !== category);
        });
    });
});
