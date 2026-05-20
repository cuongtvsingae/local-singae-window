// Regex Tester logic & i18n

const regexDict = {
  vi: {
    tagline: 'Test regex patterns với sample text.',
    title: 'Regex Tester',
    subtitle: 'Test regex patterns với sample text.',
    patternLabel: 'Pattern',
    patternPlaceholder: 'Nhập regex pattern...',
    testLabel: 'Test Text',
    testPlaceholder: 'Nhập text để test...',
    resultsLabel: 'Results',
    noMatches: 'Không có matches.',
    error: 'Lỗi regex: '
  },
  en: {
    tagline: 'Test regex patterns with sample text.',
    title: 'Regex Tester',
    subtitle: 'Test regex patterns with sample text.',
    patternLabel: 'Pattern',
    patternPlaceholder: 'Enter regex pattern...',
    testLabel: 'Test Text',
    testPlaceholder: 'Enter text to test...',
    resultsLabel: 'Results',
    noMatches: 'No matches found.',
    error: 'Regex error: '
  }
};

let regexLang = 'vi';

function regexApplyLang() {
  const t = regexDict[regexLang];
  document.documentElement.lang = regexLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('patternLabel').textContent = t.patternLabel;
  document.getElementById('pattern').placeholder = t.patternPlaceholder;
  document.getElementById('testLabel').textContent = t.testLabel;
  document.getElementById('testText').placeholder = t.testPlaceholder;
  document.getElementById('resultsLabel').textContent = t.resultsLabel;
  document.getElementById('langLabel').textContent = regexLang === 'vi' ? 'VI' : 'EN';
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function regexTest() {
  const pattern = document.getElementById('pattern').value;
  const testText = document.getElementById('testText').value;
  const results = document.getElementById('regexResults');
  const info = document.getElementById('regexInfo');
  const flagG = document.getElementById('flagG').checked;
  const flagI = document.getElementById('flagI').checked;
  const flagM = document.getElementById('flagM').checked;
  
  if (!pattern || !testText) {
    results.textContent = '';
    info.textContent = '';
    return;
  }
  
  try {
    let flags = '';
    if (flagG) flags += 'g';
    if (flagI) flags += 'i';
    if (flagM) flags += 'm';
    
    const regex = new RegExp(pattern, flags);
    const matches = testText.match(regex);
    
    if (!matches) {
      results.innerHTML = `<span style="color: var(--text-muted);">${regexDict[regexLang].noMatches}</span>`;
      info.textContent = '';
      return;
    }
    
    // Highlight matches in test text
    let highlighted = testText;
    if (flagG) {
      highlighted = testText.replace(regex, (match) => {
        return `<span class="regex-match">${match}</span>`;
      });
    } else {
      highlighted = testText.replace(matches[0], (match) => {
        return `<span class="regex-match">${match}</span>`;
      });
    }
    
    results.innerHTML = highlighted;
    
    // Show match info
    const matchCount = flagG ? matches.length : 1;
    info.textContent = `Found ${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
  } catch (e) {
    results.innerHTML = `<div class="regex-error">${regexDict[regexLang].error}${e.message}</div>`;
    info.textContent = '';
  }
}

function regexInitTool() {
  regexApplyLang();

  document.getElementById('pattern').addEventListener('input', regexTest);
  document.getElementById('testText').addEventListener('input', regexTest);
  document.getElementById('flagG').addEventListener('change', regexTest);
  document.getElementById('flagI').addEventListener('change', regexTest);
  document.getElementById('flagM').addEventListener('change', regexTest);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', regexInitTool);
} else {
  regexInitTool();
}
