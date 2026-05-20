// Color Palette Generator logic & i18n

const paletteDict = {
  vi: {
    tagline: 'Tạo bảng màu từ màu chính.',
    title: 'Color Palette Generator',
    subtitle: 'Tạo bảng màu từ màu chính.',
    colorLabel: 'Màu chính',
    btnCopyPalette: 'Copy Palette',
    statusCopyOk: 'Đã copy palette vào clipboard.',
    codeSamplesTitle: 'Code mẫu',
    monochromatic: 'Monochromatic',
    complementary: 'Complementary',
    triadic: 'Triadic',
    analogous: 'Analogous'
  },
  en: {
    tagline: 'Generate color palette from base color.',
    title: 'Color Palette Generator',
    subtitle: 'Generate color palette from base color.',
    colorLabel: 'Base Color',
    btnCopyPalette: 'Copy Palette',
    statusCopyOk: 'Palette copied to clipboard.',
    codeSamplesTitle: 'Code Samples',
    monochromatic: 'Monochromatic',
    complementary: 'Complementary',
    triadic: 'Triadic',
    analogous: 'Analogous'
  }
};

let paletteLang = 'vi';
let currentPaletteType = 'monochromatic';

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function generateMonochromatic(baseHex) {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  const colors = [];
  for (let i = 0; i < 5; i++) {
    const lightness = 20 + (i * 15);
    const newRgb = hslToRgb(hsl.h, hsl.s, lightness);
    colors.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }
  return colors;
}

function generateComplementary(baseHex) {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  const colors = [baseHex];
  const compHue = (hsl.h + 180) % 360;
  const compRgb = hslToRgb(compHue, hsl.s, hsl.l);
  colors.push(rgbToHex(compRgb.r, compRgb.g, compRgb.b));
  
  // Add variations
  for (let i = 0; i < 3; i++) {
    const lightness = 30 + (i * 20);
    const newRgb = hslToRgb(hsl.h, hsl.s, lightness);
    colors.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }
  return colors;
}

function generateTriadic(baseHex) {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  const colors = [baseHex];
  const hue1 = (hsl.h + 120) % 360;
  const hue2 = (hsl.h + 240) % 360;
  
  const rgb1 = hslToRgb(hue1, hsl.s, hsl.l);
  const rgb2 = hslToRgb(hue2, hsl.s, hsl.l);
  colors.push(rgbToHex(rgb1.r, rgb1.g, rgb1.b));
  colors.push(rgbToHex(rgb2.r, rgb2.g, rgb2.b));
  
  // Add lighter/darker variations
  const lightRgb = hslToRgb(hsl.h, hsl.s, Math.min(90, hsl.l + 20));
  const darkRgb = hslToRgb(hsl.h, hsl.s, Math.max(10, hsl.l - 20));
  colors.push(rgbToHex(lightRgb.r, lightRgb.g, lightRgb.b));
  colors.push(rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b));
  
  return colors;
}

