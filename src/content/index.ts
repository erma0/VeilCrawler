import { getSmartSelector, getElementRect } from '../utils/domUtils';
import type { SelectorRule } from '../types';

let isSelecting = false;
let highlightEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;

// 创建高亮元素
const createHighlighter = () => {
  if (highlightEl) return;

  highlightEl = document.createElement('div');
  highlightEl.id = 'veil-crawler-highlight';
  highlightEl.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 2147483647;
    transition: all 0.05s ease-out;
    display: none;
  `;

  labelEl = document.createElement('div');
  labelEl.style.cssText = `
    position: absolute;
    top: -24px;
    left: 0;
    background: #3b82f6;
    color: white;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: monospace;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  highlightEl.appendChild(labelEl);

  document.body.appendChild(highlightEl);
};

// 移除高亮元素
const removeHighlighter = () => {
  highlightEl?.remove();
  highlightEl = null;
  labelEl = null;
};

// 更新高亮位置
const updateHighlight = (el: HTMLElement) => {
  if (!highlightEl || !labelEl) return;

  const rect = getElementRect(el);
  highlightEl.style.display = 'block';
  highlightEl.style.top = `${rect.top}px`;
  highlightEl.style.left = `${rect.left}px`;
  highlightEl.style.width = `${rect.width}px`;
  highlightEl.style.height = `${rect.height}px`;

  labelEl.textContent = getSmartSelector(el);
};

// 隐藏高亮
const hideHighlight = () => {
  if (highlightEl) {
    highlightEl.style.display = 'none';
  }
};

// 鼠标移动处理
const handleMouseMove = (e: MouseEvent) => {
  if (!isSelecting) return;

  const target = e.target as HTMLElement;
  if (target.id === 'veil-crawler-highlight' || target.closest('#veil-crawler-highlight')) {
    return;
  }

  updateHighlight(target);
};

// 点击处理
const handleClick = (e: MouseEvent) => {
  if (!isSelecting) return;

  const target = e.target as HTMLElement;
  if (target.id === 'veil-crawler-highlight' || target.closest('#veil-crawler-highlight')) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const selector = getSmartSelector(target);
  const text = target.innerText?.slice(0, 100) || '';

  // 发送选中的元素信息
  chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    data: { selector, text }
  });
};

// 提取预览数据
const extractPreviewData = (rules: SelectorRule[]) => {
  if (rules.length === 0) return [];

  const columns = rules.map(rule => {
    let elements: NodeListOf<HTMLElement>;
    try {
      elements = document.querySelectorAll(rule.selector);
    } catch {
      return { field: rule.fieldName, values: [] as string[] };
    }

    const values = Array.from(elements).map(el => {
      if (rule.attribute === 'href') return (el as HTMLAnchorElement).href || '';
      if (rule.attribute === 'src') return (el as HTMLImageElement).src || '';
      if (rule.attribute === 'innerHTML') return el.innerHTML;
      return el.innerText || '';
    });

    return { field: rule.fieldName, values };
  });

  const maxRows = Math.max(...columns.map(c => c.values.length), 0);
  const rows: Record<string, string>[] = [];

  for (let i = 0; i < Math.min(maxRows, 10); i++) {
    const row: Record<string, string> = {};
    columns.forEach(col => {
      row[col.field] = col.values[i] || '';
    });
    rows.push(row);
  }

  return rows;
};

// 启动选择模式
const startSelecting = () => {
  if (isSelecting) return;
  isSelecting = true;
  createHighlighter();
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  console.log('VeilCrawler: 选择模式已启动');
};

// 停止选择模式
const stopSelecting = () => {
  if (!isSelecting) return;
  isSelecting = false;
  hideHighlight();
  removeHighlighter();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  console.log('VeilCrawler: 选择模式已停止');
};

// 监听消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('VeilCrawler content received:', message.type);
  
  switch (message.type) {
    case 'START_SELECTING':
      startSelecting();
      break;

    case 'STOP_SELECTING':
      stopSelecting();
      break;

    case 'GET_PREVIEW':
      const data = extractPreviewData(message.rules);
      chrome.runtime.sendMessage({
        type: 'PREVIEW_DATA',
        data
      });
      break;

    case 'RUN_TASK':
      const result = extractPreviewData(message.rules);
      console.log('VeilCrawler 采集结果:', result);
      break;
  }

  sendResponse({ success: true });
  return true;
});

console.log('VeilCrawler content script loaded');
