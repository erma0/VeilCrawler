import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';

const copyFiles = () => ({
  name: 'copy-files',
  closeBundle() {
    const outDir = 'dist';
    
    // 复制 manifest
    fs.copyFileSync('src/manifest.json', resolve(outDir, 'manifest.json'));
    
    // 移动 popup.html 到根目录
    const srcHtml = resolve(outDir, 'src/popup/index.html');
    const destHtml = resolve(outDir, 'popup.html');
    if (fs.existsSync(srcHtml)) {
      let html = fs.readFileSync(srcHtml, 'utf-8');
      // 修复资源路径为相对路径
      html = html.replace(/src="\/popup\.js"/g, 'src="./popup.js"');
      html = html.replace(/href="\/popup\.css"/g, 'href="./popup.css"');
      fs.writeFileSync(destHtml, html);
      // 删除原目录
      fs.rmSync(resolve(outDir, 'src'), { recursive: true, force: true });
    }
    
    // 创建 icons 目录并复制图标
    const iconsDir = resolve(outDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }
    
    const sizes = [16, 48, 128];
    const placeholderPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0x38, 0x68, 0xD0, 0x00,
      0x00, 0x00, 0x83, 0x00, 0x81, 0x79, 0xB1, 0xAA,
      0x9A, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    sizes.forEach(size => {
      const customPath = resolve('assets', `icon${size}.png`);
      const destPath = resolve(iconsDir, `icon${size}.png`);
      if (fs.existsSync(customPath)) {
        fs.copyFileSync(customPath, destPath);
      } else if (!fs.existsSync(destPath)) {
        fs.writeFileSync(destPath, placeholderPng);
      }
    });
    
    console.log('\n✅ 扩展构建完成! 输出目录: dist/');
    console.log('   Chrome 加载: chrome://extensions -> 开发者模式 -> 加载已解压的扩展程序\n');
  }
});

export default defineConfig({
  plugins: [react(), copyFiles()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        content: resolve(__dirname, 'src/content/index.ts'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'content') return 'content.js';
          if (chunk.name === 'background') return 'background.js';
          return 'popup.js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: (asset) => {
          if (asset.name?.endsWith('.css')) return 'popup.css';
          return '[name][extname]';
        }
      }
    }
  }
});
