// Date/Time Formatter logic & i18n

const dateDict = {
  vi: {
    tagline: 'Format date/time.',
    title: 'Date/Time Formatter',
    subtitle: 'Format date/time.',
    dateLabel: 'Chọn ngày/giờ',
    customFormatLabel: 'Custom Format',
    formatHint: 'Ví dụ: yyyy-MM-dd HH:mm:ss, dd/MM/yyyy, HH:mm',
    swiftOutputLabel: 'Swift Output',
    androidOutputLabel: 'Android Output',
    btnCopySwift: 'Copy Swift',
    btnCopyAndroid: 'Copy Android',
    statusCopyOk: 'Đã copy vào clipboard.',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Format date/time.',
    title: 'Date/Time Formatter',
    subtitle: 'Format date/time.',
    dateLabel: 'Select Date/Time',
    customFormatLabel: 'Custom Format',
    formatHint: 'Examples: yyyy-MM-dd HH:mm:ss, dd/MM/yyyy, HH:mm',
    swiftOutputLabel: 'Swift Output',
    androidOutputLabel: 'Android Output',
    btnCopySwift: 'Copy Swift',
    btnCopyAndroid: 'Copy Android',
    statusCopyOk: 'Copied to clipboard.',
    codeSamplesTitle: 'Code Samples'
  }
};

let dateLang = 'vi';
let currentFormat = 'yyyy-MM-dd HH:mm:ss';

