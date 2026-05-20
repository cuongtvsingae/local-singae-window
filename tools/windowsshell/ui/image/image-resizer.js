// Image Resizer logic & i18n

const resizerDict = {
  vi: {
    tagline: 'Resize ảnh với nhiều preset.',
    title: 'Image Resizer',
    subtitle: 'Resize ảnh với nhiều preset.',
    uploadText: 'Kéo thả ảnh vào đây hoặc click để chọn',
    uploadHint: 'Hỗ trợ PNG, JPG, JPEG, WEBP',
    originalLabel: 'Ảnh gốc',
    resizedLabel: 'Preview Crop',
    widthLabel: 'Chiều rộng (px)',
    heightLabel: 'Chiều cao (px)',
    maintainAspectLabel: 'Giữ tỷ lệ khung hình',
    rotateLabel: 'Xoay ảnh',
    cropLabel: 'Kéo crop box để chọn vùng (aspect ratio cố định)',
    btnApplyCrop: 'Crop & Download',
    btnResize: 'Cập nhật Crop Box',
    btnDownload: 'Tải xuống',
    statusProcessing: 'Đang xử lý...',
    statusError: 'Lỗi: Không thể xử lý ảnh.',
    statusSuccess: 'Resize thành công!',
    codeSamplesTitle: 'Code mẫu',
    customSize: 'Custom Size',
    tooltipCustomSize: 'Tự chọn kích thước tùy chỉnh',
    tooltipInstagramPost: 'Instagram Post: 1080 × 1080px (1:1)',
    tooltipInstagramStory: 'Instagram Story: 1080 × 1920px (9:16)',
    tooltipFacebookCover: 'Facebook Cover: 1200 × 630px (1.91:1)',
    tooltipTwitterHeader: 'Twitter Header: 1500 × 500px (3:1)',
    tooltipLinkedInPost: 'LinkedIn Post: 1200 × 627px (1.91:1)',
    tooltipYouTubeThumbnail: 'YouTube Thumbnail: 1280 × 720px (16:9)'
  },
  en: {
    tagline: 'Resize images with multiple presets.',
    title: 'Image Resizer',
    subtitle: 'Resize images with multiple presets.',
    uploadText: 'Drag & drop image here or click to select',
    uploadHint: 'Supports PNG, JPG, JPEG, WEBP',
    originalLabel: 'Original Image',
    resizedLabel: 'Crop Preview',
    widthLabel: 'Width (px)',
    heightLabel: 'Height (px)',
    maintainAspectLabel: 'Maintain aspect ratio',
    rotateLabel: 'Rotate Image',
    cropLabel: 'Drag crop box to select area (fixed aspect ratio)',
    btnApplyCrop: 'Crop & Download',
    btnResize: 'Update Crop Box',
    btnDownload: 'Download',
    statusProcessing: 'Processing...',
    statusError: 'Error: Could not process image.',
    statusSuccess: 'Resize successful!',
    codeSamplesTitle: 'Code Samples',
    customSize: 'Custom Size',
    tooltipCustomSize: 'Choose custom size',
    tooltipInstagramPost: 'Instagram Post: 1080 × 1080px (1:1)',
    tooltipInstagramStory: 'Instagram Story: 1080 × 1920px (9:16)',
    tooltipFacebookCover: 'Facebook Cover: 1200 × 630px (1.91:1)',
    tooltipTwitterHeader: 'Twitter Header: 1500 × 500px (3:1)',
    tooltipLinkedInPost: 'LinkedIn Post: 1200 × 627px (1.91:1)',
    tooltipYouTubeThumbnail: 'YouTube Thumbnail: 1280 × 720px (16:9)',
    tooltipRotate: 'Rotate 90°',
    tooltipResetRotate: 'Reset rotation'
  }
};

let resizerLang = 'vi';
let originalImage = null;
let croppedImageBlob = null;
let originalWidth = 0;
let originalHeight = 0;
let currentRotation = 0;
let cropArea = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let cropBoxX = 0;
let cropBoxY = 0;
let cropBoxWidth = 0;
let cropBoxHeight = 0;
let canvasScale = 1;
let isCustomSize = false;
let isResizing = false;
let resizeHandle = null; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'

