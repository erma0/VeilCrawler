import { getSmartSelector, getSmartXPath, getElementRect, evaluateXPath } from '../utils/domUtils';
import type { SelectorRule } from '../types';

let isSelecting = false;
let highlightEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;

// ============ 采集状态持久化 ============

interface CollectState {
  isRunning: boolean;
  taskId: string;
  rules: SelectorRule[];
  config: any;
  collectedData: Record<string, string>[];
  currentUrl: string;
  startTime: number;
}

// 保存采集状态
const saveCollectState = async (state: CollectState | null) => {
  if (state) {
    await chrome.storage.local.set({ _collectState: state });
  } else {
    await chrome.storage.local.remove(['_collectState']);
  }
};

// 获取采集状态
const getCollectState = async (): Promise<CollectState | null> => {
  const result = await chrome.storage.local.get(['_collectState']);
  return result._collectState || null;
};

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

// 初始化网络拦截（通过外部脚本注入到页面上下文）
const initNetworkInterceptor = () => {
  // 监听来自注入脚本的消息
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'VEIL_CRAWLER_INTERCEPTED') {
      const { id, method, url, status, responseData } = event.data;
      
      const request: InterceptedRequest = {
        id,
        method,
        url,
        type: 'fetch',
        status,
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
      
      console.log('VeilCrawler intercepted:', url);
    }
  });

  // 使用外部脚本文件注入，避免 CSP 问题
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('interceptor.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
};

// 设置拦截 URL 模式
const setInterceptPattern = (pattern: string) => {
  interceptUrlPattern = pattern;
  // 通知注入的脚本更新模式
  window.postMessage({
    type: 'VEIL_CRAWLER_SET_PATTERN',
    pattern
  }, '*');
};

// 初始化拦截器
try {
  initNetworkInterceptor();
} catch (e) {
  console.warn('VeilCrawler: 网络拦截器初始化失败', e);
}

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

  const cssSelector = getSmartSelector(target);
  const xpath = getSmartXPath(target);
  const text = target.innerText?.slice(0, 100) || '';

  chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    data: { selector: cssSelector, xpath, text }
  });
};

/**
 * 根据选择器类型查询元素
 */
const queryElements = (selector: string, selectorType: 'css' | 'xpath' = 'css'): HTMLElement[] => {
  if (selectorType === 'xpath') {
    return evaluateXPath(selector);
  }
  try {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  } catch {
    return [];
  }
};

