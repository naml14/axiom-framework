/**
 * Demo launcher bootstrap.
 *
 * Externalized from index.html so the page can run under a strict
 * `script-src 'self'` Content-Security-Policy (no inline scripts).
 *
 * Responsibility: when the launcher is opened directly from the file system
 * (file:// protocol), the SSR demo cannot work, so disable its link and
 * update the helper note.
 */
(function () {
  const ssrLink = document.getElementById('launcher-ssr-link');
  const note = document.getElementById('launcher-note');
  const isFile = window.location.protocol === 'file:';

  if (!ssrLink || !isFile) return;

  ssrLink.classList.add('is-disabled');
  ssrLink.removeAttribute('href');
  ssrLink.setAttribute('aria-disabled', 'true');
  ssrLink.title = 'SSR requiere servidor (http://localhost:3000)';

  if (note) {
    note.textContent =
      'Modo archivo detectado: static.html funciona; SSR requiere bun run demo (http://localhost:3000).';
  }
})();