const presets = [
  { 
    name: 'Instagram Post', 
    width: 1080, 
    height: 1080,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><rect x="6" y="6" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="5" fill="currentColor"/><circle cx="22" cy="10" r="1.5" fill="currentColor"/></svg>',
    tooltipKey: 'tooltipInstagramPost'
  },
  { 
    name: 'Instagram Story', 
    width: 1080, 
    height: 1920,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><rect x="8" y="4" width="16" height="24" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="12" r="3" fill="currentColor"/><path d="M10 20l6-4 4 4 6-4v6H10z" fill="currentColor" opacity="0.6"/></svg>',
    tooltipKey: 'tooltipInstagramStory'
  },
  { 
    name: 'Facebook Cover', 
    width: 1200, 
    height: 630,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><rect x="4" y="8" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h24M4 16h24M4 20h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    tooltipKey: 'tooltipFacebookCover'
  },
  { 
    name: 'Twitter Header', 
    width: 1500, 
    height: 500,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><path d="M6 10c0-2 1.5-4 4-4h12c2.5 0 4 2 4 4v12c0 2-1.5 4-4 4H10c-2.5 0-4-2-4-4V10z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="4" fill="currentColor"/><path d="M12 12l8 8M20 12l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    tooltipKey: 'tooltipTwitterHeader'
  },
  { 
    name: 'LinkedIn Post', 
    width: 1200, 
    height: 627,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><rect x="4" y="6" width="24" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="10" width="16" height="12" rx="1" fill="currentColor" opacity="0.3"/><line x1="8" y1="14" x2="24" y2="14" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="1.5"/></svg>',
    tooltipKey: 'tooltipLinkedInPost'
  },
  { 
    name: 'YouTube Thumbnail', 
    width: 1280, 
    height: 720,
    icon: '<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><rect x="4" y="8" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 12v8l6-4z" fill="currentColor"/><circle cx="24" cy="12" r="1.5" fill="currentColor"/></svg>',
    tooltipKey: 'tooltipYouTubeThumbnail'
  }
];

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getResizeCursor(handle) {
  const cursors = {
    'nw': 'nw-resize',
    'ne': 'ne-resize',
    'sw': 'sw-resize',
    'se': 'se-resize',
    'n': 'n-resize',
    's': 's-resize',
    'e': 'e-resize',
    'w': 'w-resize'
  };
  return cursors[handle] || 'default';
}

