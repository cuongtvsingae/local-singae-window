const qrDict = {
  vi: {
    tagline: 'Tạo QR code từ text, URL hoặc hình ảnh.',
    title: 'QR Code Generator',
    subtitle: 'Tạo mã QR code từ văn bản, URL hoặc hình ảnh.',
    inputLabel: 'Input',
    inputPlaceholder: 'Nhập text...',
    inputPlaceholderUrl: 'Nhập URL website...',
    typeText: 'Text',
    typeUrl: 'URL',
    typeImage: 'Image',
    btnGenerate: 'Generate QR Code',
    btnDownload: 'Download PNG',
    statusGenerateOk: 'Đã tạo QR code thành công.',
    statusGenerateError: 'Lỗi: Không thể tạo QR code.',
    statusDownloadOk: 'Đã tải xuống QR code.',
    statusDownloadError: 'Lỗi: Không thể tải xuống.',
    statusNoQrToDownload: 'Chưa có QR code để tải xuống.',
    statusImageError: 'Lỗi: Không thể đọc file hình ảnh.',
    statusImageTooLarge: 'Ảnh quá lớn. Vui lòng dùng ảnh nhỏ hơn.',
    statusLibraryError: 'Thư viện QR chưa tải xong. Vui lòng thử lại.',
    statusEmptyInput: 'Vui lòng nhập dữ liệu để tạo QR code.'
  },
  en: {
    tagline: 'Generate QR code from text, URL or image.',
    title: 'QR Code Generator',
    subtitle: 'Generate QR code from text, URL or image.',
    inputLabel: 'Input',
    inputPlaceholder: 'Enter text...',
    inputPlaceholderUrl: 'Enter website URL...',
    typeText: 'Text',
    typeUrl: 'URL',
    typeImage: 'Image',
    btnGenerate: 'Generate QR Code',
    btnDownload: 'Download PNG',
    statusGenerateOk: 'QR code generated successfully.',
    statusGenerateError: 'Error: Could not generate QR code.',
    statusDownloadOk: 'QR code downloaded.',
    statusDownloadError: 'Error: Could not download.',
    statusNoQrToDownload: 'No QR code to download.',
    statusImageError: 'Error: Could not read image file.',
    statusImageTooLarge: 'Image is too large. Please use a smaller image.',
    statusLibraryError: 'QR library not ready yet. Please try again.',
    statusEmptyInput: 'Please enter data to generate a QR code.'
  }
};

const MAX_QR_TEXT_LENGTH = 2500;
const MAX_IMAGE_DATA_LENGTH = 1900;
const QR_SIZE = 300;
let qrLang = 'vi';
let currentImageData = '';
let hasGeneratedQr = false;

function getText(key) {
  return qrDict[qrLang]?.[key] || '';
}

function getCanvas() {
  return document.getElementById('qrCanvas');
}

function getSelectedType() {
  return document.querySelector('input[name="inputType"]:checked')?.value || 'text';
}

function getQrTempContainer() {
  let container = document.getElementById('qr-temp-container');
  if (container) return container;
  container = document.createElement('div');
  container.id = 'qr-temp-container';
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.top = '-99999px';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  return container;
}

