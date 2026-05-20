// Base64 Encoder/Decoder logic & i18n

const b64Dict = {
  vi: {
    tagline: 'Encode và decode Base64 cho text và data.',
    title: 'Base64 Encoder/Decoder',
    subtitle: 'Mã hóa và giải mã Base64 cho văn bản và dữ liệu.',
    inputLabel: 'Input',
    outputLabel: 'Output',
    inputPlaceholder: 'Nhập text hoặc Base64 string...',
    outputPlaceholder: 'Kết quả sẽ hiển thị ở đây...',
    btnEncode: 'Encode',
    btnDecode: 'Decode',
    btnCopy: 'Copy output',
    statusEncodeOk: 'Đã encode thành công.',
    statusDecodeOk: 'Đã decode thành công.',
    statusCopyOk: 'Đã copy vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    statusDecodeError: 'Lỗi: Base64 string không hợp lệ.',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Encode and decode Base64 for text and data.',
    title: 'Base64 Encoder/Decoder',
    subtitle: 'Encode and decode Base64 for text and data.',
    inputLabel: 'Input',
    outputLabel: 'Output',
    inputPlaceholder: 'Enter text or Base64 string...',
    outputPlaceholder: 'Result will appear here...',
    btnEncode: 'Encode',
    btnDecode: 'Decode',
    btnCopy: 'Copy output',
    statusEncodeOk: 'Encoded successfully.',
    statusDecodeOk: 'Decoded successfully.',
    statusCopyOk: 'Copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    statusDecodeError: 'Error: Invalid Base64 string.',
    codeSamplesTitle: 'Code Samples'
  }
};

let b64Lang = 'vi';

function b64ApplyLang() {
  const t = b64Dict[b64Lang];
  document.documentElement.lang = b64Lang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('inputLabel').textContent = t.inputLabel;
  document.getElementById('outputLabel').textContent = t.outputLabel;
  document.getElementById('input').placeholder = t.inputPlaceholder;
  document.getElementById('output').placeholder = t.outputPlaceholder;
  document.getElementById('btnEncode').textContent = t.btnEncode;
  document.getElementById('btnDecode').textContent = t.btnDecode;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  const langLabelEl = document.getElementById('langLabel');
  if (langLabelEl) {
    langLabelEl.textContent = b64Lang === 'vi' ? 'VI' : 'EN';
  }
  b64UpdateCodeSamples();
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function b64SetStatus(msg, ok) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + (ok ? 'status-ok' : 'status-error');
  el.style.display = 'block';
  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function b64Encode() {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const text = input.value.trim();
  
  if (!text) {
    output.value = '';
    b64UpdateCodeSamples();
    return;
  }
  
  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    output.value = encoded;
    b64SetStatus(b64Dict[b64Lang].statusEncodeOk, true);
    b64UpdateCodeSamples();
  } catch (e) {
    output.value = '';
    b64SetStatus('Error: ' + e.message, false);
    b64UpdateCodeSamples();
  }
}

function b64Decode() {
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const text = input.value.trim();
  
  if (!text) {
    output.value = '';
    b64UpdateCodeSamples();
    return;
  }
  
  try {
    // Remove whitespace
    const clean = text.replace(/\s/g, '');
    const decoded = decodeURIComponent(escape(atob(clean)));
    output.value = decoded;
    b64SetStatus(b64Dict[b64Lang].statusDecodeOk, true);
    b64UpdateCodeSamples();
  } catch (e) {
    output.value = '';
    b64SetStatus(b64Dict[b64Lang].statusDecodeError, false);
    b64UpdateCodeSamples();
  }
}

function b64Copy() {
  const output = document.getElementById('output');
  const text = output.value;
  
  if (!text) {
    b64SetStatus('No output to copy', false);
    return;
  }
  
  navigator.clipboard.writeText(text).then(
    () => {
      b64SetStatus(b64Dict[b64Lang].statusCopyOk, true);
    },
    () => {
      b64SetStatus(b64Dict[b64Lang].statusCopyFail, false);
    }
  );
}

