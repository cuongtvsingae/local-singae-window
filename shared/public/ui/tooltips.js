// Tooltip utility - Auto-add tooltips to buttons
(function() {
  'use strict';
  
  // Button tooltip mappings - maps button IDs to tooltip keys
  const buttonTooltips = {
    // Common buttons
    'btnCopy': { vi: 'Sao chép', en: 'Copy' },
    'btnDownload': { vi: 'Tải xuống', en: 'Download' },
    'btnGenerate': { vi: 'Tạo mới', en: 'Generate' },
    'btnFormat': { vi: 'Format JSON', en: 'Format JSON' },
    'btnMinify': { vi: 'Minify JSON', en: 'Minify JSON' },
    'btnEncode': { vi: 'Encode Base64', en: 'Encode Base64' },
    'btnDecode': { vi: 'Decode Base64', en: 'Decode Base64' },
    'btnConvert': { vi: 'Chuyển đổi', en: 'Convert' },
    'btnCompress': { vi: 'Nén ảnh', en: 'Compress Image' },
    'btnCompressMore': { vi: 'Nén tiếp', en: 'Compress More' },
    'btnResize': { vi: 'Cập nhật Crop Box', en: 'Update Crop Box' },
    'btnApplyCrop': { vi: 'Crop & Download', en: 'Crop & Download' },
    'btnCopyPalette': { vi: 'Sao chép Palette', en: 'Copy Palette' },
    'btnCopySwift': { vi: 'Copy Swift Code', en: 'Copy Swift Code' },
    'btnCopyAndroid': { vi: 'Copy Android Code', en: 'Copy Android Code' },
    'btnGenerateMultiple': { vi: 'Tạo nhiều UUID', en: 'Generate Multiple' },
    'btnRotate90': { vi: 'Xoay 90°', en: 'Rotate 90°' },
    'btnRotate180': { vi: 'Xoay 180°', en: 'Rotate 180°' },
    'btnRotate270': { vi: 'Xoay 270°', en: 'Rotate 270°' },
    'btnResetRotate': { vi: 'Reset xoay', en: 'Reset Rotation' },
    'btnLoadData': { vi: 'Tải dữ liệu từ URL hoặc file', en: 'Load data from URL or file' },
    'btnLoadUrl': { vi: 'Tải từ URL', en: 'Load from URL' },
    'btnUploadFile': { vi: 'Tải từ file', en: 'Load from File' }
  };
  
  function initTooltips() {
    const lang = 'vi';
    
    // Add tooltips to buttons
    Object.keys(buttonTooltips).forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn && buttonTooltips[btnId]) {
        const tooltip = buttonTooltips[btnId][lang] || buttonTooltips[btnId]['en'];
        if (tooltip) {
          btn.setAttribute('data-tooltip', tooltip);
          btn.setAttribute('data-tooltip-pos', 'top');
        }
      }
    });
    
    // Add tooltips to code tabs
    document.querySelectorAll('.code-tab').forEach(tab => {
      const tabName = tab.textContent.trim();
      const tooltips = {
        'JavaScript': { vi: 'JavaScript code sample', en: 'JavaScript code sample' },
        'Python': { vi: 'Python code sample', en: 'Python code sample' },
        'React': { vi: 'React code sample', en: 'React code sample' },
        'Vue': { vi: 'Vue.js code sample', en: 'Vue.js code sample' },
        'Swift': { vi: 'Swift code sample', en: 'Swift code sample' },
        'Android': { vi: 'Android code sample', en: 'Android code sample' }
      };
      if (tooltips[tabName]) {
        const tooltip = tooltips[tabName][lang] || tooltips[tabName]['en'];
        tab.setAttribute('data-tooltip', tooltip);
        tab.setAttribute('data-tooltip-pos', 'top');
      }
    });
  }
  
  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTooltips);
  } else {
    initTooltips();
  }
  
  // Export for manual initialization
  window.initTooltips = initTooltips;
})();
