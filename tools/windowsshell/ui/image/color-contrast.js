// Color Contrast Checker logic & i18n

const ccDict = {
  vi: {
    tagline: 'Kiểm tra độ tương phản giữa màu chữ và nền.',
    title: 'Color Contrast Checker',
    subtitle: 'Tính tỉ lệ tương phản giữa màu chữ và màu nền.',
    fgLabel: 'Màu chữ',
    bgLabel: 'Màu nền',
    sampleTitle: 'Tip of the Day',
    sampleText: 'Good design feels simple, yet every detail is intentional and crafted with meaning.',
    ratioLabel: 'Tỉ lệ tương phản:',
    wcagAAPass: 'AA: Đạt',
    wcagAAFail: 'AA: Chưa đạt',
    wcagAAAPass: 'AAA: Đạt',
    wcagAAAFail: 'AAA: Chưa đạt',
    hintPoor: 'Độ tương phản kém cho mọi cỡ chữ. Hãy tăng sự khác biệt giữa màu chữ và màu nền.',
    hintGoodAll: 'Độ tương phản tốt cho mọi cỡ chữ. Màu sắc hiện tại đáp ứng tiêu chuẩn cho cả chữ nhỏ và lớn.',
    hintGoodMixed:
      'Độ tương phản tốt cho chữ nhỏ (dưới 18pt) và rất tốt cho chữ lớn (trên 18pt hoặc in đậm trên 14pt).'
  },
  en: {
    tagline: 'Check contrast between text and background colors.',
    title: 'Color Contrast Checker',
    subtitle: 'Calculate the contrast ratio of text and background colors.',
    fgLabel: 'Text color',
    bgLabel: 'Background color',
    sampleTitle: 'Tip of the Day',
    sampleText: 'Good design feels simple, yet every detail is intentional and crafted with meaning.',
    ratioLabel: 'Contrast ratio:',
    wcagAAPass: 'AA: Pass',
    wcagAAFail: 'AA: Fail',
    wcagAAAPass: 'AAA: Pass',
    wcagAAAFail: 'AAA: Fail',
    hintPoor: 'Poor contrast for all text sizes. Increase the difference between text and background colors.',
    hintGoodAll: 'Good contrast for all text sizes. This color pair works well for both small and large text.',
    hintGoodMixed:
      'Good contrast for small text (below 18pt) and great contrast for large text (above 18pt or bold above 14pt).'
  }
};

let ccLang = 'vi';

