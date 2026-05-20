// Image to Base64 Converter logic & i18n

const base64ImgDict = {
  vi: {
    tagline: 'Convert ảnh sang Base64.',
    title: 'Image to Base64',
    subtitle: 'Convert ảnh sang Base64.',
    uploadText: 'Kéo thả ảnh vào đây hoặc click để chọn',
    uploadHint: 'Hỗ trợ PNG, JPG, JPEG, WEBP',
    imageLabel: 'Ảnh preview',
    base64Label: 'Base64 String',
    btnCopy: 'Copy Base64',
    statusCopyOk: 'Đã copy Base64 vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Convert image to Base64.',
    title: 'Image to Base64',
    subtitle: 'Convert image to Base64.',
    uploadText: 'Drag & drop image here or click to select',
    uploadHint: 'Supports PNG, JPG, JPEG, WEBP',
    imageLabel: 'Image Preview',
    base64Label: 'Base64 String',
    btnCopy: 'Copy Base64',
    statusCopyOk: 'Base64 copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    codeSamplesTitle: 'Code Samples'
  }
};

let base64ImgLang = 'vi';
let currentBase64 = '';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function base64ImgApplyLang() {
  const t = base64ImgDict[base64ImgLang];
  document.documentElement.lang = base64ImgLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('uploadText').textContent = t.uploadText;
  document.getElementById('uploadHint').textContent = t.uploadHint;
  document.getElementById('imageLabel').textContent = t.imageLabel;
  document.getElementById('base64Label').textContent = t.base64Label;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function convertToBase64(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    currentBase64 = e.target.result;
    const base64String = e.target.result.split(',')[1] || e.target.result;
    
    document.getElementById('previewImage').src = e.target.result;
    document.getElementById('base64Output').value = base64String;
    document.getElementById('fileInfo').textContent = 
      `${file.name} • ${formatFileSize(file.size)}`;
    document.getElementById('base64Info').textContent = 
      `Base64 length: ${base64String.length} characters`;
    
    document.getElementById('previewGrid').style.display = 'grid';
    document.getElementById('btnRow').style.display = 'flex';
    document.getElementById('codeSamplesSection').style.display = 'block';
    
    updateCodeSamples(base64String, file.type);
  };
  reader.readAsDataURL(file);
}

function updateCodeSamples(base64String, mimeType) {
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  // Truncate for display
  const previewBase64 = base64String.length > 50 
    ? base64String.substring(0, 50) + '...' 
    : base64String;
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript
// Image to Base64
function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const base64 = await imageToBase64(e.target.files[0]);
  console.log(base64); // data:image/png;base64,${previewBase64}...
});

// Base64 to Image
function base64ToImage(base64) {
  const img = new Image();
  img.src = base64;
  return img;
}`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python
import base64
from PIL import Image
import io

# Image to Base64
def image_to_base64(image_path):
    with open(image_path, 'rb') as image_file:
        encoded = base64.b64encode(image_file.read()).decode('utf-8')
        return f"data:image/png;base64,{encoded}"

# Base64 to Image
def base64_to_image(base64_string):
    # Remove data URL prefix if present
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    image_data = base64.b64decode(base64_string)
    image = Image.open(io.BytesIO(image_data))
    return image

# Usage
base64_str = image_to_base64('image.png')
image = base64_to_image(base64_str)
image.save('output.png')`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React, { useState } from 'react';

function ImageBase64() {
  const [base64, setBase64] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} />
      {base64 && <img src={base64} alt="Preview" />}
      <textarea value={base64} readOnly />
    </div>
  );
}

export default ImageBase64;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <img v-if="base64" :src="base64" alt="Preview" />
    <textarea v-model="base64" readonly />
  </div>
</template>

<script>
export default {
  data() {
    return {
      base64: ''
    };
  },
  methods: {
    handleFileChange(event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          this.base64 = reader.result;
        };
        reader.readAsDataURL(file);
      }
    }
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import UIKit
import Foundation

// Base64 to UIImage
let base64String = "${previewBase64}"
guard let imageData = Data(base64Encoded: base64String) else {
    print("Invalid base64 string")
    return
}
let image = UIImage(data: imageData)

// UIImage to Base64
func imageToBase64(image: UIImage, format: ImageFormat = .png) -> String? {
    var imageData: Data?
    switch format {
    case .png:
        imageData = image.pngData()
    case .jpeg(let quality):
        imageData = image.jpegData(compressionQuality: quality)
    }
    return imageData?.base64EncodedString()
}

enum ImageFormat {
    case png
    case jpeg(quality: CGFloat)
}

// Usage
if let base64 = imageToBase64(image: myImage) {
    print("Base64: \\(base64)")
}

// SwiftUI
import SwiftUI

struct Base64ImageView: View {
    let base64String: String
    
    var body: some View {
        if let data = Data(base64Encoded: base64String),
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
        }
    }
}`;
  }
  
  if (androidCode) {
    androidCode.textContent = `import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import java.io.ByteArrayOutputStream

// Base64 to Bitmap
val base64String = "${previewBase64}"
val imageBytes = Base64.decode(base64String, Base64.DEFAULT)
val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)

// Bitmap to Base64
fun bitmapToBase64(bitmap: Bitmap, format: Bitmap.CompressFormat = Bitmap.CompressFormat.PNG): String {
    val outputStream = ByteArrayOutputStream()
    bitmap.compress(format, 100, outputStream)
    val byteArray = outputStream.toByteArray()
    return Base64.encodeToString(byteArray, Base64.NO_WRAP)
}

// Usage
val base64 = bitmapToBase64(myBitmap)
println("Base64: \$base64")

// Jetpack Compose
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale

@Composable
fun Base64Image(base64String: String) {
    val imageBytes = Base64.decode(base64String, Base64.DEFAULT)
    val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
    
    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = null,
        modifier = Modifier.fillMaxSize(),
        contentScale = ContentScale.Fit
    )
}`;
  }
}

function base64ImgInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  base64ImgLang = 'vi';
  base64ImgApplyLang();

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
      convertToBase64(file);
    }
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      convertToBase64(file);
    }
  });

  document.getElementById('btnCopy').addEventListener('click', () => {
    const base64String = document.getElementById('base64Output').value;
    if (!base64String) return;
    
    navigator.clipboard.writeText(base64String).then(
      () => {
        const btn = document.getElementById('btnCopy');
        const originalText = btn.textContent;
        btn.textContent = base64ImgDict[base64ImgLang].statusCopyOk;
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      },
      () => {
        const btn = document.getElementById('btnCopy');
        const originalText = btn.textContent;
        btn.textContent = base64ImgDict[base64ImgLang].statusCopyFail;
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    );
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
  document.addEventListener('DOMContentLoaded', base64ImgInitTool);
} else {
  base64ImgInitTool();
}
