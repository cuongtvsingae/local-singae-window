// Gradient Generator logic & i18n

const gradDict = {
  vi: {
    tagline: 'Tạo CSS gradient với preview trực quan.',
    title: 'Gradient Generator',
    subtitle: 'Tạo CSS gradient với preview trực quan.',
    colorsLabel: 'Màu sắc',
    color1Label: 'Màu 1',
    color2Label: 'Màu 2',
    directionLabel: 'Hướng',
    cssLabel: 'CSS Code',
    previewLabel: 'Preview',
    btnCopy: 'Copy CSS',
    statusCopyOk: 'Đã copy CSS vào clipboard.',
    statusCopyFail: 'Không copy được (trình duyệt chặn).',
    codeSamplesTitle: 'Code mẫu'
  },
  en: {
    tagline: 'Generate CSS gradients with visual preview.',
    title: 'Gradient Generator',
    subtitle: 'Generate CSS gradients with visual preview.',
    colorsLabel: 'Colors',
    color1Label: 'Color 1',
    color2Label: 'Color 2',
    directionLabel: 'Direction',
    cssLabel: 'CSS Code',
    previewLabel: 'Preview',
    btnCopy: 'Copy CSS',
    statusCopyOk: 'CSS copied to clipboard.',
    statusCopyFail: 'Could not copy (browser blocked).',
    codeSamplesTitle: 'Code Samples'
  }
};

let gradLang = 'vi';

function gradApplyLang() {
  const t = gradDict[gradLang];
  document.documentElement.lang = gradLang;
  document.getElementById('tagline').textContent = t.tagline;
  document.getElementById('title').textContent = t.title;
  document.getElementById('subtitle').textContent = t.subtitle;
  document.getElementById('colorsLabel').textContent = t.colorsLabel;
  document.getElementById('color1Label').textContent = t.color1Label;
  document.getElementById('color2Label').textContent = t.color2Label;
  document.getElementById('directionLabel').textContent = t.directionLabel;
  document.getElementById('cssLabel').textContent = t.cssLabel;
  document.getElementById('previewLabel').textContent = t.previewLabel;
  document.getElementById('btnCopy').textContent = t.btnCopy;
  document.getElementById('codeSamplesTitle').textContent = t.codeSamplesTitle;
  document.getElementById('langLabel').textContent = gradLang === 'vi' ? 'VI' : 'EN';
  gradUpdateCodeSamples();
  
  // Update donate text if function exists
  if (typeof window.updateDonateText === 'function') {
    window.updateDonateText();
  }
}

