// JSON to Model Converter logic & i18n

const modelDict = {
  vi: {
    tagline: 'Convert JSON thành Swift struct và Kotlin data class.',
    title: 'JSON to Model',
    subtitle: 'Convert JSON thành Swift struct và Kotlin data class.',
    inputLabel: 'JSON Input',
    outputLabel: 'Model Output',
    btnConvert: 'Convert',
    btnCopy: 'Copy',
    statusCopyOk: 'Đã copy model vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    statusError: 'Lỗi: JSON không hợp lệ.',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Convert JSON to Swift struct and Kotlin data class.',
    title: 'JSON to Model',
    subtitle: 'Convert JSON to Swift struct and Kotlin data class.',
    inputLabel: 'JSON Input',
    outputLabel: 'Model Output',
    btnConvert: 'Convert',
    btnCopy: 'Copy',
    statusCopyOk: 'Model copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    statusError: 'Error: Invalid JSON.',
    codeSamplesTitle: 'Code Samples'
  }
};

let modelLang = 'vi';

function toPascalCase(str) {
  return str.replace(/(?:^|_)([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/_/g, '');
}

function toCamelCase(str) {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function swiftType(value) {
  if (value === null) return 'String?';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Int' : 'Double';
  }
  if (typeof value === 'boolean') return 'Bool';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[Any]';
    return '[' + swiftType(value[0]) + ']';
  }
  if (typeof value === 'object') return 'CustomType';
  return 'Any';
}

function kotlinType(value) {
  if (value === null) return 'String?';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'Int' : 'Double';
  }
  if (typeof value === 'boolean') return 'Boolean';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'List<Any>';
    return 'List<' + kotlinType(value[0]) + '>';
  }
  if (typeof value === 'object') return 'CustomType';
  return 'Any';
}

function generateSwiftModel(obj, className = 'Model', indent = 0) {
  const indentStr = '    '.repeat(indent);
  let code = indentStr + `struct ${className}: Codable {\n`;
  
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = swiftType(value);
    const optional = value === null ? '?' : '';
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nestedClass = toPascalCase(key);
      code += indentStr + `    let ${propName}: ${nestedClass}${optional}\n`;
    } else {
      code += indentStr + `    let ${propName}: ${type}${optional}\n`;
    }
  }
  
  code += indentStr + '}';
  return code;
}

function generateKotlinModel(obj, className = 'Model', indent = 0) {
  const indentStr = '    '.repeat(indent);
  let code = indentStr + `data class ${className}(\n`;
  
  const props = [];
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = kotlinType(value);
    const optional = value === null ? '?' : '';
    props.push(indentStr + `    val ${propName}: ${type}${optional}`);
  }
  
  code += props.join(',\n') + '\n';
  code += indentStr + ')';
  return code;
}

function generateJavaScriptModel(obj, className = 'Model') {
  let code = `// JavaScript/TypeScript\n`;
  code += `interface ${className} {\n`;
  
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = value === null ? 'string | null' : 
                 typeof value === 'string' ? 'string' :
                 typeof value === 'number' ? 'number' :
                 typeof value === 'boolean' ? 'boolean' :
                 Array.isArray(value) ? 'any[]' : 'object';
    code += `  ${propName}: ${type};\n`;
  }
  
  code += `}\n\n`;
  code += `// Usage\n`;
  code += `const data: ${className} = ${JSON.stringify(obj, null, 2)};`;
  return code;
}

function generatePythonModel(obj, className = 'Model') {
  let code = `# Python (using dataclasses)\n`;
  code += `from dataclasses import dataclass\n`;
  code += `from typing import Optional, List, Any\n\n`;
  code += `@dataclass\n`;
  code += `class ${className}:\n`;
  
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = value === null ? 'Optional[str]' :
                 typeof value === 'string' ? 'str' :
                 typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') :
                 typeof value === 'boolean' ? 'bool' :
                 Array.isArray(value) ? 'List[Any]' : 'dict';
    code += `    ${propName}: ${type}\n`;
  }
  
  code += `\n# Usage\n`;
  code += `data = ${className}(\n`;
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const val = typeof value === 'string' ? `"${value}"` : value;
    code += `    ${propName}=${val},\n`;
  }
  code += `)`;
  return code;
}

