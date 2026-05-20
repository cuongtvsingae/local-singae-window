(() => {
  if (window.__globalContextMenuFallbackInstalled) return;
  window.__globalContextMenuFallbackInstalled = true;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .global-context-menu-fallback.desktop-context-menu {
      position: fixed;
      z-index: 25000;
      min-width: 236px;
      padding: 6px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.34);
      background: rgba(10, 14, 24, 0.92);
      box-shadow: 0 18px 32px rgba(2, 6, 23, 0.5);
      backdrop-filter: blur(10px);
    }
    .global-context-menu-fallback .desktop-context-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
    }
    .global-context-menu-fallback .desktop-context-item:hover {
      background: rgba(59, 130, 246, 0.22);
    }
    .global-context-menu-fallback .desktop-context-check {
      width: 12px;
      text-align: center;
      opacity: 0;
    }
    .global-context-menu-fallback .desktop-context-icon {
      width: 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #93c5fd;
      flex: 0 0 16px;
    }
    .global-context-menu-fallback .desktop-context-icon svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.85;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .global-context-menu-fallback .desktop-context-label {
      font-size: 13px;
      font-weight: 500;
      color: #e5e7eb;
    }
  `;
  document.head.appendChild(styleEl);

  const menuEl = document.createElement('div');
  menuEl.className = 'global-context-menu-fallback desktop-context-menu';
  menuEl.hidden = true;
  menuEl.innerHTML = `
    <button type="button" class="desktop-context-item" data-action="refresh">
      <span class="desktop-context-check" aria-hidden="true"></span>
      <span class="desktop-context-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M16.4 4.6v4.2h-4.2"></path>
          <path d="M16.1 8.8a6.2 6.2 0 1 1-1.8-4.2"></path>
        </svg>
      </span>
      <span class="desktop-context-label">Refresh</span>
    </button>
  `;
  document.body.appendChild(menuEl);

  async function refreshPage() {
    window.location.reload();
  }


  function hideMenu() {
    if (menuEl.hidden) return;
    menuEl.hidden = true;
  }

  function showMenu(x, y) {
    menuEl.hidden = false;
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    const rect = menuEl.getBoundingClientRect();
    let nextX = x;
    let nextY = y;
    if (rect.right > window.innerWidth - 8) nextX = Math.max(8, window.innerWidth - rect.width - 8);
    if (rect.bottom > window.innerHeight - 8) nextY = Math.max(8, window.innerHeight - rect.height - 8);
    menuEl.style.left = `${nextX}px`;
    menuEl.style.top = `${nextY}px`;
  }

  function isNativeTextContextTarget(target) {
    if (!target) return false;
    const el = target.nodeType === 1 ? target : target.parentElement;
    if (!el) return false;
    if (el.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) {
      return true;
    }
    if (el.closest('.CodeMirror, .cm-editor, .monaco-editor, [role="textbox"]')) {
      return true;
    }
    return false;
  }

  document.addEventListener('contextmenu', (event) => {
    if (event.defaultPrevented) return;
    if (isNativeTextContextTarget(event.target)) return;
    event.preventDefault();
    showMenu(event.clientX, event.clientY);
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.button === 2) return;
    if (!event.target.closest('.global-context-menu-fallback')) hideMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideMenu();
  });
  window.addEventListener('blur', hideMenu);
  window.addEventListener('resize', hideMenu, { passive: true });

  menuEl.addEventListener('contextmenu', (event) => event.preventDefault());
  menuEl.querySelector('[data-action="refresh"]')?.addEventListener('click', async () => {
    hideMenu();
    await refreshPage();
  });
})();
