// JSON Formatter logic & i18n

const jfDict = {
  vi: {
    tagline: 'Format, minify và validate JSON.',
    title: 'JSON Formatter',
    subtitle: 'Dán JSON vào bên trái, kết quả rõ ràng ở bên phải.',
    btnFormat: 'Format JSON',
    btnMinify: 'Minify JSON',
    btnCopy: 'Copy output',
    inputLabel: 'Input JSON',
    inputPlaceholder: 'Dán JSON từ API, log hoặc file cấu hình vào đây...',
    outputLabel: 'Output JSON',
    outputHint: '',
    statusEmpty: 'Không có dữ liệu.',
    statusOkFormat: 'OK: JSON hợp lệ & đã format.',
    statusOkMinify: 'OK: JSON hợp lệ & đã minify.',
    statusCopyOk: 'Đã copy output vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    statusErrorPrefix: 'JSON lỗi: ',
    statusErrorLinePrefix: 'Dòng lỗi: '
  },
  en: {
    tagline: 'Format, minify and validate JSON.',
    title: 'JSON Formatter',
    subtitle: 'Paste raw JSON on the left, get clean output on the right.',
    btnFormat: 'Format JSON',
    btnMinify: 'Minify JSON',
    btnCopy: 'Copy output',
    inputLabel: 'Input JSON',
    inputPlaceholder: 'Paste JSON from APIs, logs or config files here...',
    outputLabel: 'Output JSON',
    outputHint: 'Copy the result and paste it straight into your editor.',
    statusEmpty: 'No data to process.',
    statusOkFormat: 'OK: JSON is valid & formatted.',
    statusOkMinify: 'OK: JSON is valid & minified.',
    statusCopyOk: 'Output copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    statusErrorPrefix: 'Invalid JSON: ',
    statusErrorLinePrefix: 'Error line: '
  }
};

let jfLang = 'vi';

function jfApplyLang() {
  const t = jfDict[jfLang];
  document.documentElement.lang = jfLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('btnFormat').textContent = t.btnFormat;
  document.getElementById('btnMinify').textContent = t.btnMinify;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('inputLabel').textContent = t.inputLabel;
  document.getElementById('input').placeholder = t.inputPlaceholder;
  document.getElementById('outputLabel').textContent = t.outputLabel;
  const outputHint = document.getElementById('outputHint');
  if (outputHint) {
    outputHint.textContent = t.outputHint;
  }
  
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function jfSetStatus(msg, ok) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'status-ok' : 'status-error');
}