const dateFormats = [
  { label: 'ISO 8601', value: 'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'' },
  { label: 'Date Time', value: 'yyyy-MM-dd HH:mm:ss' },
  { label: 'Date Only', value: 'yyyy-MM-dd' },
  { label: 'Time Only', value: 'HH:mm:ss' },
  { label: 'US Format', value: 'MM/dd/yyyy HH:mm' },
  { label: 'EU Format', value: 'dd/MM/yyyy HH:mm' },
  { label: 'Custom', value: 'custom' }
];

function dateApplyLang() {
  const t = dateDict[dateLang];
  document.documentElement.lang = dateLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('dateLabel').textContent = t.dateLabel;
  document.getElementById('customFormatLabel').textContent = t.customFormatLabel;
  document.getElementById('formatHint').textContent = t.formatHint;
  document.getElementById('swiftOutputLabel').textContent = t.swiftOutputLabel;
  document.getElementById('androidOutputLabel').textContent = t.androidOutputLabel;
  document.getElementById('btnCopySwift').textContent = t.btnCopySwift;
  document.getElementById('btnCopyAndroid').textContent = t.btnCopyAndroid;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function formatDateSwift(date, format) {
  const formatMap = {
    'yyyy': date.getFullYear(),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'dd': String(date.getDate()).padStart(2, '0'),
    'HH': String(date.getHours()).padStart(2, '0'),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'ss': String(date.getSeconds()).padStart(2, '0'),
    'SSS': String(date.getMilliseconds()).padStart(3, '0')
  };
  
  let result = format;
  for (const [key, value] of Object.entries(formatMap)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  return result;
}

function formatDateAndroid(date, format) {
  const formatMap = {
    'yyyy': date.getFullYear(),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'dd': String(date.getDate()).padStart(2, '0'),
    'HH': String(date.getHours()).padStart(2, '0'),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'ss': String(date.getSeconds()).padStart(2, '0'),
    'SSS': String(date.getMilliseconds()).padStart(3, '0')
  };
  
  let result = format;
  for (const [key, value] of Object.entries(formatMap)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  return result;
}

function dateUpdate() {
  const dateInput = document.getElementById('dateInput').value;
  if (!dateInput) return;
  
  const date = new Date(dateInput);
  const swiftOutput = document.getElementById('swiftOutput');
  const androidOutput = document.getElementById('androidOutput');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  const swiftFormatted = formatDateSwift(date, currentFormat);
  const androidFormatted = formatDateAndroid(date, currentFormat);
  
  swiftOutput.textContent = swiftFormatted;
  androidOutput.textContent = androidFormatted;
  
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript
const date = new Date();
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, '0');
const day = String(date.getDate()).padStart(2, '0');
const hours = String(date.getHours()).padStart(2, '0');
const minutes = String(date.getMinutes()).padStart(2, '0');
const seconds = String(date.getSeconds()).padStart(2, '0');

// Manual formatting
const formatted = "${swiftFormatted}";

// Using Intl.DateTimeFormat
const formatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});
const formatted2 = formatter.format(date);

// Using date-fns library
import { format } from 'date-fns';
const formatted3 = format(date, '${currentFormat}');`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python
from datetime import datetime

date = datetime.now()
formatted = date.strftime("${currentFormat}")
print(formatted)  # "${swiftFormatted}"

# ISO 8601
iso_string = date.isoformat()
print(iso_string)

# Using dateutil
from dateutil import parser
parsed_date = parser.parse("${swiftFormatted}")

# Custom formatting
formatted_custom = date.strftime("%Y-%m-%d %H:%M:%S")`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React from 'react';

function DateFormatter() {
  const date = new Date();
  const formatted = date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return (
    <div>
      <p>Formatted: {formatted}</p>
      <p>ISO: {date.toISOString()}</p>
    </div>
  );
}

export default DateFormatter;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div>
    <p>Formatted: {{ formatted }}</p>
    <p>ISO: {{ isoString }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      date: new Date()
    };
  },
  computed: {
    formatted() {
      return this.date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    },
    isoString() {
      return this.date.toISOString();
    }
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import Foundation

let date = Date()
let formatter = DateFormatter()
formatter.dateFormat = "${currentFormat}"
formatter.locale = Locale(identifier: "en_US_POSIX")
formatter.timeZone = TimeZone(secondsFromGMT: 0)

let formatted = formatter.string(from: date)
print(formatted) // "${swiftFormatted}"

// ISO 8601
let isoFormatter = ISO8601DateFormatter()
isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
let isoString = isoFormatter.string(from: date)`;
  }
  
  if (androidCode) {
    androidCode.textContent = `import java.text.SimpleDateFormat
import java.util.*

val date = Date()
val formatter = SimpleDateFormat("${currentFormat}", Locale.US)
formatter.timeZone = TimeZone.getTimeZone("UTC")

val formatted = formatter.format(date)
println(formatted) // "${androidFormatted}"

// ISO 8601
val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
isoFormatter.timeZone = TimeZone.getTimeZone("UTC")
val isoString = isoFormatter.format(date)

// Kotlin (using java.time)
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

val localDateTime = LocalDateTime.now()
val formatter = DateTimeFormatter.ofPattern("${currentFormat}")
val formatted = localDateTime.format(formatter)`;
  }
}

function dateInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  dateLang = 'vi';
  dateApplyLang();

  // Set default date to now
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('dateInput').value = `${year}-${month}-${day}T${hours}:${minutes}`;

  // Create format selector
  const formatSelector = document.getElementById('formatSelector');
  const customFormatWrapper = document.getElementById('customFormatWrapper');
  const customFormatInput = document.getElementById('customFormatInput');
  
  dateFormats.forEach((fmt, index) => {
    const option = document.createElement('div');
    option.className = 'format-option' + (index === 1 ? ' active' : '');
    option.textContent = fmt.label;
    option.addEventListener('click', () => {
      document.querySelectorAll('.format-option').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      
      if (fmt.value === 'custom') {
        customFormatWrapper.style.display = 'flex';
        if (customFormatInput.value) {
          currentFormat = customFormatInput.value;
        } else {
          currentFormat = 'yyyy-MM-dd HH:mm:ss';
          customFormatInput.value = currentFormat;
        }
      } else {
        customFormatWrapper.style.display = 'none';
        currentFormat = fmt.value;
      }
      dateUpdate();
    });
    formatSelector.appendChild(option);
  });
  
  // Custom format input handler
  customFormatInput.addEventListener('input', () => {
    const activeOption = document.querySelector('.format-option.active');
    if (activeOption && activeOption.textContent === 'Custom') {
      currentFormat = customFormatInput.value || 'yyyy-MM-dd HH:mm:ss';
      dateUpdate();
    }
  });

  document.getElementById('dateInput').addEventListener('change', dateUpdate);
  
  document.getElementById('btnCopySwift').addEventListener('click', () => {
    const text = document.getElementById('swiftOutput').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btnCopySwift');
      const originalText = btn.textContent;
      btn.textContent = dateDict[dateLang].statusCopyOk;
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
  });
  
  document.getElementById('btnCopyAndroid').addEventListener('click', () => {
    const text = document.getElementById('androidOutput').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btnCopyAndroid');
      const originalText = btn.textContent;
      btn.textContent = dateDict[dateLang].statusCopyOk;
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    });
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
  dateUpdate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dateInitTool);
} else {
  dateInitTool();
}