function qrSetStatus(msg, ok) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${ok ? 'status-ok' : 'status-error'}`;
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function clearCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasGeneratedQr = false;
}

function qrApplyLang() {
  document.documentElement.lang = qrLang;
  const mapping = {
    tagline: 'tagline',
    title: 'title',
    subtitle: 'subtitle',
    inputLabel: 'inputLabel',
    typeText: 'typeText',
    typeUrl: 'typeUrl',
    typeImage: 'typeImage',
    btnGenerate: 'btnGenerate',
    btnDownload: 'btnDownload'
  };
  Object.keys(mapping).forEach((domId) => {
    const el = document.getElementById(domId);
    if (el) el.textContent = getText(mapping[domId]);
  });
  const langLabel = document.getElementById('langLabel');
  if (langLabel) langLabel.textContent = qrLang === 'vi' ? 'VI' : 'EN';
  qrUpdateInputPlaceholder();
}

function qrUpdateInputPlaceholder() {
  const input = document.getElementById('input');
  if (!input) return;
  input.placeholder = getSelectedType() === 'url' ? getText('inputPlaceholderUrl') : getText('inputPlaceholder');
}

function getQrPayload() {
  const type = getSelectedType();
  if (type === 'image') return currentImageData || '';

  const input = document.getElementById('input');
  if (!input) return '';
  let value = input.value.trim();
  if (type === 'url' && value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

function getCorrectLevel(payloadLength) {
  if (typeof QRCode !== 'undefined' && QRCode.CorrectLevel) {
    if (payloadLength > 1800) return QRCode.CorrectLevel.L;
    if (payloadLength > 1400) return QRCode.CorrectLevel.M;
    if (payloadLength > 900) return QRCode.CorrectLevel.Q;
    return QRCode.CorrectLevel.H;
  }
  return undefined;
}

function renderWithQRCodeJs(payload) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = getCanvas();
      const ctx = canvas.getContext('2d');
      const container = getQrTempContainer();
      container.innerHTML = '';
      new QRCode(container, {
        text: payload,
        width: QR_SIZE,
        height: QR_SIZE,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: getCorrectLevel(payload.length)
      });
      setTimeout(() => {
        const internalCanvas = container.querySelector('canvas');
        const internalImg = container.querySelector('img');
        if (internalCanvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(internalCanvas, 0, 0, QR_SIZE, QR_SIZE);
          resolve();
          return;
        }
        if (!internalImg) {
          reject(new Error('Missing QR render output'));
          return;
        }
        if (internalImg.complete) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(internalImg, 0, 0, QR_SIZE, QR_SIZE);
          resolve();
          return;
        }
        internalImg.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(internalImg, 0, 0, QR_SIZE, QR_SIZE);
          resolve();
        };
        internalImg.onerror = () => reject(new Error('QR img failed to load'));
      }, 120);
    } catch (error) {
      reject(error);
    }
  });
}

function renderWithToCanvas(payload) {
  return new Promise((resolve, reject) => {
    const canvas = getCanvas();
    const options = {
      width: QR_SIZE,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    };
    QRCode.toCanvas(canvas, payload, options, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function qrGenerate() {
  const payload = getQrPayload();
  if (!payload) {
    clearCanvas();
    qrSetStatus(getText('statusEmptyInput'), false);
    return;
  }
  if (payload.length > MAX_QR_TEXT_LENGTH) {
    clearCanvas();
    qrSetStatus(getText('statusImageTooLarge'), false);
    return;
  }
  if (typeof QRCode === 'undefined') {
    qrSetStatus(getText('statusLibraryError'), false);
    return;
  }

  try {
    if (typeof QRCode === 'function') {
      await renderWithQRCodeJs(payload);
    } else if (typeof QRCode.toCanvas === 'function') {
      await renderWithToCanvas(payload);
    } else {
      qrSetStatus(getText('statusLibraryError'), false);
      return;
    }
    hasGeneratedQr = true;
    qrSetStatus(getText('statusGenerateOk'), true);
  } catch (error) {
    console.error('QR generate error:', error);
    hasGeneratedQr = false;
    qrSetStatus(getText('statusGenerateError'), false);
  }
}

function qrDownload() {
  if (!hasGeneratedQr) {
    qrSetStatus(getText('statusNoQrToDownload'), false);
    return;
  }
  const canvas = getCanvas();
  canvas.toBlob((blob) => {
    if (!blob) {
      qrSetStatus(getText('statusDownloadError'), false);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcode.png';
    a.click();
    URL.revokeObjectURL(url);
    qrSetStatus(getText('statusDownloadOk'), true);
  }, 'image/png');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read-file-failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load-image-failed'));
    img.src = src;
  });
}

function canvasToDataUrl(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('to-blob-failed'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read-blob-failed'));
      reader.readAsDataURL(blob);
    }, 'image/jpeg', quality);
  });
}

async function processImageInput(file) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    qrSetStatus(getText('statusImageError'), false);
    return;
  }
  try {
    const sourceData = await readFileAsDataUrl(file);
    const img = await loadImage(sourceData);
    const maxSide = 220;
    const ratio = Math.min(maxSide / img.width, maxSide / img.height, 1);
    const width = Math.max(1, Math.round(img.width * ratio));
    const height = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const qualities = [0.75, 0.6, 0.5, 0.4, 0.3];
    let chosen = '';
    for (const quality of qualities) {
      const candidate = await canvasToDataUrl(canvas, quality);
      chosen = candidate;
      if (candidate.length <= MAX_IMAGE_DATA_LENGTH) break;
    }

    if (!chosen || chosen.length > MAX_QR_TEXT_LENGTH) {
      currentImageData = '';
      document.getElementById('imagePreview').innerHTML = '';
      qrSetStatus(getText('statusImageTooLarge'), false);
      clearCanvas();
      return;
    }

    currentImageData = chosen;
    document.getElementById('imagePreview').innerHTML = `<img src="${chosen}" alt="Preview" />`;
    await qrGenerate();
  } catch (error) {
    console.error('Image processing error:', error);
    qrSetStatus(getText('statusImageError'), false);
  }
}

function toggleInputTypeUi() {
  const inputType = getSelectedType();
  const textContainer = document.getElementById('textInputContainer');
  const imageContainer = document.getElementById('imageInputContainer');
  textContainer.style.display = inputType === 'image' ? 'none' : 'block';
  imageContainer.style.display = inputType === 'image' ? 'flex' : 'none';
  qrUpdateInputPlaceholder();
}

function attachEvents() {
  document.getElementById('btnGenerate').addEventListener('click', () => {
    qrGenerate();
  });
  document.getElementById('btnDownload').addEventListener('click', qrDownload);

  let debounceTimer = 0;
  document.getElementById('input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (getSelectedType() !== 'image') qrGenerate();
    }, 280);
  });

  document.querySelectorAll('input[name="inputType"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      toggleInputTypeUi();
      qrGenerate();
    });
  });

  document.getElementById('imageInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      currentImageData = '';
      document.getElementById('imagePreview').innerHTML = '';
      clearCanvas();
      return;
    }
    await processImageInput(file);
  });
}

async function ensureQrLibrary() {
  if (typeof QRCode !== 'undefined') return true;
  const cdnCandidates = [
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
  ];
  for (const src of cdnCandidates) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('load-failed'));
        document.head.appendChild(script);
      });
      if (typeof QRCode !== 'undefined') return true;
    } catch (_) {}
  }
  return false;
}

async function initQrTool() {
  qrApplyLang();
  toggleInputTypeUi();
  attachEvents();
  const ready = await ensureQrLibrary();
  if (!ready) qrSetStatus(getText('statusLibraryError'), false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initQrTool);
} else {
  initQrTool();
}
