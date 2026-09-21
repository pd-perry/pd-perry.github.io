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

document.querySelectorAll('.video-row-wrap').forEach(wrap => {
  const row = wrap.querySelector('.video-row');
  const left = wrap.querySelector('.video-row-btn-left');
  const right = wrap.querySelector('.video-row-btn-right');
  const update = () => {
    left.disabled = row.scrollLeft <= 2;
    right.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
  };
  [left, right].forEach(btn => btn.addEventListener('click', () => {
    const dir = btn === left ? -1 : 1;
    row.scrollBy({ left: dir * (row.querySelector('.video-card').getBoundingClientRect().width + 16), behavior: 'smooth' });
  }));
  row.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
});