function generateReactModel(obj, className = 'Model') {
  let code = `// React with TypeScript\n`;
  code += `interface ${className} {\n`;
  
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = value === null ? 'string | null' : 
                 typeof value === 'string' ? 'string' :
                 typeof value === 'number' ? 'number' :
                 typeof value === 'boolean' ? 'boolean' :
                 Array.isArray(value) ? 'any[]' : 'object';
    code += `  ${propName}: ${type};\n`;
  }
  
  code += `}\n\n`;
  code += `// React Component\n`;
  code += `import React from 'react';\n\n`;
  code += `interface Props {\n`;
  code += `  data: ${className};\n`;
  code += `}\n\n`;
  code += `const ${className}Component: React.FC<Props> = ({ data }) => {\n`;
  code += `  return (\n`;
  code += `    <div>\n`;
  for (const [key] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    code += `      <p>{data.${propName}}</p>\n`;
  }
  code += `    </div>\n`;
  code += `  );\n`;
  code += `};\n\n`;
  code += `export default ${className}Component;`;
  return code;
}

function generateVueModel(obj, className = 'Model') {
  let code = `// Vue.js with TypeScript\n`;
  code += `interface ${className} {\n`;
  
  for (const [key, value] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    const type = value === null ? 'string | null' : 
                 typeof value === 'string' ? 'string' :
                 typeof value === 'number' ? 'number' :
                 typeof value === 'boolean' ? 'boolean' :
                 Array.isArray(value) ? 'any[]' : 'object';
    code += `  ${propName}: ${type};\n`;
  }
  
  code += `}\n\n`;
  code += `// Vue Component\n`;
  code += `<template>\n`;
  code += `  <div>\n`;
  for (const [key] of Object.entries(obj)) {
    const propName = toCamelCase(key);
    code += `    <p>{{ data.${propName} }}</p>\n`;
  }
  code += `  </div>\n`;
  code += `</template>\n\n`;
  code += `<script setup lang="ts">\n`;
  code += `import { defineProps } from 'vue';\n\n`;
  code += `interface Props {\n`;
  code += `  data: ${className};\n`;
  code += `}\n\n`;
  code += `defineProps<Props>();\n`;
  code += `</script>`;
  return code;
}

function modelApplyLang() {
  const t = modelDict[modelLang];
  document.documentElement.lang = modelLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('inputLabel').textContent = t.inputLabel;
  document.getElementById('outputLabel').textContent = t.outputLabel;
  document.getElementById('btnConvert').textContent = t.btnConvert;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function modelConvert() {
  const input = document.getElementById('jsonInput').value.trim();
  const output = document.getElementById('modelOutput');
  const status = document.getElementById('status');
  
  if (!input) {
    output.value = '';
    status.style.display = 'none';
    return;
  }
  
  try {
    const json = JSON.parse(input);
    
    if (typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Root must be an object');
    }
    
    const swiftModel = generateSwiftModel(json);
    const kotlinModel = generateKotlinModel(json);
    
    output.value = swiftModel;
    
    // Generate other language models
    const jsModel = generateJavaScriptModel(json);
    const pythonModel = generatePythonModel(json);
    const reactModel = generateReactModel(json);
    const vueModel = generateVueModel(json);
    
    // Update code samples
    const jsCode = document.querySelector('#javascriptCode code');
    const pythonCode = document.querySelector('#pythonCode code');
    const reactCode = document.querySelector('#reactCode code');
    const vueCode = document.querySelector('#vueCode code');
    const swiftCode = document.querySelector('#swiftCode code');
    const androidCode = document.querySelector('#androidCode code');
    
    if (jsCode) jsCode.textContent = jsModel;
    if (pythonCode) pythonCode.textContent = pythonModel;
    if (reactCode) reactCode.textContent = reactModel;
    if (vueCode) vueCode.textContent = vueModel;
    if (swiftCode) swiftCode.textContent = swiftModel;
    if (androidCode) androidCode.textContent = kotlinModel;
    
    status.style.display = 'none';
  } catch (error) {
    status.textContent = modelDict[modelLang].statusError;
    status.style.display = 'block';
    output.value = '';
  }
}

function modelInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  modelLang = 'vi';
  modelApplyLang();

  document.getElementById('jsonInput').addEventListener('input', modelConvert);
  document.getElementById('btnConvert').addEventListener('click', modelConvert);
  
  document.getElementById('btnCopy').addEventListener('click', () => {
    const text = document.getElementById('modelOutput').value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(
      () => {
        const btn = document.getElementById('btnCopy');
        const originalText = btn.textContent;
        btn.textContent = modelDict[modelLang].statusCopyOk;
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      },
      () => {
        const btn = document.getElementById('btnCopy');
        const originalText = btn.textContent;
        btn.textContent = modelDict[modelLang].statusCopyFail;
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
  document.addEventListener('DOMContentLoaded', modelInitTool);
} else {
  modelInitTool();
}
