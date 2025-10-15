document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  const themeToggleButton = document.getElementById('theme-toggle');

  // Apply saved theme on load
  if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark-mode');
    themeToggleButton.textContent = 'Switch to Light Mode';
  }

  // Toggle theme
  themeToggleButton.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    themeToggleButton.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // Set dynamic year
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