function jfParseJsonSafe(text) {
  try {
    const obj = JSON.parse(text);
    return { ok: true, value: obj };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function jfComputeErrorLine(text, error) {
  if (!error || !error.message) return null;
  const match = error.message.match(/position (\d+)/);
  if (!match) return null;
  const pos = Number(match[1]);
  if (!Number.isFinite(pos)) return null;
  const snippet = text.slice(0, pos);
  const line = snippet.split('\n').length - 1; // 0-based
  return line < 0 ? 0 : line;
}

function jfUpdateLineNumbers(value, gutterId) {
  const gutter = document.getElementById(gutterId || 'lineGutter');
  if (!gutter) return;
  const lines = value.split('\n');
  const count = Math.max(lines.length, 1);
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="ln" data-line="${i}">${i}</div>`;
  }
  gutter.innerHTML = html;
}

function jfUpdateWhitespaceOverlay(value, overlayId) {
  const overlay = document.getElementById(overlayId || 'wsOverlay');
  if (!overlay) return;
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === ' ') {
      out += '<span class="ws-dot">·</span>';
    } else if (ch === '\n') {
      out += '\n';
    } else {
      out += '\u00a0';
    }
  }
  overlay.innerHTML = out;
}

function jfClearErrorHighlight() {
  const gutter = document.getElementById('lineGutter');
  const input = document.getElementById('input');
  if (gutter) {
    gutter.querySelectorAll('.ln').forEach((el) => el.classList.remove('ln-error'));
  }
  if (input) {
    input.classList.remove('input-error');
  }
}

function jfMarkErrorLine(lineIndex) {
  const gutter = document.getElementById('lineGutter');
  const input = document.getElementById('input');
  if (!gutter || lineIndex == null) return;
  gutter.querySelectorAll('.ln').forEach((el) => el.classList.remove('ln-error'));
  const target = gutter.querySelector(`.ln[data-line="${lineIndex}"]`);
  if (target) {
    target.classList.add('ln-error');
  }
  if (input) {
    input.classList.add('input-error');
  }
}

function jfInit() {
  jfApplyLang();

  const btnFormat = document.getElementById('btnFormat');
  const btnMinify = document.getElementById('btnMinify');
  const btnCopy = document.getElementById('btnCopy');
  const inputEl = document.getElementById('input');
  const outputEl = document.getElementById('output');
  const wsOverlay = document.getElementById('wsOverlay');
  const wsOverlayOut = document.getElementById('wsOverlayOut');
  const gutterContainerIn = document.querySelector('.editor-wrapper .line-gutter');
  const gutterContainerOut = document.querySelector('.output-wrapper .line-gutter');
  const loadBtn = document.getElementById('btnLoadData');
  const modalBackdrop = document.getElementById('loadModal');
  const modalClose = document.getElementById('modalClose');
  const urlInput = document.getElementById('urlInput');
  const btnLoadUrl = document.getElementById('btnLoadUrl');
  const fileInput = document.getElementById('fileInput');
  const btnUploadFile = document.getElementById('btnUploadFile');

  jfUpdateLineNumbers(inputEl.value || '', 'lineGutter');
  jfUpdateWhitespaceOverlay(inputEl.value || '', 'wsOverlay');

  inputEl.addEventListener('input', () => {
    jfUpdateLineNumbers(inputEl.value || '', 'lineGutter');
    jfClearErrorHighlight();
    jfUpdateWhitespaceOverlay(inputEl.value || '', 'wsOverlay');
  });

  inputEl.addEventListener('scroll', () => {
    if (gutterContainerIn) gutterContainerIn.scrollTop = inputEl.scrollTop;
    if (gutterContainerOut) gutterContainerOut.scrollTop = inputEl.scrollTop;
    if (wsOverlay) wsOverlay.scrollTop = inputEl.scrollTop;
  });

  if (gutterContainerIn) {
    gutterContainerIn.addEventListener('scroll', () => {
      inputEl.scrollTop = gutterContainerIn.scrollTop;
      if (wsOverlay) wsOverlay.scrollTop = gutterContainerIn.scrollTop;
    });
  }

  if (gutterContainerOut) {
    gutterContainerOut.addEventListener('scroll', () => {
      // khi scroll gutter output, sync với textarea output và overlay output
      outputEl.scrollTop = gutterContainerOut.scrollTop;
      if (wsOverlayOut) wsOverlayOut.scrollTop = gutterContainerOut.scrollTop;
    });
  }

  // Height đã được set cứng 500px trong CSS, không cần sync động nữa

  function openModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.add('is-open');
    if (urlInput) urlInput.focus();
  }

  function closeModal() {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('is-open');
  }

  if (loadBtn) {
    loadBtn.addEventListener('click', openModal);
  }
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  async function loadFromUrl() {
    const t = jfDict[jfLang];
    const url = (urlInput?.value || '').trim();
    if (!url) return;
    try {
      const res = await fetch(url);
      const text = await res.text();
      inputEl.value = text;
      jfUpdateLineNumbers(text, 'lineGutter');
      jfUpdateWhitespaceOverlay(text, 'wsOverlay');
      jfClearErrorHighlight();
      closeModal();
      jfSetStatus(t.statusOkFormat, true);
    } catch (e) {
      jfSetStatus('Failed to load URL', false);
    }
  }

  if (btnLoadUrl) {
    btnLoadUrl.addEventListener('click', (e) => {
      e.preventDefault();
      loadFromUrl();
    });
  }

  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadFromUrl();
      }
    });
  }

  if (btnUploadFile && fileInput) {
    btnUploadFile.addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const t = jfDict[jfLang];
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        inputEl.value = text;
        jfUpdateLineNumbers(text, 'lineGutter');
        jfUpdateWhitespaceOverlay(text, 'wsOverlay');
        jfClearErrorHighlight();
        closeModal();
        jfSetStatus(t.statusOkFormat, true);
      };
      reader.onerror = () => {
        jfSetStatus('Failed to read file', false);
      };
      reader.readAsText(file);
    });
  }

  btnFormat.addEventListener('click', () => {
    const t = jfDict[jfLang];
    const src = inputEl.value.trim();
    if (!src) {
      jfSetStatus(t.statusEmpty, false);
      return;
    }
    const res = jfParseJsonSafe(src);
    if (!res.ok) {
      const line = jfComputeErrorLine(src, res.error);
      const msg = t.statusErrorPrefix + res.error.message;
      jfSetStatus(msg, false);
      if (line != null) {
        jfMarkErrorLine(line);
        jfSetStatus(msg + ' — ' + t.statusErrorLinePrefix + line, false);
      }
      return;
    }
    const text = JSON.stringify(res.value, null, 2);
    jfClearErrorHighlight();
    outputEl.value = text;
    jfUpdateLineNumbers(text, 'lineGutterOut');
    jfUpdateWhitespaceOverlay(text, 'wsOverlayOut');
    jfSetStatus(t.statusOkFormat, true);
  });

  btnMinify.addEventListener('click', () => {
    const t = jfDict[jfLang];
    const src = inputEl.value.trim();
    if (!src) {
      jfSetStatus(t.statusEmpty, false);
      return;
    }
    const res = jfParseJsonSafe(src);
    if (!res.ok) {
      const line = jfComputeErrorLine(src, res.error);
      const msg = t.statusErrorPrefix + res.error.message;
      jfSetStatus(msg, false);
      if (line != null) {
        jfMarkErrorLine(line);
        jfSetStatus(msg + ' — ' + t.statusErrorLinePrefix + line, false);
      }
      return;
    }
    const text = JSON.stringify(res.value);
    jfClearErrorHighlight();
    outputEl.value = text;
    jfUpdateLineNumbers(text, 'lineGutterOut');
    jfUpdateWhitespaceOverlay(text, 'wsOverlayOut');
    jfSetStatus(t.statusOkMinify, true);
  });

  btnCopy.addEventListener('click', async () => {
    const t = jfDict[jfLang];
    const text = outputEl.value;
    if (!text) {
      jfSetStatus(t.statusEmpty, false);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      jfSetStatus(t.statusCopyOk, true);
    } catch (e) {
      jfSetStatus(t.statusCopyFail, false);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', jfInit);
} else {
  jfInit();
}

