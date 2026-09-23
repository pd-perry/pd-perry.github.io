const toggle = document.getElementById('theme-toggle');
const root = document.documentElement;
const stored = localStorage.getItem('theme');

if (stored) root.setAttribute('data-theme', stored);

toggle.addEventListener('click', () => {
  const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

const progress = document.getElementById('reading-progress');
if (progress) {
  const updateProgress = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
    progress.style.width = pct + '%';
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

const backToTop = document.getElementById('back-to-top');
if (backToTop) {
  const toggleVisibility = () => backToTop.classList.toggle('visible', window.scrollY > 600);
  window.addEventListener('scroll', toggleVisibility, { passive: true });
  toggleVisibility();
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

document.querySelectorAll('.sidenote-ref').forEach(ref => {
  const note = document.getElementById(ref.getAttribute('aria-controls'));
  ref.addEventListener('click', () => {
    note.style.top = `${ref.offsetTop}px`;
    const open = note.classList.toggle('open');
    ref.setAttribute('aria-expanded', open);
  });
});