function ccApplyLang() {
  const t = ccDict[ccLang];
  document.documentElement.lang = ccLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('fgLabel').textContent = t.fgLabel;
  document.getElementById('bgLabel').textContent = t.bgLabel;
  document.getElementById('sampleTitle').textContent = t.sampleTitle;
  document.getElementById('sampleText').textContent = t.sampleText;
  document.getElementById('ratioLabel').textContent = t.ratioLabel + ' ';
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function luminance(rgb) {
  const a = ['r', 'g', 'b'].map((k) => {
    let v = rgb[k] / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(hex1, hex2) {
  const L1 = luminance(hexToRgb(hex1));
  const L2 = luminance(hexToRgb(hex2));
  const bright = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (bright + 0.05) / (dark + 0.05);
}

function isValidHex(value) {
  return /^#?[0-9A-Fa-f]{3,6}$/.test(value.trim());
}

function normalizeHex(value) {
  let v = value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (v.length === 4 || v.length === 7) return v;
  return '#ffffff';
}

function ccUpdate() {
  const t = ccDict[ccLang];
  const fgHexInput = document.getElementById('fgHex');
  const bgHexInput = document.getElementById('bgHex');
  const fgPicker = document.getElementById('fgColorPicker');
  const bgPicker = document.getElementById('bgColorPicker');
  const previewBox = document.getElementById('previewBox');
  const ratioTextEl = document.getElementById('ratioText');
  const contrastCard = document.getElementById('contrastCard');
  const ratingLabelEl = document.getElementById('ratingLabel');
  const ratingStarsEl = document.getElementById('ratingStars');
  const smallTextStarsEl = document.getElementById('smallTextStars');
  const largeTextStarsEl = document.getElementById('largeTextStars');
  const hintEl = document.getElementById('hint');

  const fgVal = normalizeHex(fgHexInput.value);
  const bgVal = normalizeHex(bgHexInput.value);

  fgHexInput.value = fgVal;
  bgHexInput.value = bgVal;
  fgPicker.value = fgVal;
  bgPicker.value = bgVal;

  const fgSwatchDisplay = document.getElementById('fgSwatchDisplay');
  const bgSwatchDisplay = document.getElementById('bgSwatchDisplay');
  if (fgSwatchDisplay) fgSwatchDisplay.style.backgroundColor = fgVal;
  if (bgSwatchDisplay) bgSwatchDisplay.style.backgroundColor = bgVal;

  previewBox.style.color = fgVal;
  previewBox.style.backgroundColor = bgVal;

  const ratio = contrastRatio(fgVal, bgVal);
  const ratioRounded = Math.round(ratio * 100) / 100;
  ratioTextEl.textContent = ratioRounded.toString();

  let ratingLabel = '';
  let ratingStars = '';
  let smallStars = '';
  let largeStars = '';
  let hintText = '';
  let cardClass = 'contrast-card';

  if (ratio < 3) {
    ratingLabel = ccLang === 'vi' ? 'Rất kém' : 'Very poor';
    ratingStars = '★☆☆☆☆';
    smallStars = '★☆☆';
    largeStars = '★☆☆';
    hintText = t.hintPoor;
    cardClass += ' contrast-poor';
  } else if (ratio >= 7) {
    ratingLabel = ccLang === 'vi' ? 'Rất tốt' : 'Very good';
    ratingStars = '★★★★★';
    smallStars = '★★★';
    largeStars = '★★★';
    hintText = t.hintGoodAll;
    cardClass += ' contrast-good-all';
  } else {
    ratingLabel = ccLang === 'vi' ? 'Tốt' : 'Good';
    ratingStars = '★★★★☆';
    smallStars = '★★★';
    largeStars = '★★★';
    hintText = t.hintGoodMixed;
    cardClass += ' contrast-good-mixed';
  }

  if (contrastCard) {
    contrastCard.className = cardClass;
  }
  if (ratingLabelEl) ratingLabelEl.textContent = ratingLabel;
  if (ratingStarsEl) ratingStarsEl.textContent = ratingStars;
  if (smallTextStarsEl) smallTextStarsEl.textContent = smallStars;
  if (largeTextStarsEl) largeTextStarsEl.textContent = largeStars;
  if (hintEl) hintEl.textContent = hintText;
}

function ccInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  ccLang = 'vi';
  ccApplyLang();

  const fgPicker = document.getElementById('fgColorPicker');
  const bgPicker = document.getElementById('bgColorPicker');
  const fgHexInput = document.getElementById('fgHex');
  const bgHexInput = document.getElementById('bgHex');
  const fgSwatch = fgPicker.closest('.color-input-swatch');
  const bgSwatch = bgPicker.closest('.color-input-swatch');
  const previewContainer = document.getElementById('previewContainer');
  const fullscreenBtn = document.getElementById('previewFullscreenBtn');
  const fullscreenBackdrop = document.getElementById('previewFullscreenBackdrop');

  // Custom Color Picker
  let currentPickerTarget = null;
  const pickerBackdrop = document.getElementById('colorPickerBackdrop');
  const pickerArea = document.getElementById('colorPickerArea');
  const pickerHandle = document.getElementById('colorPickerHandle');
  const pickerHue = document.getElementById('colorPickerHue');
  const pickerHueHandle = document.getElementById('colorPickerHueHandle');
  const pickerHex = document.getElementById('colorPickerHex');
  const pickerSwatch = document.getElementById('colorPickerSwatch');
  const pickerCancel = document.getElementById('colorPickerCancel');
  const pickerConfirm = document.getElementById('colorPickerConfirm');

  let pickerHueValue = 0;
  let pickerSat = 1;
  let pickerBright = 1;

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h = 0;
    if (diff !== 0) {
      if (max === r) h = ((g - b) / diff) % 6;
      else if (max === g) h = (b - r) / diff + 2;
      else h = (r - g) / diff + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : diff / max;
    const v = max;
    return { h, s, v };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function updatePickerColor() {
    const rgb = hsvToRgb(pickerHueValue, pickerSat, pickerBright);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    pickerHex.value = hex;
    pickerSwatch.style.backgroundColor = hex;
    pickerArea.style.setProperty('--picker-hue', `hsl(${pickerHueValue}, 100%, 50%)`);

    // Realtime update preview when picking color
    if (currentPickerTarget) {
      const normalized = normalizeHex(hex);

      // Update swatch display immediately
      if (currentPickerTarget === fgHexInput) {
        const fgSwatchDisplay = document.getElementById('fgSwatchDisplay');
        if (fgSwatchDisplay) fgSwatchDisplay.style.backgroundColor = normalized;

        const previewBox = document.getElementById('previewBox');
        const bgHexInput = document.getElementById('bgHex');
        if (previewBox) {
          previewBox.style.color = normalized;
          if (bgHexInput) {
            previewBox.style.backgroundColor = normalizeHex(bgHexInput.value);
          }
          // Update contrast in realtime
          updateContrastRealtime(normalized, bgHexInput ? normalizeHex(bgHexInput.value) : '#111827');
        }
      } else {
        const bgSwatchDisplay = document.getElementById('bgSwatchDisplay');
        if (bgSwatchDisplay) bgSwatchDisplay.style.backgroundColor = normalized;

        const previewBox = document.getElementById('previewBox');
        const fgHexInput = document.getElementById('fgHex');
        if (previewBox) {
          previewBox.style.backgroundColor = normalized;
          if (fgHexInput) {
            previewBox.style.color = normalizeHex(fgHexInput.value);
          }
          // Update contrast in realtime
          updateContrastRealtime(fgHexInput ? normalizeHex(fgHexInput.value) : '#ffffff', normalized);
        }
      }
    }
  }

  function updateContrastRealtime(fgHex, bgHex) {
    const ratio = contrastRatio(fgHex, bgHex);
    const ratioRounded = Math.round(ratio * 100) / 100;
    const ratioTextEl = document.getElementById('ratioText');
    const contrastCard = document.getElementById('contrastCard');
    const ratingLabelEl = document.getElementById('ratingLabel');
    const ratingStarsEl = document.getElementById('ratingStars');
    const smallTextStarsEl = document.getElementById('smallTextStars');
    const largeTextStarsEl = document.getElementById('largeTextStars');
    const hintEl = document.getElementById('hint');
    const t = ccDict[ccLang];

    if (ratioTextEl) ratioTextEl.textContent = ratioRounded.toString();

    let ratingLabel = '';
    let ratingStars = '';
    let smallStars = '';
    let largeStars = '';
    let hintText = '';
    let cardClass = 'contrast-card';

    if (ratio < 3) {
      ratingLabel = ccLang === 'vi' ? 'Rất kém' : 'Very poor';
      ratingStars = '★☆☆☆☆';
      smallStars = '★☆☆';
      largeStars = '★☆☆';
      hintText = t.hintPoor;
      cardClass += ' contrast-poor';
    } else if (ratio >= 7) {
      ratingLabel = ccLang === 'vi' ? 'Rất tốt' : 'Very good';
      ratingStars = '★★★★★';
      smallStars = '★★★';
      largeStars = '★★★';
      hintText = t.hintGoodAll;
      cardClass += ' contrast-good-all';
    } else {
      ratingLabel = ccLang === 'vi' ? 'Tốt' : 'Good';
      ratingStars = '★★★★☆';
      smallStars = '★★★';
      largeStars = '★★★';
      hintText = t.hintGoodMixed;
      cardClass += ' contrast-good-mixed';
    }

    if (contrastCard) contrastCard.className = cardClass;
    if (ratingLabelEl) ratingLabelEl.textContent = ratingLabel;
    if (ratingStarsEl) ratingStarsEl.textContent = ratingStars;
    if (smallTextStarsEl) smallTextStarsEl.textContent = smallStars;
    if (largeTextStarsEl) largeTextStarsEl.textContent = largeStars;
    if (hintEl) hintEl.textContent = hintText;
  }

  function openPicker(targetInput, currentHex, clickEvent) {
    currentPickerTarget = targetInput;
    const rgb = hexToRgb(currentHex);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    pickerHueValue = hsv.h;
    pickerSat = hsv.s;
    pickerBright = hsv.v;

    // Clamp handle positions to keep within bounds
    const areaRect = pickerArea.getBoundingClientRect();
    const areaWidth = areaRect.width;
    const areaHeight = areaRect.height;
    const minX = handleOffset / areaWidth;
    const maxX = 1 - handleOffset / areaWidth;
    const minY = handleOffset / areaHeight;
    const maxY = 1 - handleOffset / areaHeight;

    pickerSat = Math.max(minX, Math.min(maxX, pickerSat));
    const brightY = 1 - pickerBright;
    const clampedY = Math.max(minY, Math.min(maxY, brightY));
    pickerBright = 1 - clampedY;

    pickerHandle.style.left = pickerSat * 100 + '%';
    pickerHandle.style.top = clampedY * 100 + '%';

    // Clamp hue handle
    const hueRect = pickerHue.getBoundingClientRect();
    const hueWidth = hueRect.width;
    const hueMinX = hueHandleOffset / hueWidth;
    const hueMaxX = 1 - hueHandleOffset / hueWidth;
    const hueX = pickerHueValue / 360;
    const clampedHueX = Math.max(hueMinX, Math.min(hueMaxX, hueX));
    pickerHueHandle.style.left = clampedHueX * 100 + '%';

    updatePickerColor();

    // Position picker at click location
    if (clickEvent) {
      const dialog = document.querySelector('.color-picker-dialog');
      const clickX = clickEvent.clientX;
      const clickY = clickEvent.clientY;
      const dialogWidth = 320;
      const dialogHeight = dialog.offsetHeight || 400;
      const margin = 10;

      let left = clickX;
      let top = clickY;

      // Adjust if too close to edges
      if (clickX + dialogWidth + margin > window.innerWidth) {
        left = window.innerWidth - dialogWidth - margin;
      }
      if (clickX - margin < 0) {
        left = margin;
      }
      if (clickY + dialogHeight + margin > window.innerHeight) {
        top = window.innerHeight - dialogHeight - margin;
      }
      if (clickY - margin < 0) {
        top = margin;
      }

      dialog.style.left = left + 'px';
      dialog.style.top = top + 'px';
      dialog.style.transform = 'scale(1)';
    }

    pickerBackdrop.classList.add('is-open');
  }

  function closePicker() {
    pickerBackdrop.classList.remove('is-open');
    currentPickerTarget = null;
  }

  function confirmPicker() {
    if (currentPickerTarget) {
      const hex = pickerHex.value;
      if (isValidHex(hex)) {
        const normalized = normalizeHex(hex);
        if (currentPickerTarget === fgHexInput) {
          fgHexInput.value = normalized;
          fgPicker.value = normalized;
        } else {
          bgHexInput.value = normalized;
          bgPicker.value = normalized;
        }
        ccUpdate();
      }
    }
    closePicker();
  }

  // Area interaction
  let isDraggingArea = false;
  const handleSize = 16; // Handle width/height in pixels
  const handleOffset = handleSize / 2; // ±8px

  pickerArea.addEventListener('mousedown', (e) => {
    isDraggingArea = true;
    const rect = pickerArea.getBoundingClientRect();
    const areaWidth = rect.width;
    const areaHeight = rect.height;

    // Calculate position with handle offset to keep it within bounds
    let x = (e.clientX - rect.left) / areaWidth;
    let y = (e.clientY - rect.top) / areaHeight;

    // Clamp to keep handle within bounds (±0.5 handle size)
    const minX = handleOffset / areaWidth;
    const maxX = 1 - handleOffset / areaWidth;
    const minY = handleOffset / areaHeight;
    const maxY = 1 - handleOffset / areaHeight;

    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));

    pickerSat = x;
    pickerBright = 1 - y;
    pickerHandle.style.left = x * 100 + '%';
    pickerHandle.style.top = y * 100 + '%';
    updatePickerColor();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingArea) {
      const rect = pickerArea.getBoundingClientRect();
      const areaWidth = rect.width;
      const areaHeight = rect.height;

      // Calculate position with handle offset
      let x = (e.clientX - rect.left) / areaWidth;
      let y = (e.clientY - rect.top) / areaHeight;

      // Clamp to keep handle within bounds
      const minX = handleOffset / areaWidth;
      const maxX = 1 - handleOffset / areaWidth;
      const minY = handleOffset / areaHeight;
      const maxY = 1 - handleOffset / areaHeight;

      x = Math.max(minX, Math.min(maxX, x));
      y = Math.max(minY, Math.min(maxY, y));

      pickerSat = x;
      pickerBright = 1 - y;
      pickerHandle.style.left = x * 100 + '%';
      pickerHandle.style.top = y * 100 + '%';
      updatePickerColor();
    }
  });

  document.addEventListener('mouseup', () => {
    isDraggingArea = false;
  });

  // Hue slider
  let isDraggingHue = false;
  const hueHandleSize = 20; // Hue handle width in pixels
  const hueHandleOffset = hueHandleSize / 2; // ±10px

  pickerHue.addEventListener('mousedown', (e) => {
    isDraggingHue = true;
    const rect = pickerHue.getBoundingClientRect();
    const sliderWidth = rect.width;

    let x = (e.clientX - rect.left) / sliderWidth;

    // Clamp to keep handle within bounds
    const minX = hueHandleOffset / sliderWidth;
    const maxX = 1 - hueHandleOffset / sliderWidth;
    x = Math.max(minX, Math.min(maxX, x));

    pickerHueValue = x * 360;
    pickerHueHandle.style.left = x * 100 + '%';
    updatePickerColor();
  });

  document.addEventListener('mousemove', (e) => {
    if (isDraggingHue) {
      const rect = pickerHue.getBoundingClientRect();
      const sliderWidth = rect.width;

      let x = (e.clientX - rect.left) / sliderWidth;

      // Clamp to keep handle within bounds
      const minX = hueHandleOffset / sliderWidth;
      const maxX = 1 - hueHandleOffset / sliderWidth;
      x = Math.max(minX, Math.min(maxX, x));

      pickerHueValue = x * 360;
      pickerHueHandle.style.left = x * 100 + '%';
      updatePickerColor();
    }
  });

  document.addEventListener('mouseup', () => {
    isDraggingHue = false;
  });

  // Hex input
  pickerHex.addEventListener('input', () => {
    const hex = pickerHex.value.trim();
    if (isValidHex(hex)) {
      const normalized = normalizeHex(hex);
      const rgb = hexToRgb(normalized);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      pickerHueValue = hsv.h;
      pickerSat = hsv.s;
      pickerBright = hsv.v;

      // Clamp handle positions
      const areaRect = pickerArea.getBoundingClientRect();
      const areaWidth = areaRect.width;
      const areaHeight = areaRect.height;
      const minX = handleOffset / areaWidth;
      const maxX = 1 - handleOffset / areaWidth;
      const minY = handleOffset / areaHeight;
      const maxY = 1 - handleOffset / areaHeight;

      pickerSat = Math.max(minX, Math.min(maxX, pickerSat));
      const brightY = 1 - pickerBright;
      const clampedY = Math.max(minY, Math.min(maxY, brightY));
      pickerBright = 1 - clampedY;

      pickerHandle.style.left = pickerSat * 100 + '%';
      pickerHandle.style.top = clampedY * 100 + '%';

      // Clamp hue handle
      const hueRect = pickerHue.getBoundingClientRect();
      const hueWidth = hueRect.width;
      const hueMinX = hueHandleOffset / hueWidth;
      const hueMaxX = 1 - hueHandleOffset / hueWidth;
      const hueX = pickerHueValue / 360;
      const clampedHueX = Math.max(hueMinX, Math.min(hueMaxX, hueX));
      pickerHueHandle.style.left = clampedHueX * 100 + '%';

      pickerSwatch.style.backgroundColor = normalized;
      updatePickerColor();
    }
  });

  pickerCancel.addEventListener('click', closePicker);
  pickerConfirm.addEventListener('click', confirmPicker);
  pickerBackdrop.addEventListener('click', (e) => {
    if (e.target === pickerBackdrop) closePicker();
  });

  // Open picker on swatch click
  fgSwatch.addEventListener('click', (e) => {
    e.stopPropagation();
    openPicker(fgHexInput, fgHexInput.value, e);
  });
  bgSwatch.addEventListener('click', (e) => {
    e.stopPropagation();
    openPicker(bgHexInput, bgHexInput.value, e);
  });

  // Native input is hidden, no need for event listeners
  fgHexInput.addEventListener('change', () => {
    if (!isValidHex(fgHexInput.value)) return;
    ccUpdate();
  });
  bgHexInput.addEventListener('change', () => {
    if (!isValidHex(bgHexInput.value)) return;
    ccUpdate();
  });

  function setFullscreen(on) {
    if (!previewContainer) return;
    previewContainer.classList.toggle('is-fullscreen', on);
    document.body.classList.toggle('preview-fullscreen-open', on);
  }

  if (fullscreenBtn && previewContainer) {
    fullscreenBtn.addEventListener('click', () => {
      const isOpen = !previewContainer.classList.contains('is-fullscreen');
      setFullscreen(isOpen);
    });
  }

  if (fullscreenBackdrop && previewContainer) {
    fullscreenBackdrop.addEventListener('click', () => {
      if (previewContainer.classList.contains('is-fullscreen')) {
        setFullscreen(false);
      }
    });
  }

  ccUpdate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ccInitTool);
} else {
  ccInitTool();
}
