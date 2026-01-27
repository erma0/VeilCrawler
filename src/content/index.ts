import { getSmartSelector, getElementRect } from '../utils/domUtils';
import type { SelectorRule } from '../types';

let isSelecting = false;
let highlightEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;

// ============ 网络请求拦截 ============

let interceptUrlPattern: string = ''; // 用户设置的拦截 URL 模式

interface InterceptedRequest {
  id: string;
  method: string;
  url: string;
  type: 'xhr' | 'fetch';
  status?: number;
  responseData?: any;
  timestamp: number;
}

const interceptedRequests: InterceptedRequest[] = [];

// 检查 URL 是否匹配拦截模式
const shouldIntercept = (url: string): boolean => {
  if (!interceptUrlPattern) return false;
  
  // 支持简单的通配符匹配
  // 例如: /api/products 会匹配包含该路径的 URL
  // 例如: *.json 会匹配以 .json 结尾的 URL
  try {
    if (interceptUrlPattern.includes('*')) {
      const regex = new RegExp(interceptUrlPattern.replace(/\*/g, '.*'), 'i');
      return regex.test(url);
    }
    return url.toLowerCase().includes(interceptUrlPattern.toLowerCase());
  } catch {
    return url.toLowerCase().includes(interceptUrlPattern.toLowerCase());
  }
};

// 拦截 XHR
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
  (this as any)._veilMethod = method;
  (this as any)._veilUrl = url.toString();
  return originalXHROpen.apply(this, [method, url, ...args] as any);
};

XMLHttpRequest.prototype.send = function(body?: any) {
  const xhr = this;
  const url = (xhr as any)._veilUrl || '';
  
  // 只有匹配拦截模式才处理
  if (shouldIntercept(url)) {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    
    xhr.addEventListener('load', function() {
      try {
        const contentType = xhr.getResponseHeader('content-type') || '';
        if (contentType.includes('application/json') || url.endsWith('.json')) {
          const responseData = JSON.parse(xhr.responseText);
          const request: InterceptedRequest = {
            id,
            method: (xhr as any)._veilMethod || 'GET',
            url,
            type: 'xhr',
            status: xhr.status,
            responseData,
            timestamp: Date.now()
          };
          interceptedRequests.push(request);
          
          chrome.runtime.sendMessage({
            type: 'JSON_INTERCEPTED',
            data: responseData,
            request: {
              id: request.id,
              method: request.method,
              url: request.url,
              status: request.status
            }
          }).catch(() => {});
          
          console.log('VeilCrawler XHR intercepted:', url);
        }
      } catch (e) {
        // 忽略解析错误
      }
    });
  }
  
  return originalXHRSend.apply(this, [body] as any);
};

// 拦截 Fetch
const originalFetch = window.fetch;

window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
  const response = await originalFetch.apply(this, [input, init]);
  
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  
  // 只有匹配拦截模式才处理
  if (shouldIntercept(url)) {
    try {
      const method = init?.method || 'GET';
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json') || url.endsWith('.json')) {
        const clonedResponse = response.clone();
        const responseData = await clonedResponse.json();
        
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        const request: InterceptedRequest = {
          id,
          method,
          url,
          type: 'fetch',
          status: response.status,
          responseData,
          timestamp: Date.now()
        };
        interceptedRequests.push(request);
        
        chrome.runtime.sendMessage({
          type: 'JSON_INTERCEPTED',
          data: responseData,
          request: {
            id: request.id,
            method: request.method,
            url: request.url,
            status: request.status
          }
        }).catch(() => {});
        
        console.log('VeilCrawler Fetch intercepted:', url);
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  return response;
};

// ============ 元素选择功能 ============

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

const removeHighlighter = () => {
  highlightEl?.remove();
  highlightEl = null;
  labelEl = null;
};

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

const hideHighlight = () => {
  if (highlightEl) {
    highlightEl.style.display = 'none';
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isSelecting) return;

  const target = e.target as HTMLElement;
  if (target.id === 'veil-crawler-highlight' || target.closest('#veil-crawler-highlight')) {
    return;
  }

  updateHighlight(target);
};

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

  chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    data: { selector, text }
  });
};

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

const startSelecting = () => {
  if (isSelecting) return;
  isSelecting = true;
  createHighlighter();
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  console.log('VeilCrawler: 选择模式已启动');
};

const stopSelecting = () => {
  if (!isSelecting) return;
  isSelecting = false;
  hideHighlight();
  removeHighlighter();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  console.log('VeilCrawler: 选择模式已停止');
};

// ============ 消息监听 ============

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
      
    case 'SET_INTERCEPT_URL':
      interceptUrlPattern = message.url || '';
      console.log('VeilCrawler: 拦截 URL 设置为:', interceptUrlPattern);
      // 清空之前的拦截记录
      interceptedRequests.length = 0;
      break;
      
    case 'GET_INTERCEPTED_REQUESTS':
      sendResponse({ requests: interceptedRequests });
      return true;
  }

  sendResponse({ success: true });
  return true;
});

console.log('VeilCrawler content script loaded');
