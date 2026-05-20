// Tiny PNG - Image Compressor logic & i18n

const tinyDict = {
  vi: {
    tagline: 'Nén ảnh PNG, JPG với chất lượng cao.',
    title: 'Tiny PNG',
    subtitle: 'Nén ảnh PNG, JPG với chất lượng cao.',
    uploadText: 'Kéo thả ảnh vào đây hoặc click để chọn',
    uploadHint: 'Hỗ trợ PNG, JPG, JPEG, WEBP',
    originalLabel: 'Ảnh gốc',
    compressedLabel: 'Ảnh đã nén',
    btnCompress: 'Nén ảnh',
    btnCompressMore: 'Nén tiếp',
    btnDownload: 'Tải xuống',
    statusProcessing: 'Đang xử lý...',
    statusError: 'Lỗi: Không thể xử lý ảnh.',
    statusSuccess: 'Nén thành công!',
    statusNoMoreCompression: 'Không thể nén thêm nữa.',
    fileSize: 'Kích thước',
    compressionRatio: 'Tỷ lệ nén',
    saved: 'Tiết kiệm'
  },
  en: {
    tagline: 'Compress PNG, JPG images with high quality.',
    title: 'Tiny PNG',
    subtitle: 'Compress PNG, JPG images with high quality.',
    uploadText: 'Drag & drop image here or click to select',
    uploadHint: 'Supports PNG, JPG, JPEG, WEBP',
    originalLabel: 'Original Image',
    compressedLabel: 'Compressed Image',
    btnCompress: 'Compress Image',
    btnCompressMore: 'Compress More',
    btnDownload: 'Download',
    statusProcessing: 'Processing...',
    statusError: 'Error: Could not process image.',
    statusSuccess: 'Compression successful!',
    statusNoMoreCompression: 'Cannot compress further.',
    fileSize: 'File Size',
    compressionRatio: 'Compression Ratio',
    saved: 'Saved'
  }
};

let tinyLang = 'vi';
let originalFile = null;
let compressedBlob = null;

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function tinyApplyLang() {
  const t = tinyDict[tinyLang];
  document.documentElement.lang = tinyLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('uploadText').textContent = t.uploadText;
  document.getElementById('uploadHint').textContent = t.uploadHint;
  document.getElementById('originalLabel').textContent = t.originalLabel;
  document.getElementById('compressedLabel').textContent = t.compressedLabel;
  document.getElementById('btnCompress').textContent = t.btnCompress;
  document.getElementById('btnCompressMore').textContent = t.btnCompressMore;
  document.getElementById('btnDownload').textContent = t.btnDownload;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function compressImage(file, quality = 0.8, maxWidth = 1920, maxHeight = 1920) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Draw image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Determine output format and quality
        let outputType = file.type || 'image/jpeg';
        let outputQuality = quality;
        
        // For PNG, try converting to JPEG for better compression
        // but keep PNG if file is small or user wants PNG
        if (file.type === 'image/png' && file.size > 500000) {
          // Large PNG - convert to JPEG for better compression
          outputType = 'image/jpeg';
          outputQuality = 0.85;
        } else if (file.type === 'image/png') {
          // Small PNG - keep as PNG but resize if needed
          outputType = 'image/png';
          outputQuality = undefined; // PNG doesn't use quality
        }
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          outputType,
          outputQuality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function tinySetStatus(message, isError = false, isSuccess = false) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = 'status';
  if (isError) {
    statusEl.classList.add('error');
  } else if (isSuccess) {
    statusEl.classList.add('success');
  }
  
  if (message) {
    statusEl.style.display = 'block';
  } else {
    statusEl.style.display = 'none';
  }
}

function tinyInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  tinyLang = 'vi';
  tinyApplyLang();

  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  const previewGrid = document.getElementById('previewGrid');
  const btnRow = document.getElementById('btnRow');
  const originalImage = document.getElementById('originalImage');
  const compressedImage = document.getElementById('compressedImage');
  const originalInfo = document.getElementById('originalInfo');
  const compressedInfo = document.getElementById('compressedInfo');
  const compressionInfo = document.getElementById('compressionInfo');
  const btnCompress = document.getElementById('btnCompress');
  const btnCompressMore = document.getElementById('btnCompressMore');
  const btnDownload = document.getElementById('btnDownload');

  // Upload area click
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

  // Drag and drop
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
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      tinySetStatus(tinyDict[tinyLang].statusError, true);
      return;
    }

    originalFile = file;
    compressedBlob = null;
    btnDownload.disabled = true;
    btnCompressMore.disabled = true;

    // Show original image
    const reader = new FileReader();
    reader.onload = (e) => {
      originalImage.src = e.target.result;
      originalInfo.innerHTML = `<strong>${tinyDict[tinyLang].fileSize}:</strong> ${formatFileSize(file.size)}`;
      
      previewGrid.style.display = 'grid';
      btnRow.style.display = 'flex';
      compressedImage.src = '';
      compressedInfo.textContent = '';
      compressionInfo.style.display = 'none';
      tinySetStatus('');
    };
    reader.readAsDataURL(file);
  }

  // Compress button
  btnCompress.addEventListener('click', async () => {
    if (!originalFile) return;

    btnCompress.disabled = true;
    tinySetStatus(tinyDict[tinyLang].statusProcessing);

    try {
      // Determine quality based on file type
      let quality = 0.8;
      if (originalFile.type === 'image/png') {
        quality = 0.85; // PNG will be converted to JPEG if large
      } else if (originalFile.type === 'image/jpeg' || originalFile.type === 'image/jpg') {
        quality = 0.8;
      } else {
        quality = 0.85; // Default for other formats
      }

      compressedBlob = await compressImage(originalFile, quality);
      
      // Show compressed image
      const compressedUrl = URL.createObjectURL(compressedBlob);
      compressedImage.src = compressedUrl;
      compressedInfo.innerHTML = `<strong>${tinyDict[tinyLang].fileSize}:</strong> ${formatFileSize(compressedBlob.size)}`;
      
      // Calculate compression ratio
      const originalSize = originalFile.size;
      const compressedSize = compressedBlob.size;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      const saved = originalSize - compressedSize;
      
      compressionInfo.innerHTML = `
        <strong>${tinyDict[tinyLang].compressionRatio}:</strong> ${ratio}%<br>
        <strong>${tinyDict[tinyLang].saved}:</strong> ${formatFileSize(saved)}
      `;
      compressionInfo.className = 'compression-info success';
      compressionInfo.style.display = 'block';
      
      btnDownload.disabled = false;
      btnCompressMore.disabled = false;
      tinySetStatus(tinyDict[tinyLang].statusSuccess, false, true);
    } catch (error) {
      tinySetStatus(tinyDict[tinyLang].statusError, true);
    } finally {
      btnCompress.disabled = false;
    }
  });

  // Compress more button - compress from already compressed image
  btnCompressMore.addEventListener('click', async () => {
    if (!compressedBlob) return;

    btnCompressMore.disabled = true;
    tinySetStatus(tinyDict[tinyLang].statusProcessing);

    try {
      // Create a File object from the compressed blob
      const compressedFile = new File([compressedBlob], 'compressed.jpg', { type: compressedBlob.type });
      
      // Use lower quality for further compression
      let quality = 0.7;
      if (compressedBlob.type === 'image/png') {
        quality = 0.75;
      }

      // Compress from the already compressed image
      const newCompressedBlob = await compressImage(compressedFile, quality);
      
      // Only update if we got a smaller file (at least 1% smaller)
      const sizeDiff = compressedBlob.size - newCompressedBlob.size;
      const minSizeDiff = compressedBlob.size * 0.01; // 1% minimum improvement
      
      if (sizeDiff > minSizeDiff) {
        // Revoke old URL
        if (compressedImage.src.startsWith('blob:')) {
          URL.revokeObjectURL(compressedImage.src);
        }
        
        compressedBlob = newCompressedBlob;
        
        // Show new compressed image
        const compressedUrl = URL.createObjectURL(compressedBlob);
        compressedImage.src = compressedUrl;
        compressedInfo.innerHTML = `<strong>${tinyDict[tinyLang].fileSize}:</strong> ${formatFileSize(compressedBlob.size)}`;
        
        // Calculate compression ratio from original
        const originalSize = originalFile.size;
        const compressedSize = compressedBlob.size;
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        const saved = originalSize - compressedSize;
        
        compressionInfo.innerHTML = `
          <strong>${tinyDict[tinyLang].compressionRatio}:</strong> ${ratio}%<br>
          <strong>${tinyDict[tinyLang].saved}:</strong> ${formatFileSize(saved)}
        `;
        compressionInfo.className = 'compression-info success';
        compressionInfo.style.display = 'block';
        
        tinySetStatus(tinyDict[tinyLang].statusSuccess, false, true);
      } else {
        // File size didn't decrease enough, disable further compression
        btnCompressMore.disabled = true;
        tinySetStatus(tinyDict[tinyLang].statusNoMoreCompression, false);
      }
    } catch (error) {
      tinySetStatus(tinyDict[tinyLang].statusError, true);
    } finally {
      btnCompressMore.disabled = false;
    }
  });

  // Download button
  btnDownload.addEventListener('click', () => {
    if (!compressedBlob) return;

    const url = URL.createObjectURL(compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compressed-' + originalFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tinyInitTool);
} else {
  tinyInitTool();
}
