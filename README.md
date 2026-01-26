# VeilCrawler

轻量可视化 Web 数据采集 Chrome 扩展

## 功能

- 🎯 可视化元素选择 - 点击页面元素自动生成 CSS 选择器
- 📋 任务管理 - 创建和管理多个采集任务
- 🔄 翻页支持 - 滚动加载 / 点击翻页
- 👁️ 实时预览 - 即时查看采集效果

## 开发

```bash
# 安装依赖
pnpm install

# 构建扩展
pnpm build

# 监听模式开发
pnpm dev
```

## 安装扩展

1. 运行 `pnpm build`
2. 打开 Chrome，访问 `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `dist` 文件夹

## 使用

1. 点击扩展图标打开面板
2. 点击「开始采集」进入选择模式
3. 在页面上点击要采集的元素
4. 在配置面板中调整字段名
5. 点击「运行采集」

## 项目结构

```
src/
├── popup/          # 扩展弹窗界面
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── content/        # 内容脚本 (元素选择/高亮)
│   └── index.ts
├── utils/          # 工具函数
├── types.ts        # 类型定义
└── manifest.json   # 扩展配置
```