// Color conversion function (for Python code only)
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Validate and normalize hex color
function validateHex(hex) {
  if (!hex) return null;
  
  // Remove whitespace
  hex = hex.trim();
  
  // Add # if missing
  if (!hex.startsWith('#')) {
    hex = '#' + hex;
  }
  
  // Check if valid hex format
  const hexPattern = /^#([a-f\d]{3}|[a-f\d]{6})$/i;
  if (!hexPattern.test(hex)) {
    return null;
  }
  
  // Expand 3-digit hex to 6-digit
  if (hex.length === 4) {
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  
  return hex.toUpperCase();
}

// Update color from hex input
function updateColorFromHex(hexInputId, colorPickerId) {
  const hexInput = document.getElementById(hexInputId);
  const colorPicker = document.getElementById(colorPickerId);
  
  if (!hexInput || !colorPicker) return;
  
  const normalizedHex = validateHex(hexInput.value);
  
  if (normalizedHex) {
    // Valid hex - update color picker and remove invalid class
    colorPicker.value = normalizedHex;
    hexInput.value = normalizedHex;
    hexInput.classList.remove('invalid');
    
    // Update all UI
    gradUpdate();
    gradUpdateCodeSamples();
  } else {
    // Invalid hex - add invalid class
    hexInput.classList.add('invalid');
  }
}

// Sync color picker to hex input
function syncColorPickerToHex(colorPickerId, hexInputId) {
  const colorPicker = document.getElementById(colorPickerId);
  const hexInput = document.getElementById(hexInputId);
  
  if (!colorPicker || !hexInput) return;
  
  const hex = colorPicker.value.toUpperCase();
  hexInput.value = hex;
  hexInput.classList.remove('invalid');
}

function gradUpdateCodeSamples() {
  const color1 = document.getElementById('color1').value;
  const color2 = document.getElementById('color2').value;
  const direction = document.getElementById('direction').value;
  
  // Convert CSS direction to Swift/Android equivalents
  let swiftStartPoint = '.leading';
  let swiftEndPoint = '.trailing';
  let androidAngle = '0';
  let androidOrientation = 'LEFT_RIGHT';
  
  if (direction.includes('right')) {
    swiftStartPoint = '.leading';
    swiftEndPoint = '.trailing';
    androidAngle = '0';
    androidOrientation = 'LEFT_RIGHT';
  } else if (direction.includes('left')) {
    swiftStartPoint = '.trailing';
    swiftEndPoint = '.leading';
    androidAngle = '180';
    androidOrientation = 'RIGHT_LEFT';
  } else if (direction.includes('bottom')) {
    swiftStartPoint = '.top';
    swiftEndPoint = '.bottom';
    androidAngle = '90';
    androidOrientation = 'TOP_BOTTOM';
  } else if (direction.includes('top')) {
    swiftStartPoint = '.bottom';
    swiftEndPoint = '.top';
    androidAngle = '270';
    androidOrientation = 'BOTTOM_TOP';
  }
  
  // Calculate gradient coordinates for JavaScript Canvas
  let jsX1 = 0, jsY1 = 0, jsX2 = 300, jsY2 = 0;
  if (direction.includes('right')) {
    jsX1 = 0; jsY1 = 0; jsX2 = 300; jsY2 = 0; // left to right
  } else if (direction.includes('left')) {
    jsX1 = 300; jsY1 = 0; jsX2 = 0; jsY2 = 0; // right to left
  } else if (direction.includes('bottom')) {
    jsX1 = 0; jsY1 = 0; jsX2 = 0; jsY2 = 300; // top to bottom
  } else if (direction.includes('top')) {
    jsX1 = 0; jsY1 = 300; jsX2 = 0; jsY2 = 0; // bottom to top
  } else if (direction.includes('bottom right')) {
    jsX1 = 0; jsY1 = 0; jsX2 = 300; jsY2 = 300;
  } else if (direction.includes('bottom left')) {
    jsX1 = 300; jsY1 = 0; jsX2 = 0; jsY2 = 300;
  } else if (direction.includes('top right')) {
    jsX1 = 0; jsY1 = 300; jsX2 = 300; jsY2 = 0;
  } else if (direction.includes('top left')) {
    jsX1 = 300; jsY1 = 300; jsX2 = 0; jsY2 = 0;
  }
  
  // Update JavaScript code
  const jsCode = document.querySelector('#javascriptCode code');
  if (jsCode) {
    jsCode.textContent = `// JavaScript (Canvas)
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
const gradient = ctx.createLinearGradient(${jsX1}, ${jsY1}, ${jsX2}, ${jsY2});
gradient.addColorStop(0, '${color1}');
gradient.addColorStop(1, '${color2}');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, 300, 300);`;
  }
  
  // Update Python code
  const pythonCode = document.querySelector('#pythonCode code');
  if (pythonCode) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (rgb1 && rgb2) {
      // Determine gradient direction for Python
      let pythonLoop = '';
      if (direction.includes('right') || direction.includes('left')) {
        pythonLoop = `for x in range(width):
    r = int(${rgb1.r} + (${rgb2.r} - ${rgb1.r}) * x / width)
    g = int(${rgb1.g} + (${rgb2.g} - ${rgb1.g}) * x / width)
    b = int(${rgb1.b} + (${rgb2.b} - ${rgb1.b}) * x / width)
    draw.line([(x, 0), (x, height)], fill=(r, g, b))`;
      } else if (direction.includes('bottom') || direction.includes('top')) {
        pythonLoop = `for y in range(height):
    r = int(${rgb1.r} + (${rgb2.r} - ${rgb1.r}) * y / height)
    g = int(${rgb1.g} + (${rgb2.g} - ${rgb1.g}) * y / height)
    b = int(${rgb1.b} + (${rgb2.b} - ${rgb1.b}) * y / height)
    draw.line([(0, y), (width, y)], fill=(r, g, b))`;
      } else {
        // Diagonal gradients - simplified horizontal for now
        pythonLoop = `for x in range(width):
    r = int(${rgb1.r} + (${rgb2.r} - ${rgb1.r}) * x / width)
    g = int(${rgb1.g} + (${rgb2.g} - ${rgb1.g}) * x / width)
    b = int(${rgb1.b} + (${rgb2.b} - ${rgb1.b}) * x / width)
    draw.line([(x, 0), (x, height)], fill=(r, g, b))`;
      }
      
      pythonCode.textContent = `# Python (PIL/Pillow)
from PIL import Image, ImageDraw

width, height = 300, 300
image = Image.new('RGB', (width, height))
draw = ImageDraw.Draw(image)

${pythonLoop}

image.save('gradient.png')`;
    }
  }
  
  // Update React code
  const reactCode = document.querySelector('#reactCode code');
  if (reactCode) {
    reactCode.textContent = `// React (JSX)
import React from 'react';

function GradientBox() {
  const gradientStyle = {
    width: '300px',
    height: '300px',
    background: 'linear-gradient(${direction}, ${color1}, ${color2})',
    borderRadius: '8px'
  };
  
  return <div style={gradientStyle} />;
}

export default GradientBox;`;
  }
  
  // Update Vue code
  const vueCode = document.querySelector('#vueCode code');
  if (vueCode) {
    vueCode.textContent = `// Vue.js
<template>
  <div :style="gradientStyle"></div>
</template>

<script>
export default {
  data() {
    return {
      gradientStyle: {
        width: '300px',
        height: '300px',
        background: 'linear-gradient(${direction}, ${color1}, ${color2})',
        borderRadius: '8px'
      }
    };
  }
};
</script>`;
  }
  
  // Update Swift code
  const swiftCode = document.querySelector('#swiftCode code');
  if (swiftCode) {
    swiftCode.textContent = `import SwiftUI

struct GradientView: View {
    var body: some View {
        LinearGradient(
            gradient: Gradient(colors: [
                Color(hex: "${color1}"),
                Color(hex: "${color2}")
            ]),
            startPoint: ${swiftStartPoint},
            endPoint: ${swiftEndPoint}
        )
        .frame(width: 300, height: 300)
        .cornerRadius(8)
    }
}

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
}`;
  }
  
  // Update Android code
  const androidCode = document.querySelector('#androidCode code');
  if (androidCode) {
    const color1Hex = color1.replace('#', '');
    const color2Hex = color2.replace('#', '');
    androidCode.textContent = `// XML Layout
<androidx.constraintlayout.widget.ConstraintLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    
    <View
        android:layout_width="300dp"
        android:layout_height="300dp"
        android:background="@drawable/gradient_background"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintStart_toStartOf="parent"
        app:layout_constraintEnd_toEndOf="parent"
        app:layout_constraintBottom_toBottomOf="parent" />
        
</androidx.constraintlayout.widget.ConstraintLayout>

// drawable/gradient_background.xml
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <gradient
        android:type="linear"
        android:angle="${androidAngle}"
        android:startColor="${color1}"
        android:endColor="${color2}" />
</shape>

// Kotlin Code
import android.graphics.drawable.GradientDrawable
import android.view.View

fun createGradientView(context: Context): View {
    val view = View(context)
    val gradient = GradientDrawable(
        GradientDrawable.Orientation.${androidOrientation},
        intArrayOf(
            0xFF${color1Hex}.toInt(),
            0xFF${color2Hex}.toInt()
        )
    )
    view.background = gradient
    view.layoutParams = ViewGroup.LayoutParams(300, 300)
    return view
}

// Compose
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

@Composable
fun GradientBox() {
    val startOffset = when {
        "${direction}".contains("right") && !"${direction}".contains("left") && !"${direction}".contains("top") && !"${direction}".contains("bottom") -> Offset(0f, 0f)
        "${direction}".contains("left") && !"${direction}".contains("right") && !"${direction}".contains("top") && !"${direction}".contains("bottom") -> Offset(300f, 0f)
        "${direction}".contains("bottom") && !"${direction}".contains("top") && !"${direction}".contains("right") && !"${direction}".contains("left") -> Offset(0f, 0f)
        "${direction}".contains("top") && !"${direction}".contains("bottom") && !"${direction}".contains("right") && !"${direction}".contains("left") -> Offset(0f, 300f)
        "${direction}".contains("bottom right") -> Offset(0f, 0f)
        "${direction}".contains("bottom left") -> Offset(300f, 0f)
        "${direction}".contains("top right") -> Offset(0f, 300f)
        "${direction}".contains("top left") -> Offset(300f, 300f)
        else -> Offset(0f, 0f)
    }
    val endOffset = when {
        "${direction}".contains("right") && !"${direction}".contains("left") && !"${direction}".contains("top") && !"${direction}".contains("bottom") -> Offset(300f, 0f)
        "${direction}".contains("left") && !"${direction}".contains("right") && !"${direction}".contains("top") && !"${direction}".contains("bottom") -> Offset(0f, 0f)
        "${direction}".contains("bottom") && !"${direction}".contains("top") && !"${direction}".contains("right") && !"${direction}".contains("left") -> Offset(0f, 300f)
        "${direction}".contains("top") && !"${direction}".contains("bottom") && !"${direction}".contains("right") && !"${direction}".contains("left") -> Offset(0f, 0f)
        "${direction}".contains("bottom right") -> Offset(300f, 300f)
        "${direction}".contains("bottom left") -> Offset(0f, 300f)
        "${direction}".contains("top right") -> Offset(300f, 0f)
        "${direction}".contains("top left") -> Offset(0f, 0f)
        else -> Offset(300f, 0f)
    }
    
    Box(
        modifier = Modifier
            .size(300.dp)
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(
                        Color(0xFF${color1Hex}),
                        Color(0xFF${color2Hex})
                    ),
                    start = startOffset,
                    end = endOffset
                )
            )
    )
}`;
  }
}

