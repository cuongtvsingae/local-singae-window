// UUID Generator logic & i18n

const uuidDict = {
  vi: {
    tagline: 'Tạo UUID/GUID.',
    title: 'UUID Generator',
    subtitle: 'Tạo UUID/GUID.',
    outputLabel: 'UUID',
    btnGenerate: 'Tạo UUID',
    btnCopy: 'Copy',
    btnGenerateMultiple: 'Tạo 5 UUID',
    statusCopyOk: 'Đã copy UUID vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Generate UUID/GUID.',
    title: 'UUID Generator',
    subtitle: 'Generate UUID/GUID.',
    outputLabel: 'UUID',
    btnGenerate: 'Generate UUID',
    btnCopy: 'Copy',
    btnGenerateMultiple: 'Generate 5 UUIDs',
    statusCopyOk: 'UUID copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    codeSamplesTitle: 'Code Samples'
  }
};

let uuidLang = 'vi';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function uuidApplyLang() {
  const t = uuidDict[uuidLang];
  document.documentElement.lang = uuidLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('outputLabel').textContent = t.outputLabel;
  document.getElementById('btnGenerate').textContent = t.btnGenerate;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('btnGenerateMultiple').textContent = t.btnGenerateMultiple;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  uuidUpdateCodeSamples();
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function uuidUpdateCodeSamples() {
  const uuid = document.getElementById('uuidOutput').value || generateUUID();
  
  const jsCode = document.querySelector('#javascriptCode code');
  if (jsCode) {
    jsCode.textContent = `// JavaScript (Browser)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const uuid = generateUUID();
console.log(uuid); // e.g., "${uuid}"

// Using crypto.randomUUID() (modern browsers)
const uuid2 = crypto.randomUUID();
console.log(uuid2);

// Node.js
const { randomUUID } = require('crypto');
const uuid3 = randomUUID();
console.log(uuid3);`;
  }
  
  const pythonCode = document.querySelector('#pythonCode code');
  if (pythonCode) {
    pythonCode.textContent = `# Python
import uuid

# Generate UUID
uuid_str = str(uuid.uuid4())
print(uuid_str)  # e.g., "${uuid}"

# UUID from string
uuid_obj = uuid.UUID("${uuid}")
print(uuid_obj)

# Different UUID versions
uuid1 = uuid.uuid1()  # Based on MAC address and timestamp
uuid4 = uuid.uuid4()  # Random UUID (most common)
uuid5 = uuid.uuid5(uuid.NAMESPACE_DNS, 'example.com')

print(f"UUID1: {uuid1}")
print(f"UUID4: {uuid4}")
print(f"UUID5: {uuid5}")`;
  }
  
  const reactCode = document.querySelector('#reactCode code');
  if (reactCode) {
    reactCode.textContent = `// React
import React, { useState } from 'react';

function UUIDGenerator() {
  const [uuid, setUuid] = useState('');

  const generateUUID = () => {
    const newUUID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    setUuid(newUUID);
  };

  return (
    <div>
      <button onClick={generateUUID}>Generate UUID</button>
      <p>{uuid || '${uuid}'}</p>
    </div>
  );
}

export default UUIDGenerator;`;
  }
  
  const vueCode = document.querySelector('#vueCode code');
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <button @click="generateUUID">Generate UUID</button>
    <p>{{ uuid || '${uuid}' }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      uuid: ''
    };
  },
  methods: {
    generateUUID() {
      this.uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }
};
</script>`;
  }
  
  const swiftCode = document.querySelector('#swiftCode code');
  if (swiftCode) {
    swiftCode.textContent = `import Foundation

// Generate UUID
let uuid = UUID()
print(uuid.uuidString) // e.g., "${uuid}"

// Convert String to UUID
if let uuid = UUID(uuidString: "${uuid}") {
    print("Valid UUID: \\(uuid)")
}

// UUID in SwiftUI
import SwiftUI

struct ContentView: View {
    @State private var uuid = UUID()
    
    var body: some View {
        VStack {
            Text(uuid.uuidString)
                .font(.system(.body, design: .monospaced))
            Button("Generate New") {
                uuid = UUID()
            }
        }
    }
}`;
  }
  
  const androidCode = document.querySelector('#androidCode code');
  if (androidCode) {
    androidCode.textContent = `import java.util.UUID

// Generate UUID
val uuid = UUID.randomUUID()
println(uuid.toString()) // e.g., "${uuid}"

// Convert String to UUID
val uuidString = "${uuid}"
val uuid = UUID.fromString(uuidString)

// UUID in Android Activity
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.UUID

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        val uuidTextView: TextView = findViewById(R.id.uuidTextView)
        val uuid = UUID.randomUUID()
        uuidTextView.text = uuid.toString()
    }
}

// UUID in Jetpack Compose
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.util.UUID

@Composable
fun UUIDScreen() {
    var uuid by remember { mutableStateOf(UUID.randomUUID()) }
    
    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            text = uuid.toString(),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.fillMaxWidth()
        )
        Button(onClick = { uuid = UUID.randomUUID() }) {
            Text("Generate New")
        }
    }
}`;
  }
}

function uuidInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  uuidLang = 'vi';
  uuidApplyLang();

  const uuidOutput = document.getElementById('uuidOutput');
  const btnGenerate = document.getElementById('btnGenerate');
  const btnCopy = document.getElementById('btnCopy');
  const btnGenerateMultiple = document.getElementById('btnGenerateMultiple');

  btnGenerate.addEventListener('click', () => {
    const uuid = generateUUID();
    uuidOutput.value = uuid;
    uuidUpdateCodeSamples();
  });

  btnGenerateMultiple.addEventListener('click', () => {
    const uuids = Array.from({ length: 5 }, () => generateUUID());
    uuidOutput.value = uuids.join('\n');
    uuidUpdateCodeSamples();
  });

  btnCopy.addEventListener('click', () => {
    const text = uuidOutput.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(
      () => {
        const originalText = btnCopy.textContent;
        btnCopy.textContent = uuidDict[uuidLang].statusCopyOk;
        setTimeout(() => {
          btnCopy.textContent = originalText;
        }, 2000);
      },
      () => {
        const originalText = btnCopy.textContent;
        btnCopy.textContent = uuidDict[uuidLang].statusCopyFail;
        setTimeout(() => {
          btnCopy.textContent = originalText;
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
        } else {
          // Fallback for camelCase to kebab-case
          const kebabTab = targetTab.replace(/([A-Z])/g, '-$1').toLowerCase();
          const fallbackBlock = document.getElementById(kebabTab + '-code');
          if (fallbackBlock) {
            fallbackBlock.classList.add('active');
          }
        }
      });
    });
  }
  
  initCodeTabs();

  // Generate initial UUID
  btnGenerate.click();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', uuidInitTool);
} else {
  uuidInitTool();
}