function generateAnalogous(baseHex) {
  const rgb = hexToRgb(baseHex);
  if (!rgb) return [];
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  const colors = [];
  for (let i = -2; i <= 2; i++) {
    const hue = (hsl.h + i * 30 + 360) % 360;
    const newRgb = hslToRgb(hue, hsl.s, hsl.l);
    colors.push(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  }
  return colors;
}

function paletteApplyLang() {
  const t = paletteDict[paletteLang];
  document.documentElement.lang = paletteLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('colorLabel').textContent = t.colorLabel;
  document.getElementById('btnCopyPalette').textContent = t.btnCopyPalette;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  // Không đổi langLabel nữa, luôn hiển thị VI theo HTML
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

function updatePalette() {
  const baseColor = document.getElementById('baseColor').value;
  const baseColorHex = document.getElementById('baseColorHex');
  baseColorHex.value = baseColor.toUpperCase();
  
  let colors = [];
  switch (currentPaletteType) {
    case 'monochromatic':
      colors = generateMonochromatic(baseColor);
      break;
    case 'complementary':
      colors = generateComplementary(baseColor);
      break;
    case 'triadic':
      colors = generateTriadic(baseColor);
      break;
    case 'analogous':
      colors = generateAnalogous(baseColor);
      break;
  }
  
  const paletteGrid = document.getElementById('paletteGrid');
  paletteGrid.innerHTML = '';
  
  colors.forEach((color, index) => {
    const colorDiv = document.createElement('div');
    colorDiv.className = 'palette-color';
    colorDiv.onclick = () => {
      navigator.clipboard.writeText(color);
      const btn = document.getElementById('btnCopyPalette');
      const originalText = btn.textContent;
      btn.textContent = paletteDict[paletteLang].statusCopyOk;
      setTimeout(() => { btn.textContent = originalText; }, 2000);
    };
    
    colorDiv.innerHTML = `
      <div class="palette-color-box" style="background: ${color}"></div>
      <div class="palette-color-info">${color}</div>
    `;
    paletteGrid.appendChild(colorDiv);
  });
  
  updateCodeSamples(colors);
}

function updateCodeSamples(colors) {
  const jsCode = document.querySelector('#javascriptCode code');
  const pythonCode = document.querySelector('#pythonCode code');
  const reactCode = document.querySelector('#reactCode code');
  const vueCode = document.querySelector('#vueCode code');
  const swiftCode = document.querySelector('#swiftCode code');
  const androidCode = document.querySelector('#androidCode code');
  
  const colorsArray = colors.map(c => `"${c}"`).join(', ');
  const colorsList = colors.map(c => `Color(hex: "${c}")`).join(',\n        ');
  
  if (jsCode) {
    jsCode.textContent = `// JavaScript
const palette = [${colorsArray}];

// CSS Variables
const cssVars = palette.map((color, i) => \`--color-\${i}: \${color};\`).join('\\n');
document.documentElement.style.cssText = cssVars;

// Usage in CSS
// .element { background: var(--color-0); }

// Canvas API
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
palette.forEach((color, i) => {
  ctx.fillStyle = color;
  ctx.fillRect(i * 50, 0, 50, 50);
});`;
  }
  
  if (pythonCode) {
    pythonCode.textContent = `# Python
palette = [${colorsArray}]

# Using PIL/Pillow
from PIL import Image, ImageDraw

width, height = 300, 50
image = Image.new('RGB', (width, height))
draw = ImageDraw.Draw(image)

color_width = width // len(palette)
for i, color in enumerate(palette):
    # Convert hex to RGB
    hex_color = color.lstrip('#')
    rgb = tuple(int(hex_color[j:j+2], 16) for j in (0, 2, 4))
    draw.rectangle([i * color_width, 0, (i + 1) * color_width, height], fill=rgb)

image.save('palette.png')`;
  }
  
  if (reactCode) {
    reactCode.textContent = `// React
import React from 'react';

const palette = [${colorsArray}];

function ColorPalette() {
  return (
    <div style={{ display: 'flex' }}>
      {palette.map((color, i) => (
        <div
          key={i}
          style={{
            width: '50px',
            height: '50px',
            backgroundColor: color
          }}
        />
      ))}
    </div>
  );
}

export default ColorPalette;`;
  }
  
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div style="display: flex">
    <div
      v-for="(color, i) in palette"
      :key="i"
      :style="{
        width: '50px',
        height: '50px',
        backgroundColor: color
      }"
    />
  </div>
</template>

<script>
export default {
  data() {
    return {
      palette: [${colorsArray}]
    };
  }
};
</script>`;
  }
  
  if (swiftCode) {
    swiftCode.textContent = `import SwiftUI

// Color Palette
let palette: [String] = [${colorsArray}]

// SwiftUI Colors
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

let colors: [Color] = [
        ${colorsList}
]`;
  }
  
  if (androidCode) {
    const androidColors = colors.map(c => {
      const hex = c.replace('#', '');
      return `Color(0xFF${hex})`;
    }).join(',\n        ');
    
    androidCode.textContent = `// Kotlin Color Palette
val palette = listOf(${colorsArray})

// Android Colors (Jetpack Compose)
import androidx.compose.ui.graphics.Color

val colors = listOf(
        ${androidColors}
)

// Android XML Resources
// res/values/colors.xml
${colors.map((c, i) => `<color name="palette_${i}">${c}</color>`).join('\n')}

// Usage in Compose
Box(
    modifier = Modifier
        .background(colors[0])
        .size(100.dp)
)`;
  }
}

function paletteInitTool() {
  // Luôn dùng tiếng Việt, bỏ logic đổi ngôn ngữ
  paletteLang = 'vi';
  paletteApplyLang();

  // Palette type selector
  const paletteTypes = [
    { id: 'monochromatic', label: paletteDict[paletteLang].monochromatic },
    { id: 'complementary', label: paletteDict[paletteLang].complementary },
    { id: 'triadic', label: paletteDict[paletteLang].triadic },
    { id: 'analogous', label: paletteDict[paletteLang].analogous }
  ];
  
  const selector = document.getElementById('paletteTypeSelector');
  paletteTypes.forEach((type, index) => {
    const option = document.createElement('div');
    option.className = 'palette-type' + (index === 0 ? ' active' : '');
    option.textContent = type.label;
    option.addEventListener('click', () => {
      document.querySelectorAll('.palette-type').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      currentPaletteType = type.id;
      updatePalette();
    });
    selector.appendChild(option);
  });

  // Color picker sync
  document.getElementById('baseColor').addEventListener('input', (e) => {
    document.getElementById('baseColorHex').value = e.target.value.toUpperCase();
    updatePalette();
  });

  document.getElementById('baseColorHex').addEventListener('input', (e) => {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      document.getElementById('baseColor').value = hex;
      updatePalette();
    }
  });

  document.getElementById('btnCopyPalette').addEventListener('click', () => {
    const colors = Array.from(document.querySelectorAll('.palette-color-info')).map(el => el.textContent);
    const text = colors.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btnCopyPalette');
      const originalText = btn.textContent;
      btn.textContent = paletteDict[paletteLang].statusCopyOk;
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
  updatePalette();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paletteInitTool);
} else {
  paletteInitTool();
}