function gradUpdate() {
  const color1 = document.getElementById('color1').value;
  const color2 = document.getElementById('color2').value;
  const direction = document.getElementById('direction').value;
  const preview = document.getElementById('gradientPreview');
  const cssOutput = document.getElementById('cssOutput');
  
  const gradient = `linear-gradient(${direction}, ${color1}, ${color2})`;
  preview.style.background = gradient;
  cssOutput.value = `background: ${gradient};`;
}

function gradCopy() {
  const cssOutput = document.getElementById('cssOutput');
  const text = cssOutput.value;
  
  if (!text) {
    return;
  }
  
  navigator.clipboard.writeText(text).then(
    () => {
      const btn = document.getElementById('btnCopy');
      const originalText = btn.textContent;
      btn.textContent = gradDict[gradLang].statusCopyOk;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    },
    () => {
      const btn = document.getElementById('btnCopy');
      const originalText = btn.textContent;
      btn.textContent = gradDict[gradLang].statusCopyFail;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  );
}

function gradInitTool() {
  gradApplyLang();

  // Color picker events - sync to hex input
  document.getElementById('color1').addEventListener('input', () => {
    syncColorPickerToHex('color1', 'color1Hex');
    gradUpdate();
    gradUpdateCodeSamples();
  });
  document.getElementById('color2').addEventListener('input', () => {
    syncColorPickerToHex('color2', 'color2Hex');
    gradUpdate();
    gradUpdateCodeSamples();
  });
  
  // Hex input events - validate and update color picker
  const color1Hex = document.getElementById('color1Hex');
  const color2Hex = document.getElementById('color2Hex');
  
  if (color1Hex) {
    color1Hex.addEventListener('input', () => {
      updateColorFromHex('color1Hex', 'color1');
    });
    color1Hex.addEventListener('paste', (e) => {
      setTimeout(() => {
        updateColorFromHex('color1Hex', 'color1');
      }, 10);
    });
  }
  
  if (color2Hex) {
    color2Hex.addEventListener('input', () => {
      updateColorFromHex('color2Hex', 'color2');
    });
    color2Hex.addEventListener('paste', (e) => {
      setTimeout(() => {
        updateColorFromHex('color2Hex', 'color2');
      }, 10);
    });
  }
  document.getElementById('direction').addEventListener('change', () => {
    gradUpdate();
    gradUpdateCodeSamples();
  });
  document.getElementById('btnCopy').addEventListener('click', gradCopy);
  
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
        
        // Update active tab
        codeTabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        // Update active code block
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
  
  // Sync hex inputs with color pickers on init
  syncColorPickerToHex('color1', 'color1Hex');
  syncColorPickerToHex('color2', 'color2Hex');
  
  gradUpdate();
  gradUpdateCodeSamples();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', gradInitTool);
} else {
  gradInitTool();
}
