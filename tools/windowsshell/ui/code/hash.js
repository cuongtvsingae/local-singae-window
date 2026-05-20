// Hash Generator logic & i18n

const hashDict = {
  vi: {
    tagline: 'Tạo hash MD5, SHA-1, SHA-256 cho text.',
    title: 'Hash Generator',
    subtitle: 'Tạo hash MD5, SHA-1, SHA-256 cho văn bản.',
    inputLabel: 'Input',
    inputPlaceholder: 'Nhập text để tạo hash...',
    btnGenerate: 'Generate Hash',
    md5: 'MD5',
    sha1: 'SHA-1',
    sha256: 'SHA-256',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Generate MD5, SHA-1, SHA-256 hashes for text.',
    title: 'Hash Generator',
    subtitle: 'Generate MD5, SHA-1, SHA-256 hashes for text.',
    inputLabel: 'Input',
    inputPlaceholder: 'Enter text to generate hash...',
    btnGenerate: 'Generate Hash',
    md5: 'MD5',
    sha1: 'SHA-1',
    sha256: 'SHA-256',
    codeSamplesTitle: 'Code Samples'
  }
};

let hashLang = 'vi';

function hashApplyLang() {
  const t = hashDict[hashLang];
  document.documentElement.lang = hashLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('inputLabel').textContent = t.inputLabel;
  document.getElementById('input').placeholder = t.inputPlaceholder;
  document.getElementById('btnGenerate').textContent = t.btnGenerate;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  const langLabelEl = document.getElementById('langLabel');
  if (langLabelEl) {
    langLabelEl.textContent = hashLang === 'vi' ? 'VI' : 'EN';
  }
  hashUpdateCodeSamples();
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function hashGenerate() {
  const input = document.getElementById('input');
  const results = document.getElementById('hashResults');
  const text = input.value.trim();
  
  if (!text) {
    results.innerHTML = '';
    hashUpdateCodeSamples();
    return;
  }
  
  try {
    const md5 = CryptoJS.MD5(text).toString();
    const sha1 = CryptoJS.SHA1(text).toString();
    const sha256 = CryptoJS.SHA256(text).toString();
    
    const t = hashDict[hashLang];
    
    results.innerHTML = `
      <div class="hash-item">
        <div class="hash-item-label">${t.md5}</div>
        <div class="hash-item-value" onclick="hashCopy('${md5}')">${md5}</div>
      </div>
      <div class="hash-item">
        <div class="hash-item-label">${t.sha1}</div>
        <div class="hash-item-value" onclick="hashCopy('${sha1}')">${sha1}</div>
      </div>
      <div class="hash-item">
        <div class="hash-item-label">${t.sha256}</div>
        <div class="hash-item-value" onclick="hashCopy('${sha256}')">${sha256}</div>
      </div>
    `;
    
    hashUpdateCodeSamples(text, md5, sha1, sha256);
  } catch (e) {
    results.innerHTML = '<div style="color: #fca5a5;">Error generating hash</div>';
    hashUpdateCodeSamples();
  }
}

function hashUpdateCodeSamples(input = '', md5 = '', sha1 = '', sha256 = '') {
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  const inputEscaped = (input || 'Hello World').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript (using crypto-js)
import CryptoJS from 'crypto-js';

const text = "${inputEscaped}";

// MD5
const md5 = CryptoJS.MD5(text).toString();
console.log("MD5:", md5); // "${md5 || ''}"

// SHA-1
const sha1 = CryptoJS.SHA1(text).toString();
console.log("SHA-1:", sha1); // "${sha1 || ''}"

// SHA-256
const sha256 = CryptoJS.SHA256(text).toString();
console.log("SHA-256:", sha256); // "${sha256 || ''}"

// Node.js (built-in crypto)
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(text).digest('hex');`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python
import hashlib

text = "${inputEscaped}"

# MD5
md5 = hashlib.md5(text.encode()).hexdigest()
print(f"MD5: {md5}")  # "${md5 || ''}"

# SHA-1
sha1 = hashlib.sha1(text.encode()).hexdigest()
print(f"SHA-1: {sha1}")  # "${sha1 || ''}"

# SHA-256
sha256 = hashlib.sha256(text.encode()).hexdigest()
print(f"SHA-256: {sha256}")  # "${sha256 || ''}"

# SHA-512
sha512 = hashlib.sha512(text.encode()).hexdigest()
print(f"SHA-512: {sha512}")`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React, { useState } from 'react';
import CryptoJS from 'crypto-js';

function HashGenerator() {
  const [text, setText] = useState('${inputEscaped}');
  const [hashes, setHashes] = useState({});

  const generateHashes = () => {
    setHashes({
      md5: CryptoJS.MD5(text).toString(),
      sha1: CryptoJS.SHA1(text).toString(),
      sha256: CryptoJS.SHA256(text).toString()
    });
  };

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={generateHashes}>Generate</button>
      <p>MD5: {hashes.md5}</p>
      <p>SHA-1: {hashes.sha1}</p>
      <p>SHA-256: {hashes.sha256}</p>
    </div>
  );
}

export default HashGenerator;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <input v-model="text" />
    <button @click="generateHashes">Generate</button>
    <p>MD5: {{ hashes.md5 }}</p>
    <p>SHA-1: {{ hashes.sha1 }}</p>
    <p>SHA-256: {{ hashes.sha256 }}</p>
  </div>
</template>

<script>
import CryptoJS from 'crypto-js';

export default {
  data() {
    return {
      text: '${inputEscaped}',
      hashes: {}
    };
  },
  methods: {
    generateHashes() {
      this.hashes = {
        md5: CryptoJS.MD5(this.text).toString(),
        sha1: CryptoJS.SHA1(this.text).toString(),
        sha256: CryptoJS.SHA256(this.text).toString()
      };
    }
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import CryptoKit
import Foundation

let text = "${inputEscaped}"
let data = text.data(using: .utf8)!

// SHA-1
let sha1 = Insecure.SHA1.hash(data: data)
let sha1Hex = sha1.map { String(format: "%02x", $0) }.joined()
print("SHA-1: \\(sha1Hex)") // "${sha1 || ''}"

// SHA-256
let sha256 = SHA256.hash(data: data)
let sha256Hex = sha256.map { String(format: "%02x", $0) }.joined()
print("SHA-256: \\(sha256Hex)") // "${sha256 || ''}"

// MD5 (requires CommonCrypto)
import CommonCrypto

func MD5(string: String) -> String {
    let length = Int(CC_MD5_DIGEST_LENGTH)
    var digest = [UInt8](repeating: 0, count: length)
    if let d = string.data(using: String.Encoding.utf8) {
        _ = d.withUnsafeBytes { (body: UnsafePointer<UInt8>) in
            CC_MD5(body, CC_LONG(d.count), &digest)
        }
    }
    return (0..<length).reduce("") {
        $0 + String(format: "%02x", digest[$1])
    }
}
print("MD5: \\(MD5(string: text))") // "${md5 || ''}"`;
  }
  
  if (androidCode) {
    androidCode.textContent = `import java.security.MessageDigest
import java.security.NoSuchAlgorithmException

val text = "${inputEscaped}"
val bytes = text.toByteArray()

// MD5
fun md5(input: String): String {
    val md = MessageDigest.getInstance("MD5")
    val digest = md.digest(input.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}
println("MD5: \${md5(text)}") // "${md5 || ''}"

// SHA-1
fun sha1(input: String): String {
    val md = MessageDigest.getInstance("SHA-1")
    val digest = md.digest(input.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}
println("SHA-1: \${sha1(text)}") // "${sha1 || ''}"

// SHA-256
fun sha256(input: String): String {
    val md = MessageDigest.getInstance("SHA-256")
    val digest = md.digest(input.toByteArray())
    return digest.joinToString("") { "%02x".format(it) }
}
println("SHA-256: \${sha256(text)}") // "${sha256 || ''}"`;
  }
}

function hashCopy(text) {
  navigator.clipboard.writeText(text).then(
    () => {
      // Visual feedback
      const btn = document.getElementById('btnGenerate');
      const originalText = btn.textContent;
      btn.textContent = hashLang === 'vi' ? 'Đã copy!' : 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1500);
    },
    () => {}
  );
}

// Make hashCopy available globally
window.hashCopy = hashCopy;

function hashInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  hashLang = 'vi';
  hashApplyLang();

  document.getElementById('btnGenerate').addEventListener('click', hashGenerate);
  
  // Auto-generate on input change
  let debounceTimer;
  document.getElementById('input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      hashGenerate();
    }, 300);
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
  hashUpdateCodeSamples();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hashInitTool);
} else {
  hashInitTool();
}