const extractPreviewData = (rules: SelectorRule[]) => {
  if (rules.length === 0) return [];

  const columns = rules.map(rule => {
    const selectorType = rule.selectorType || 'css';
    const elements = queryElements(rule.selector, selectorType);

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

  for (let i = 0; i < maxRows; i++) {
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

// ============ 采集任务 ============

let isRunning = false;
let stopRequested = false;

// 从 JSON 数据中根据路径提取值
const extractJsonValue = (data: any, path: string): any[] => {
  // 处理通配符路径，如 "data[*].name"
  const parts = path.split(/\.|\[|\]/).filter(p => p !== '');
  
  const extract = (obj: any, pathParts: string[]): any[] => {
    if (pathParts.length === 0) return [obj];
    
    const [current, ...rest] = pathParts;
    
    if (current === '*') {
      // 通配符，遍历数组
      if (Array.isArray(obj)) {
        return obj.flatMap(item => extract(item, rest));
      }
      return [];
    }
    
    if (obj && typeof obj === 'object' && current in obj) {
      return extract(obj[current], rest);
    }
    
    return [];
  };
  
  return extract(data, parts);
};

// JSON 数据采集
const runJsonCollectTask = async (rules: SelectorRule[], jsonData: any) => {
  isRunning = true;
  stopRequested = false;
  
  // 找到数组数据的根路径
  let dataArray: any[] = [];
  
  // 尝试从第一个规则推断数据数组
  if (rules.length > 0) {
    const firstPath = rules[0].selector;
    // 找到 [*] 之前的路径作为数组根
    const arrayMatch = firstPath.match(/^(.+?)\[\*\]/);
    if (arrayMatch) {
      const arrayPath = arrayMatch[1];
      const pathParts = arrayPath.split('.').filter(p => p !== '');
      let current = jsonData;
      for (const part of pathParts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          current = null;
          break;
        }
      }
      if (Array.isArray(current)) {
        dataArray = current;
      }
    }
  }
  
  // 如果没找到数组，尝试直接使用 jsonData
  if (dataArray.length === 0 && Array.isArray(jsonData)) {
    dataArray = jsonData;
  }
  
  // 如果还是没有，尝试找第一个数组属性
  if (dataArray.length === 0 && typeof jsonData === 'object') {
    for (const key of Object.keys(jsonData)) {
      if (Array.isArray(jsonData[key])) {
        dataArray = jsonData[key];
        break;
      }
    }
  }
  
  const allData: Record<string, string>[] = [];
  
  // 遍历数组提取数据
  for (const item of dataArray) {
    if (stopRequested) break;
    
    const row: Record<string, string> = {};
    for (const rule of rules) {
      // 获取相对路径（去掉数组根路径）
      let relativePath = rule.selector;
      const arrayMatch = rule.selector.match(/\[\*\]\.?(.*)$/);
      if (arrayMatch) {
        relativePath = arrayMatch[1];
      }
      
      // 提取值
      const pathParts = relativePath.split('.').filter(p => p !== '');
      let value: any = item;
      for (const part of pathParts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          value = '';
          break;
        }
      }
      
      row[rule.fieldName] = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    }
    allData.push(row);
  }
  
  isRunning = false;
  
  // 发送结果
  chrome.runtime.sendMessage({
    type: 'COLLECT_RESULT',
    data: allData
  }).catch(() => {});
  
  console.log('VeilCrawler JSON 采集完成:', allData.length, '条数据');
};

const runCollectTask = async (rules: SelectorRule[], config: any, resumeData: Record<string, string>[] = []) => {
  // 判断是 DOM 还是 JSON 采集
  if (config.sourceType === 'json') {
    // JSON 采集需要从拦截的数据中获取
    const latestRequest = interceptedRequests[interceptedRequests.length - 1];
    if (latestRequest?.responseData) {
      await runJsonCollectTask(rules, latestRequest.responseData);
    } else {
      chrome.runtime.sendMessage({
        type: 'COLLECT_RESULT',
        data: []
      }).catch(() => {});
    }
    return;
  }
  
  // DOM 采集逻辑
  isRunning = true;
  stopRequested = false;
  
  // 如果有恢复的数据，使用它
  const allData: Record<string, string>[] = [...resumeData];
  const maxItems = config.maxItems || 0; // 0 表示不限制
  let noNewDataCount = 0; // 连续无新数据计数
  
  console.log(`VeilCrawler: 开始采集，已有 ${allData.length} 条数据`);
  
  // 采集当前页面数据
  const collectCurrentPage = () => {
    const columns = rules.map(rule => {
      const selectorType = rule.selectorType || 'css';
      const elements = queryElements(rule.selector, selectorType);
      
      console.log(`VeilCrawler: 规则 ${rule.fieldName} 匹配到 ${elements.length} 个元素`);

      const values = elements.map(el => {
        if (rule.attribute === 'href') return (el as HTMLAnchorElement).href || '';
        if (rule.attribute === 'src') return (el as HTMLImageElement).src || '';
        if (rule.attribute === 'innerHTML') return el.innerHTML;
        return el.innerText || '';
      });

      return { field: rule.fieldName, values };
    });

    const maxRows = Math.max(...columns.map(c => c.values.length), 0);
    console.log(`VeilCrawler: 当前页采集到 ${maxRows} 条数据`);
    
    const rows: Record<string, string>[] = [];

    for (let i = 0; i < maxRows; i++) {
      const row: Record<string, string> = {};
      columns.forEach(col => {
        row[col.field] = col.values[i] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  // 滚动翻页
  const scrollToLoadMore = async () => {
    const previousHeight = document.body.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 2000));
    return document.body.scrollHeight > previousHeight;
  };

  // 等待 DOM 变化
  const waitForDomChange = (timeout = 3000): Promise<boolean> => {
    return new Promise(resolve => {
      let resolved = false;
      const observer = new MutationObserver(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          // 再等待一下确保渲染完成
          setTimeout(() => resolve(true), 500);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 超时
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve(false);
        }
      }, timeout);
    });
  };

  // 点击翻页
  const clickNextPage = async (selector: string) => {
    try {
      const btn = document.querySelector(selector) as HTMLElement;
      if (btn) {
        // 检查按钮是否可点击
        const isDisabled = btn.hasAttribute('disabled') || 
                          btn.classList.contains('disabled') ||
                          btn.getAttribute('aria-disabled') === 'true' ||
                          (btn as HTMLButtonElement).disabled;
        if (isDisabled) return false;
        
        // 记录点击前的数据
        const beforeClick = collectCurrentPage();
        
        btn.click();
        
        // 等待 DOM 变化或超时
        await waitForDomChange(5000);
        
        // 额外等待确保页面稳定
        await new Promise(r => setTimeout(r, 1000));
        
        return true;
      }
    } catch (e) {
      console.error('VeilCrawler: 点击翻页失败', e);
    }
    return false;
  };

  // 采集逻辑
  do {
    if (stopRequested) break;

    const previousCount = allData.length;
    const pageData = collectCurrentPage();
    
    // 去重添加
    pageData.forEach(row => {
      // 检查是否达到数量限制
      if (maxItems > 0 && allData.length >= maxItems) return;
      
      const key = JSON.stringify(row);
      if (!allData.some(d => JSON.stringify(d) === key)) {
        allData.push(row);
      }
    });

    // 发送进度
    chrome.runtime.sendMessage({
      type: 'COLLECT_PROGRESS',
      data: allData
    }).catch(() => {});

    // 检查是否有新数据
    if (allData.length === previousCount) {
      noNewDataCount++;
    } else {
      noNewDataCount = 0;
    }

    // 检查是否达到数量限制
    if (maxItems > 0 && allData.length >= maxItems) {
      console.log('VeilCrawler: 已达到设定的采集数量限制');
      await saveCollectState(null); // 清除状态
      break;
    }

    // 连续3次无新数据则停止
    if (noNewDataCount >= 3) {
      console.log('VeilCrawler: 连续无新数据，采集完成');
      await saveCollectState(null); // 清除状态
      break;
    }

    // 翻页处理
    if (config.paginationType === 'scroll') {
      const hasMore = await scrollToLoadMore();
      if (!hasMore) {
        console.log('VeilCrawler: 滚动到底，无更多数据');
        await saveCollectState(null); // 清除状态
        break;
      }
    } else if (config.paginationType === 'click' && config.nextPageSelector) {
      // 记录点击前的 URL
      const urlBeforeClick = window.location.href;
      
      // 先保存状态（以防页面跳转）
      await saveCollectState({
        isRunning: true,
        taskId: config.id || '',
        rules,
        config,
        collectedData: allData,
        currentUrl: urlBeforeClick,
        startTime: Date.now()
      });
      
      const hasNext = await clickNextPage(config.nextPageSelector);
      if (!hasNext) {
        console.log('VeilCrawler: 下一页按钮不可用，采集完成');
        await saveCollectState(null); // 清除状态
        break;
      }
      
      // 检查 URL 是否变化（如果没变化，说明是 AJAX 翻页，清除状态）
      if (window.location.href === urlBeforeClick) {
        // AJAX 翻页，不需要保存状态
        await saveCollectState(null);
      }
      // 如果 URL 变了，状态已保存，页面会重新加载并恢复
    } else {
      break; // 无翻页模式，只采集当前页
    }

  } while (!stopRequested);

  isRunning = false;
  await saveCollectState(null); // 清除状态

  // 发送最终结果
  chrome.runtime.sendMessage({
    type: 'COLLECT_RESULT',
    data: allData
  }).catch(() => {});

  console.log('VeilCrawler 采集完成:', allData.length, '条数据');
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
      if (!isRunning) {
        runCollectTask(message.rules, message.config);
      }
      break;
      
    case 'STOP_TASK':
      stopRequested = true;
      break;
      
    case 'SET_INTERCEPT_URL':
      setInterceptPattern(message.url || '');
      // 清空之前的拦截记录
      interceptedRequests.length = 0;
      break;
      
    case 'GET_INTERCEPTED_REQUESTS':
      sendResponse({ requests: interceptedRequests });
      return true;
      
    case 'CLEAR_COLLECT_STATE':
      saveCollectState(null);
      break;
  }

  sendResponse({ success: true });
  return true;
});

// ============ 页面加载时检查是否需要恢复采集 ============

const checkAndResumeCollect = async () => {
  const state = await getCollectState();
  if (!state || !state.isRunning) return;
  
  // 检查状态是否过期（超过 5 分钟）
  if (Date.now() - state.startTime > 5 * 60 * 1000) {
    console.log('VeilCrawler: 采集状态已过期，清除');
    await saveCollectState(null);
    return;
  }
  
  console.log(`VeilCrawler: 检测到未完成的采集任务，已采集 ${state.collectedData.length} 条，继续采集...`);
  
  // 通知 side panel 恢复状态
  chrome.runtime.sendMessage({
    type: 'COLLECT_RESUMED',
    data: state.collectedData,
    taskId: state.taskId
  }).catch(() => {});
  
  // 等待页面完全加载
  await new Promise(r => setTimeout(r, 2000));
  
  // 继续采集
  runCollectTask(state.rules, state.config, state.collectedData);
};

// 页面加载完成后检查
if (document.readyState === 'complete') {
  checkAndResumeCollect();
} else {
  window.addEventListener('load', () => {
    setTimeout(checkAndResumeCollect, 1000);
  });
}

console.log('VeilCrawler content script loaded');