function resizerApplyLang() {
  const t = resizerDict[resizerLang];
  document.documentElement.lang = resizerLang;
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  setText('tagline', t.tagline);
  setText('title', t.title);
  setText('subtitle', t.subtitle);
  setText('uploadText', t.uploadText);
  setText('uploadHint', t.uploadHint);
  setText('widthLabel', t.widthLabel);
  setText('heightLabel', t.heightLabel);
  setText('maintainAspectLabel', t.maintainAspectLabel);
  setText('btnResize', t.btnResize);
  setText('btnDownload', t.btnDownload);
  setText('codeSamplesTitle', t.codeSamplesTitle);
  setText('langLabel', resizerLang === 'vi' ? 'VI' : 'EN');
  const customBtn = document.getElementById('customSizeBtn');
  if (customBtn) {
    customBtn.setAttribute('data-tooltip', t.tooltipCustomSize);
  }
  // Update preset button tooltips
  const presetBtns = document.querySelectorAll('.preset-btn:not(#customSizeBtn)');
  presets.forEach((preset, index) => {
    if (presetBtns[index]) {
      presetBtns[index].setAttribute('data-tooltip', t[preset.tooltipKey]);
    }
  });
  // Update rotate button tooltips
  const rotateBtn = document.getElementById('btnRotate');
  const resetBtn = document.getElementById('btnResetRotate');
  if (rotateBtn) rotateBtn.setAttribute('data-tooltip', t.tooltipRotate);
  if (resetBtn) resetBtn.setAttribute('data-tooltip', t.tooltipResetRotate);
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      originalWidth = img.width;
      originalHeight = img.height;
      currentRotation = 0;
      cropArea = null;
      
      // Update info (canvas replaces original image display)
      document.getElementById('originalInfo').textContent = 
        `${originalWidth} × ${originalHeight}px • ${formatFileSize(file.size)}`;
      
      // Set default crop size
      const defaultWidth = Math.min(originalWidth, 800);
      const defaultHeight = Math.min(originalHeight, 600);
      document.getElementById('widthInput').value = defaultWidth;
      document.getElementById('heightInput').value = defaultHeight;
      
      // Disable inputs by default (preset mode)
      document.getElementById('widthInput').disabled = true;
      document.getElementById('heightInput').disabled = true;
      isCustomSize = false;
      
      document.getElementById('resizeControls').style.display = 'block';
      document.getElementById('previewGrid').style.display = 'grid';
      document.getElementById('btnRow').style.display = 'flex';
      document.getElementById('cropControls').style.display = 'block';
      
      initCropCanvas();
      updateCropBox();
      updateCodeSamples(defaultWidth, defaultHeight);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function rotateImage(degrees) {
  if (!originalImage) return;
  currentRotation = (currentRotation + degrees) % 360;
  applyTransformations();
}

function resetRotation() {
  currentRotation = 0;
  applyTransformations();
}

function getRotatedImage(callback) {
  if (!originalImage) {
    if (callback) callback(null);
    return null;
  }
  
  if (currentRotation === 0) {
    if (callback) callback(originalImage);
    return originalImage;
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  let displayWidth = originalWidth;
  let displayHeight = originalHeight;
  
  // Swap dimensions for 90/270 degree rotations
  if (currentRotation === 90 || currentRotation === 270) {
    displayWidth = originalHeight;
    displayHeight = originalWidth;
  }
  
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  
  ctx.save();
  ctx.translate(displayWidth / 2, displayHeight / 2);
  ctx.rotate((currentRotation * Math.PI) / 180);
  ctx.drawImage(originalImage, -originalWidth / 2, -originalHeight / 2);
  ctx.restore();
  
  const img = new Image();
  img.onload = () => {
    if (callback) callback(img);
  };
  img.src = canvas.toDataURL();
  return img;
}

function applyTransformations() {
  if (!originalImage) return;
  
  getRotatedImage((rotatedImg) => {
    if (!rotatedImg) return;
    
    // Update crop canvas (replaces original image display)
    updateCropCanvas(rotatedImg);
    updateCropBox();
  });
}

function updateCropCanvas(img) {
  const cropCanvas = document.getElementById('cropCanvas');
  if (!cropCanvas || !img) return;
  
  // Use same size for canvas - match to original image display size
  const maxDisplaySize = 600; // Max display size
  const imgWidth = img.width || originalWidth;
  const imgHeight = img.height || originalHeight;
  canvasScale = Math.min(maxDisplaySize / imgWidth, maxDisplaySize / imgHeight, 1);
  
  const displayWidth = imgWidth * canvasScale;
  const displayHeight = imgHeight * canvasScale;
  
  // Set canvas size
  cropCanvas.width = displayWidth;
  cropCanvas.height = displayHeight;
  
  const ctx = cropCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
  
  // Store dimensions
  cropCanvas.dataset.imgWidth = imgWidth;
  cropCanvas.dataset.imgHeight = imgHeight;
  cropCanvas.dataset.scale = canvasScale;
}

function updateCropBox() {
  const targetWidth = parseInt(document.getElementById('widthInput').value) || 100;
  const targetHeight = parseInt(document.getElementById('heightInput').value) || 100;
  
  if (targetWidth <= 0 || targetHeight <= 0) return;
  
  getRotatedImage((rotatedImg) => {
    if (!rotatedImg) return;
    
    const imgWidth = rotatedImg.width || originalWidth;
    const imgHeight = rotatedImg.height || originalHeight;
    
    // Calculate crop box size based on target aspect ratio
    const targetAspect = targetWidth / targetHeight;
    let boxWidth, boxHeight;
    
    // Fit crop box to image while maintaining target aspect ratio
    if (imgWidth / imgHeight > targetAspect) {
      // Image is wider than target aspect, fit to height
      boxHeight = Math.min(imgHeight, imgHeight * 0.9);
      boxWidth = boxHeight * targetAspect;
    } else {
      // Image is taller than target aspect, fit to width
      boxWidth = Math.min(imgWidth, imgWidth * 0.9);
      boxHeight = boxWidth / targetAspect;
    }
    
    // Ensure crop box doesn't exceed image bounds
    if (boxWidth > imgWidth) {
      boxWidth = imgWidth;
      boxHeight = boxWidth / targetAspect;
    }
    if (boxHeight > imgHeight) {
      boxHeight = imgHeight;
      boxWidth = boxHeight * targetAspect;
    }
    
    // Center crop box
    cropBoxWidth = boxWidth;
    cropBoxHeight = boxHeight;
    cropBoxX = Math.max(0, (imgWidth - boxWidth) / 2);
    cropBoxY = Math.max(0, (imgHeight - boxHeight) / 2);
    
    // Ensure crop box stays within bounds
    if (cropBoxX + cropBoxWidth > imgWidth) {
      cropBoxX = imgWidth - cropBoxWidth;
    }
    if (cropBoxY + cropBoxHeight > imgHeight) {
      cropBoxY = imgHeight - cropBoxHeight;
    }
    
    drawCropPreview();
  });
}

function initCropCanvas() {
  const cropCanvas = document.getElementById('cropCanvas');
  if (!cropCanvas || !originalImage) return;
  
  getRotatedImage((rotatedImg) => {
    if (rotatedImg) {
      updateCropCanvas(rotatedImg);
      // updateCropBox will be called after canvas is ready
      setTimeout(() => updateCropBox(), 100);
    }
  });
  
  // Add drag event listeners for crop box
  cropCanvas.onmousedown = (e) => {
    if (!isCustomSize) {
      // Only allow dragging (not resizing) when not in custom mode
      const rect = cropCanvas.getBoundingClientRect();
      const scale = parseFloat(cropCanvas.dataset.scale) || canvasScale;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      
      // Check if click is inside crop box
      if (x >= cropBoxX && x <= cropBoxX + cropBoxWidth &&
          y >= cropBoxY && y <= cropBoxY + cropBoxHeight) {
        isDragging = true;
        dragStartX = x - cropBoxX;
        dragStartY = y - cropBoxY;
        cropCanvas.style.cursor = 'grabbing';
      }
    } else {
      // Custom mode: allow both dragging and resizing
      const rect = cropCanvas.getBoundingClientRect();
      const scale = parseFloat(cropCanvas.dataset.scale) || canvasScale;
      const x = (e.clientX - rect.left) / scale;
      const y = (e.clientY - rect.top) / scale;
      
      const handleSize = 15 / scale; // Increased handle size for easier clicking
      const borderSize = 8 / scale; // Size for border detection
      const x1 = cropBoxX;
      const y1 = cropBoxY;
      const x2 = cropBoxX + cropBoxWidth;
      const y2 = cropBoxY + cropBoxHeight;
      
      // Check for resize handles (corners first, then edges)
      const isNearCorner = (px, py, cx, cy) => Math.abs(px - cx) < handleSize && Math.abs(py - cy) < handleSize;
      const isNearEdge = (px, py, edge) => {
        if (edge === 'n') return Math.abs(px - (x1 + x2) / 2) < handleSize && Math.abs(py - y1) < handleSize;
        if (edge === 's') return Math.abs(px - (x1 + x2) / 2) < handleSize && Math.abs(py - y2) < handleSize;
        if (edge === 'w') return Math.abs(px - x1) < handleSize && Math.abs(py - (y1 + y2) / 2) < handleSize;
        if (edge === 'e') return Math.abs(px - x2) < handleSize && Math.abs(py - (y1 + y2) / 2) < handleSize;
        return false;
      };
      
      // Check corners first (priority)
      if (isNearCorner(x, y, x1, y1)) {
        resizeHandle = 'nw';
        isResizing = true;
      } else if (isNearCorner(x, y, x2, y1)) {
        resizeHandle = 'ne';
        isResizing = true;
      } else if (isNearCorner(x, y, x1, y2)) {
        resizeHandle = 'sw';
        isResizing = true;
      } else if (isNearCorner(x, y, x2, y2)) {
        resizeHandle = 'se';
        isResizing = true;
      } 
      // Check edges
      else if (isNearEdge(x, y, 'n')) {
        resizeHandle = 'n';
        isResizing = true;
      } else if (isNearEdge(x, y, 's')) {
        resizeHandle = 's';
        isResizing = true;
      } else if (isNearEdge(x, y, 'w')) {
        resizeHandle = 'w';
        isResizing = true;
      } else if (isNearEdge(x, y, 'e')) {
        resizeHandle = 'e';
        isResizing = true;
      }
      // Check if on border (for easier resizing)
      else if (Math.abs(x - x1) < borderSize && y >= y1 && y <= y2) {
        resizeHandle = 'w';
        isResizing = true;
      } else if (Math.abs(x - x2) < borderSize && y >= y1 && y <= y2) {
        resizeHandle = 'e';
        isResizing = true;
      } else if (Math.abs(y - y1) < borderSize && x >= x1 && x <= x2) {
        resizeHandle = 'n';
        isResizing = true;
      } else if (Math.abs(y - y2) < borderSize && x >= x1 && x <= x2) {
        resizeHandle = 's';
        isResizing = true;
      }
      // Check if inside crop box for dragging
      else if (x >= cropBoxX && x <= cropBoxX + cropBoxWidth &&
               y >= cropBoxY && y <= cropBoxY + cropBoxHeight) {
        // Dragging the crop box
        isDragging = true;
        dragStartX = x - cropBoxX;
        dragStartY = y - cropBoxY;
        cropCanvas.style.cursor = 'grabbing';
      }
      
      if (isResizing) {
        dragStartX = x;
        dragStartY = y;
        cropCanvas.style.cursor = getResizeCursor(resizeHandle);
      }
    }
  };
  
  cropCanvas.onmousemove = (e) => {
    const rect = cropCanvas.getBoundingClientRect();
    const scale = parseFloat(cropCanvas.dataset.scale) || canvasScale;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    const imgWidth = parseFloat(cropCanvas.dataset.imgWidth) || originalWidth;
    const imgHeight = parseFloat(cropCanvas.dataset.imgHeight) || originalHeight;
    
    if (isResizing && isCustomSize) {
      // Resize crop box
      const targetWidth = parseInt(document.getElementById('widthInput').value) || 100;
      const targetHeight = parseInt(document.getElementById('heightInput').value) || 100;
      const targetAspect = targetWidth / targetHeight;
      
      let newX = cropBoxX;
      let newY = cropBoxY;
      let newW = cropBoxWidth;
      let newH = cropBoxHeight;
      
      const deltaX = x - dragStartX;
      const deltaY = y - dragStartY;
      
      switch (resizeHandle) {
        case 'nw':
          newW = cropBoxWidth - deltaX;
          newH = newW / targetAspect;
          newX = cropBoxX + deltaX;
          newY = cropBoxY + (cropBoxHeight - newH);
          break;
        case 'ne':
          newW = cropBoxWidth + deltaX;
          newH = newW / targetAspect;
          newY = cropBoxY + (cropBoxHeight - newH);
          break;
        case 'sw':
          newW = cropBoxWidth - deltaX;
          newH = newW / targetAspect;
          newX = cropBoxX + deltaX;
          break;
        case 'se':
          newW = cropBoxWidth + deltaX;
          newH = newW / targetAspect;
          break;
        case 'n':
          newH = cropBoxHeight - deltaY;
          newW = newH * targetAspect;
          newY = cropBoxY + deltaY;
          newX = cropBoxX + (cropBoxWidth - newW) / 2;
          break;
        case 's':
          newH = cropBoxHeight + deltaY;
          newW = newH * targetAspect;
          newX = cropBoxX + (cropBoxWidth - newW) / 2;
          break;
        case 'w':
          newW = cropBoxWidth - deltaX;
          newH = newW / targetAspect;
          newX = cropBoxX + deltaX;
          newY = cropBoxY + (cropBoxHeight - newH) / 2;
          break;
        case 'e':
          newW = cropBoxWidth + deltaX;
          newH = newW / targetAspect;
          newY = cropBoxY + (cropBoxHeight - newH) / 2;
          break;
      }
      
      // Clamp to image bounds
      if (newX < 0) {
        newW += newX;
        newH = newW / targetAspect;
        newX = 0;
      }
      if (newY < 0) {
        newH += newY;
        newW = newH * targetAspect;
        newY = 0;
      }
      if (newX + newW > imgWidth) {
        newW = imgWidth - newX;
        newH = newW / targetAspect;
      }
      if (newY + newH > imgHeight) {
        newH = imgHeight - newY;
        newW = newH * targetAspect;
      }
      
      // Ensure minimum size
      if (newW < 10 || newH < 10) return;
      
      cropBoxX = newX;
      cropBoxY = newY;
      cropBoxWidth = newW;
      cropBoxHeight = newH;
      
      // Update input values to match new crop box size
      document.getElementById('widthInput').value = Math.round(cropBoxWidth);
      document.getElementById('heightInput').value = Math.round(cropBoxHeight);
      
      drawCropPreview();
      dragStartX = x;
      dragStartY = y;
    } else if (isDragging) {
      // Calculate new position
      let newX = x - dragStartX;
      let newY = y - dragStartY;
      
      // Clamp to image bounds
      newX = Math.max(0, Math.min(newX, imgWidth - cropBoxWidth));
      newY = Math.max(0, Math.min(newY, imgHeight - cropBoxHeight));
      
      cropBoxX = newX;
      cropBoxY = newY;
      
      drawCropPreview();
    } else {
      // Change cursor when hovering
      if (isCustomSize) {
        const handleSize = 10 / scale;
        const x1 = cropBoxX;
        const y1 = cropBoxY;
        const x2 = cropBoxX + cropBoxWidth;
        const y2 = cropBoxY + cropBoxHeight;
        
        if (Math.abs(x - x1) < handleSize && Math.abs(y - y1) < handleSize) {
          cropCanvas.style.cursor = 'nw-resize';
        } else if (Math.abs(x - x2) < handleSize && Math.abs(y - y1) < handleSize) {
          cropCanvas.style.cursor = 'ne-resize';
        } else if (Math.abs(x - x1) < handleSize && Math.abs(y - y2) < handleSize) {
          cropCanvas.style.cursor = 'sw-resize';
        } else if (Math.abs(x - x2) < handleSize && Math.abs(y - y2) < handleSize) {
          cropCanvas.style.cursor = 'se-resize';
        } else if (Math.abs(x - (x1 + x2) / 2) < handleSize && Math.abs(y - y1) < handleSize) {
          cropCanvas.style.cursor = 'n-resize';
        } else if (Math.abs(x - (x1 + x2) / 2) < handleSize && Math.abs(y - y2) < handleSize) {
          cropCanvas.style.cursor = 's-resize';
        } else if (Math.abs(x - x1) < handleSize && Math.abs(y - (y1 + y2) / 2) < handleSize) {
          cropCanvas.style.cursor = 'w-resize';
        } else if (Math.abs(x - x2) < handleSize && Math.abs(y - (y1 + y2) / 2) < handleSize) {
          cropCanvas.style.cursor = 'e-resize';
        } else if (x >= cropBoxX && x <= cropBoxX + cropBoxWidth &&
                   y >= cropBoxY && y <= cropBoxY + cropBoxHeight) {
          cropCanvas.style.cursor = 'grab';
        } else {
          cropCanvas.style.cursor = 'default';
        }
      } else {
        if (x >= cropBoxX && x <= cropBoxX + cropBoxWidth &&
            y >= cropBoxY && y <= cropBoxY + cropBoxHeight) {
          cropCanvas.style.cursor = 'grab';
        } else {
          cropCanvas.style.cursor = 'default';
        }
      }
    }
  };
  
  cropCanvas.onmouseup = () => {
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
    cropCanvas.style.cursor = 'default';
  };
  
  cropCanvas.onmouseleave = () => {
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
    cropCanvas.style.cursor = 'default';
  };
}

function drawCropPreview() {
  const cropCanvas = document.getElementById('cropCanvas');
  if (!cropCanvas) return;
  
  getRotatedImage((rotatedImg) => {
    if (!rotatedImg) return;
    
    const ctx = cropCanvas.getContext('2d');
    const scale = parseFloat(cropCanvas.dataset.scale) || canvasScale;
    
    // Redraw image
    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    ctx.drawImage(rotatedImg, 0, 0, cropCanvas.width, cropCanvas.height);
    
    // Draw crop box
    const x = cropBoxX * scale;
    const y = cropBoxY * scale;
    const w = cropBoxWidth * scale;
    const h = cropBoxHeight * scale;
    
    // Draw overlay with alpha 0.3 outside crop area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    // Clear the crop area (alpha = 0, fully transparent)
    ctx.clearRect(x, y, w, h);
    
    // Redraw the cropped portion (fully visible)
    ctx.drawImage(
      rotatedImg,
      cropBoxX, cropBoxY, cropBoxWidth, cropBoxHeight,
      x, y, w, h
    );
    
    // Draw crop border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    
    // Draw corner handles (only if custom size mode)
    if (isCustomSize) {
      const handleSize = 10;
      ctx.fillStyle = '#3b82f6';
      // Corner handles
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([px, py]) => {
        ctx.fillRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
      });
      // Edge handles
      ctx.fillRect(x + w / 2 - handleSize / 2, y - handleSize / 2, handleSize, handleSize); // top
      ctx.fillRect(x + w / 2 - handleSize / 2, y + h - handleSize / 2, handleSize, handleSize); // bottom
      ctx.fillRect(x - handleSize / 2, y + h / 2 - handleSize / 2, handleSize, handleSize); // left
      ctx.fillRect(x + w - handleSize / 2, y + h / 2 - handleSize / 2, handleSize, handleSize); // right
    }
    
  });
}

function applyCrop() {
  const targetWidth = parseInt(document.getElementById('widthInput').value) || 100;
  const targetHeight = parseInt(document.getElementById('heightInput').value) || 100;
  
  if (targetWidth <= 0 || targetHeight <= 0) return;
  
  getRotatedImage((rotatedImg) => {
    if (!rotatedImg) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    
    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw cropped portion at target size (maintains aspect ratio)
    ctx.drawImage(
      rotatedImg,
      cropBoxX, cropBoxY, cropBoxWidth, cropBoxHeight,
      0, 0, targetWidth, targetHeight
    );
    
    // Create blob and download
    canvas.toBlob((blob) => {
      if (!blob) return;
      croppedImageBlob = blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cropped-${targetWidth}x${targetHeight}.png`;
      a.click();
      URL.revokeObjectURL(url);
      
      document.getElementById('btnDownload').disabled = false;
    }, 'image/png', 0.95);
  });
}

function resizeImageWithAspect(targetWidth, targetHeight) {
  if (!originalImage) return;
  
  getRotatedImage((rotatedImg) => {
    if (!rotatedImg) return;
    
    // Get current dimensions (may be rotated)
    let currentWidth = rotatedImg.width;
    let currentHeight = rotatedImg.height;
    
    const aspectRatio = currentWidth / currentHeight;
    let finalWidth = targetWidth;
    let finalHeight = targetHeight;
    
    // Calculate dimensions to maintain aspect ratio
    if (targetWidth / targetHeight > aspectRatio) {
      finalWidth = targetHeight * aspectRatio;
    } else {
      finalHeight = targetWidth / aspectRatio;
    }
    
    // Update inputs
    document.getElementById('widthInput').value = Math.round(finalWidth);
    document.getElementById('heightInput').value = Math.round(finalHeight);
    
    resizeImage(Math.round(finalWidth), Math.round(finalHeight));
  });
}

function resizeImage(width, height) {
  if (!originalImage) return;
  
  getRotatedImage((sourceImg) => {
    if (!sourceImg) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(sourceImg, 0, 0, width, height);
    finalizeResize(canvas, width, height);
  });
}

function finalizeResize(canvas, width, height) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    resizedImageBlob = blob;
    const url = URL.createObjectURL(blob);
    document.getElementById('resizedImage').src = url;
    document.getElementById('resizedInfo').textContent = 
      `${width} × ${height}px • ${formatFileSize(blob.size)}`;
    document.getElementById('btnDownload').disabled = false;
    updateCodeSamples(width, height);
  }, 'image/png', 0.95);
}

function updateCodeSamples(width, height) {
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript (Canvas API)
function resizeImage(image, targetWidth, targetHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
}

// Usage
const img = new Image();
img.onload = () => {
  const resized = resizeImage(img, ${width}, ${height});
  // Use resized image
};
img.src = 'image.png';`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python (PIL/Pillow)
from PIL import Image

def resize_image(input_path, output_path, width, height):
    image = Image.open(input_path)
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    resized.save(output_path)
    return resized

# Usage
resize_image('input.png', 'output.png', ${width}, ${height})

# Maintain aspect ratio
def resize_keep_ratio(image, max_width, max_height):
    image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    return image`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React, { useRef } from 'react';

function ImageResizer() {
  const canvasRef = useRef(null);

  const resizeImage = (file, width, height) => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div>
      <input type="file" onChange={(e) => resizeImage(e.target.files[0], ${width}, ${height})} />
      <canvas ref={canvasRef} />
    </div>
  );
}

export default ImageResizer;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <input type="file" @change="resizeImage" />
    <canvas ref="canvasRef" />
  </div>
</template>

<script>
export default {
  data() {
    return {
      canvasRef: null
    };
  },
  methods: {
    resizeImage(event) {
      const file = event.target.files[0];
      const img = new Image();
      img.onload = () => {
        this.$refs.canvasRef.width = ${width};
        this.$refs.canvasRef.height = ${height};
        const ctx = this.$refs.canvasRef.getContext('2d');
        ctx.drawImage(img, 0, 0, ${width}, ${height});
      };
      img.src = URL.createObjectURL(file);
    }
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import UIKit

// Resize UIImage
func resizeImage(image: UIImage, targetSize: CGSize) -> UIImage? {
    let size = image.size
    let widthRatio = targetSize.width / size.width
    let heightRatio = targetSize.height / size.height
    let scaleFactor = min(widthRatio, heightRatio)
    
    let scaledWidth = size.width * scaleFactor
    let scaledHeight = size.height * scaleFactor
    
    UIGraphicsBeginImageContextWithOptions(CGSize(width: scaledWidth, height: scaledHeight), false, 0.0)
    image.draw(in: CGRect(x: 0, y: 0, width: scaledWidth, height: scaledHeight))
    let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    
    return resizedImage
}

// Usage
let originalImage = UIImage(named: "image.png")
let targetSize = CGSize(width: ${width}, height: ${height})
if let resized = resizeImage(image: originalImage!, targetSize: targetSize) {
    // Use resized image
}

// SwiftUI
import SwiftUI

struct ResizedImageView: View {
    @State private var image: UIImage?
    
    var body: some View {
        if let img = image {
            Image(uiImage: img)
                .resizable()
                .scaledToFit()
                .frame(width: ${width}, height: ${height})
        }
    }
}`;
  }
  
  if (androidCode) {
    androidCode.textContent = `import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix

// Resize Bitmap
fun resizeBitmap(bitmap: Bitmap, width: Int, height: Int): Bitmap {
    val scaleWidth = width.toFloat() / bitmap.width
    val scaleHeight = height.toFloat() / bitmap.height
    val matrix = Matrix()
    matrix.postScale(scaleWidth, scaleHeight)
    
    return Bitmap.createBitmap(
        bitmap, 0, 0,
        bitmap.width, bitmap.height,
        matrix, true
    )
}

// Usage
val originalBitmap = BitmapFactory.decodeResource(resources, R.drawable.image)
val resizedBitmap = resizeBitmap(originalBitmap, ${width}, ${height})

// Jetpack Compose
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp

@Composable
fun ResizedImage(bitmap: Bitmap) {
    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = null,
        modifier = Modifier.size(${width}.dp, ${height}.dp)
    )
}`;
  }
}

function resizerInitTool() {
  resizerApplyLang();

  // Preset buttons
  const presetButtons = document.getElementById('presetButtons');
  const t = resizerDict[resizerLang];
  
  // Add Custom Size button first
  const customBtn = document.createElement('div');
  customBtn.className = 'preset-btn';
  customBtn.id = 'customSizeBtn';
  customBtn.textContent = t.customSize;
  customBtn.setAttribute('data-tooltip', t.tooltipCustomSize);
  customBtn.setAttribute('data-tooltip-pos', 'top');
  customBtn.addEventListener('click', () => {
    // Deselect all other buttons
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
    
    // Toggle custom mode
    isCustomSize = !isCustomSize;
    customBtn.classList.toggle('selected', isCustomSize);
    
    if (isCustomSize) {
      // Enable manual input
      document.getElementById('widthInput').disabled = false;
      document.getElementById('heightInput').disabled = false;
    } else {
      // Disable manual input
      document.getElementById('widthInput').disabled = true;
      document.getElementById('heightInput').disabled = true;
    }
    
    drawCropPreview();
  });
  presetButtons.appendChild(customBtn);
  
  // Add preset buttons
  presets.forEach(preset => {
    const btn = document.createElement('div');
    btn.className = 'preset-btn';
    btn.textContent = preset.name;
    btn.setAttribute('data-tooltip', t[preset.tooltipKey]);
    btn.setAttribute('data-tooltip-pos', 'top');
    btn.addEventListener('click', () => {
      // Deselect custom mode
      isCustomSize = false;
      document.getElementById('widthInput').disabled = true;
      document.getElementById('heightInput').disabled = true;
      
      // Remove selected from all preset buttons (including custom)
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      document.getElementById('widthInput').value = preset.width;
      document.getElementById('heightInput').value = preset.height;
      updateCropBox();
      drawCropPreview(); // Redraw to hide resize handles
    });
    presetButtons.appendChild(btn);
  });
  
  // Add input change listeners to update crop box when custom size is enabled
  document.getElementById('widthInput').addEventListener('input', () => {
    if (isCustomSize) {
      updateCropBox();
    }
  });
  document.getElementById('heightInput').addEventListener('input', () => {
    if (isCustomSize) {
      updateCropBox();
    }
  });

  // Upload area
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      loadImage(file);
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      loadImage(file);
    }
  });

  // Size inputs - update crop box when changed (always maintain aspect ratio from inputs)
  document.getElementById('widthInput').addEventListener('input', () => {
    const width = parseInt(document.getElementById('widthInput').value) || 0;
    const height = parseInt(document.getElementById('heightInput').value) || 0;
    if (width > 0 && height > 0) {
      updateCropBox();
    }
  });

  document.getElementById('heightInput').addEventListener('input', () => {
    const width = parseInt(document.getElementById('widthInput').value) || 0;
    const height = parseInt(document.getElementById('heightInput').value) || 0;
    if (width > 0 && height > 0) {
      updateCropBox();
    }
  });

  // Rotate button (click to rotate 90° each time)
  document.getElementById('btnRotate').addEventListener('click', () => rotateImage(90));
  document.getElementById('btnResetRotate').addEventListener('click', resetRotation);
  
  // Update crop box button (replaces resize button)
  document.getElementById('btnResize').addEventListener('click', () => {
    updateCropBox();
  });

  document.getElementById('btnResize').addEventListener('click', () => {
    const width = parseInt(document.getElementById('widthInput').value) || 0;
    const height = parseInt(document.getElementById('heightInput').value) || 0;
    if (width > 0 && height > 0) {
      resizeImage(width, height);
    }
  });

  document.getElementById('btnDownload').addEventListener('click', () => {
    if (!croppedImageBlob) {
      // Generate cropped image if not already done
      applyCrop();
      return;
    }
    const url = URL.createObjectURL(croppedImageBlob);
    const a = document.createElement('a');
    const targetWidth = parseInt(document.getElementById('widthInput').value) || 100;
    const targetHeight = parseInt(document.getElementById('heightInput').value) || 100;
    a.href = url;
    a.download = `cropped-${targetWidth}x${targetHeight}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Code samples tabs
  function initCodeTabs() {
    const codeTabs = document.querySelectorAll('.code-tab');
    if (codeTabs.length === 0) {
      setTimeout(initCodeTabs, 100);
      return;
    }
    
    codeTabs.forEach(tab => {
      tab.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetTab = this.getAttribute('data-tab');
        if (!targetTab) return;
        
        codeTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        const codeBlocks = document.querySelectorAll('.code-block');
        codeBlocks.forEach(block => block.classList.remove('active'));
        
        const targetBlock = document.getElementById(targetTab + 'Code');
        if (targetBlock) {
          targetBlock.classList.add('active');
        }
      });
    });
  }
  
  initCodeTabs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', resizerInitTool);
} else {
  resizerInitTool();
}