function b64UpdateCodeSamples() {
  const input = document.getElementById('input').value.trim();
  const output = document.getElementById('output').value.trim();
  
  let decoded = 'Hello World';
  let encoded = '';
  
  if (output) {
    try {
      const clean = output.replace(/\s/g, '');
      decoded = decodeURIComponent(escape(atob(clean)));
      encoded = output;
    } catch (e) {
      decoded = input || 'Hello World';
      encoded = btoa(unescape(encodeURIComponent(decoded)));
    }
  } else if (input) {
    decoded = input;
    encoded = btoa(unescape(encodeURIComponent(decoded)));
  } else {
    encoded = btoa(unescape(encodeURIComponent(decoded)));
  }
  
  // Escape quotes for code display
  const decodedEscaped = decoded.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const encodedEscaped = encoded.replace(/"/g, '\\"');
  
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript
// Encode to Base64
const text = "${decodedEscaped}";
const encoded = btoa(unescape(encodeURIComponent(text)));
console.log(encoded); // "${encodedEscaped}"

// Decode from Base64
const decoded = decodeURIComponent(escape(atob("${encodedEscaped}")));
console.log(decoded); // "${decodedEscaped}"

// Node.js
const Buffer = require('buffer').Buffer;
const encoded2 = Buffer.from(text).toString('base64');
const decoded2 = Buffer.from(encoded2, 'base64').toString('utf8');`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python
import base64

# Encode to Base64
text = "${decodedEscaped}"
encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
print(encoded)  # "${encodedEscaped}"

# Decode from Base64
decoded = base64.b64decode("${encodedEscaped}").decode('utf-8')
print(decoded)  # "${decodedEscaped}"

# With error handling
try:
    encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
except Exception as e:
    print(f"Error: {e}")`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React, { useState } from 'react';

function Base64Converter() {
  const [text, setText] = useState('${decodedEscaped}');
  const [encoded, setEncoded] = useState('${encodedEscaped}');

  const encode = () => {
    const result = btoa(unescape(encodeURIComponent(text)));
    setEncoded(result);
  };

  const decode = () => {
    try {
      const result = decodeURIComponent(escape(atob(encoded)));
      setText(result);
    } catch (e) {
      console.error('Invalid Base64');
    }
  };

  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={encode}>Encode</button>
      <button onClick={decode}>Decode</button>
      <textarea value={encoded} onChange={(e) => setEncoded(e.target.value)} />
    </div>
  );
}

export default Base64Converter;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <textarea v-model="text" />
    <button @click="encode">Encode</button>
    <button @click="decode">Decode</button>
    <textarea v-model="encoded" />
  </div>
</template>

<script>
export default {
  data() {
    return {
      text: '${decodedEscaped}',
      encoded: '${encodedEscaped}'
    };
  },
  methods: {
    encode() {
      this.encoded = btoa(unescape(encodeURIComponent(this.text)));
    },
    decode() {
      try {
        this.text = decodeURIComponent(escape(atob(this.encoded)));
      } catch (e) {
        console.error('Invalid Base64');
      }
    }
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import Foundation

// Encode to Base64
let text = "${decodedEscaped}"
let data = text.data(using: .utf8)!
let base64String = data.base64EncodedString()
print(base64String) // "${encodedEscaped}"

// Decode from Base64
if let base64Data = Data(base64Encoded: "${encodedEscaped}") {
    if let decodedString = String(data: base64Data, encoding: .utf8) {
        print(decodedString) // "${decodedEscaped}"
    }
}`;
  }
  
  if (androidCode) {
    androidCode.textContent = `import android.util.Base64
import java.nio.charset.StandardCharsets

// Encode to Base64
val text = "${decodedEscaped}"
val bytes = text.toByteArray(StandardCharsets.UTF_8)
val base64String = Base64.encodeToString(bytes, Base64.NO_WRAP)
println(base64String) // "${encodedEscaped}"

// Decode from Base64
val base64Bytes = Base64.decode("${encodedEscaped}", Base64.NO_WRAP)
val decodedString = String(base64Bytes, StandardCharsets.UTF_8)
println(decodedString) // "${decodedEscaped}"

// Kotlin (using java.util.Base64)
import java.util.Base64

val encoder = Base64.getEncoder()
val decoder = Base64.getDecoder()

val encoded = encoder.encodeToString(text.toByteArray())
val decoded = String(decoder.decode(encoded))`;
  }
}

function b64InitTool() {
  // Luôn dùng tiếng Việt, bỏ hẳn logic đổi ngôn ngữ
  b64Lang = 'vi';
  b64ApplyLang();
  document.getElementById('btnEncode').addEventListener('click', b64Encode);
  document.getElementById('btnDecode').addEventListener('click', b64Decode);
  document.getElementById('btnCopy').addEventListener('click', b64Copy);

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
  b64UpdateCodeSamples();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', b64InitTool);
} else {
  b64InitTool();
}
