/**
 * Demo launcher bootstrap.
 *
 * Externalized from index.html so the page can run under a strict
 * `script-src 'self'` Content-Security-Policy (no inline scripts).
 *
 * Responsibility: when the launcher is opened directly from the file system
 * (file:// protocol), the SSR demos cannot work, so their links are disabled
 * and the helper note is updated.
 */
(function () {
  const note = document.getElementById('launcher-note');
  const isFile = window.location.protocol === 'file:';

  if (!isFile) return;

  const serverLinks = [
    document.getElementById('launcher-ssr-link'),
    document.getElementById('launcher-ssr-card-link'),
    document.getElementById('launcher-stream-link'),
  ].filter(Boolean);

  for (const link of serverLinks) {
    link.classList.add('is-disabled');
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.title = 'Este demo requiere el servidor del demo (http://localhost:3000)';
  }

  if (note) {
    note.textContent =
      'Modo archivo detectado: static.html funciona; SSR y streaming requieren bun run demo (http://localhost:3000).';
  }
})();
