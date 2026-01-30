import { getSmartSelector, getSmartXPath, getElementRect, evaluateXPath } from '../utils/domUtils';
import type { SelectorRule } from '../types';

// ============ 采集状态持久化 ============

interface InterceptState {
  enabled: boolean;
  pattern: string;
}

const saveInterceptState = async (enabled: boolean, pattern: string) => {
  await chrome.storage.local.set({ 
    _interceptState: { enabled, pattern } 
  });
};

const getInterceptState = async (): Promise<InterceptState | null> => {
  const result = await chrome.storage.local.get(['_interceptState']);
  return result._interceptState || null;
};

interface CollectState {
  isRunning: boolean;
  taskId: string;
  rules: SelectorRule[];
  config: any;
  collectedData: Record<string, string>[];
  currentUrl: string;
  startTime: number;
}

const saveCollectState = async (state: CollectState | null) => {
  if (state) {
    await chrome.storage.local.set({ _collectState: state });
  } else {
    await chrome.storage.local.remove(['_collectState']);
  }
};

const getCollectState = async (): Promise<CollectState | null> => {
  const result = await chrome.storage.local.get(['_collectState']);
  return result._collectState || null;
};

// ============ 网络请求拦截 ============

let interceptorInjected = false;

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

// 注入拦截器脚本（只在需要时注入）
const injectInterceptor = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (interceptorInjected) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('interceptor.js');
    script.onload = () => {
      script.remove();
      interceptorInjected = true;
      resolve();
    };
    script.onerror = () => reject(new Error('拦截器脚本加载失败'));
    
    const parent = document.head || document.documentElement;
    if (parent) {
      parent.appendChild(script);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement).appendChild(script);
      }, { once: true });
    }
  });
};

// 初始化消息监听
const initNetworkInterceptor = () => {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data?.type === 'VEIL_CRAWLER_INTERCEPTED') {
      const { id, method, url, status, responseData } = event.data;
      
      if (interceptedRequests.some(r => r.id === id)) return;
      
      const request: InterceptedRequest = {
        id, method, url, type: 'fetch', status, responseData,
        timestamp: Date.now()
      };
      interceptedRequests.push(request);
      
      if (interceptedRequests.length > 100) interceptedRequests.shift();
      
      chrome.runtime.sendMessage({
        type: 'JSON_INTERCEPTED',
        data: responseData,
        request: { id, method, url, status }
      }).catch(() => {});
    }
  });
};

let interceptStatusEl: HTMLDivElement | null = null;

const updateInterceptStatus = (enabled: boolean) => {
  if (enabled) {
    if (!interceptStatusEl) {
      interceptStatusEl = document.createElement('div');
      interceptStatusEl.style.cssText = `
        position: fixed; bottom: 10px; right: 10px; z-index: 2147483647;
        background: rgba(0, 0, 0, 0.8); color: white; padding: 6px 12px;
        border-radius: 4px; font-size: 12px; font-family: sans-serif;
        display: flex; items-center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;
      
      const text = document.createElement('span');
      text.textContent = 'VeilCrawler 拦截中...';
      
      const stopBtn = document.createElement('button');
      stopBtn.textContent = '停止';
      stopBtn.style.cssText = `
        background: #ef4444; border: none; border-radius: 2px;
        color: white; padding: 2px 6px; cursor: pointer; font-size: 10px;
      `;
      stopBtn.onclick = () => {
        setInterceptPattern('', false);
        saveInterceptState(false, '');
        // 通知 sidepanel 更新状态
        chrome.runtime.sendMessage({
          type: 'SET_INTERCEPT_URL',
          url: '',
          enabled: false,
          _fromContentScript: true // 标记来源，防止循环
        }).catch(() => {});
      };
      
      interceptStatusEl.appendChild(text);
      interceptStatusEl.appendChild(stopBtn);
      document.body.appendChild(interceptStatusEl);
    }
    interceptStatusEl.style.display = 'flex';
  } else {
    if (interceptStatusEl) {
      interceptStatusEl.style.display = 'none';
    }
  }
};

// 设置拦截模式
const setInterceptPattern = async (pattern: string, enabled: boolean = true) => {
  if (enabled && pattern) {
    try {
      await injectInterceptor();
      window.postMessage({ type: 'VEIL_CRAWLER_SET_PATTERN', pattern, enabled: true }, '*');
      updateInterceptStatus(true);
    } catch {}
  } else if (interceptorInjected) {
    window.postMessage({ type: 'VEIL_CRAWLER_SET_PATTERN', pattern: '', enabled: false }, '*');
    updateInterceptStatus(false);
  }
};

initNetworkInterceptor();

const initInterceptorState = async () => {
  const state = await getInterceptState();
  if (state && state.enabled) {
    setInterceptPattern(state.pattern, true);
  }
};

initInterceptorState();

// ============ 元素选择功能 ============

let isSelecting = false;
let highlightEl: HTMLDivElement | null = null;
let labelEl: HTMLDivElement | null = null;

const createHighlighter = () => {
  if (highlightEl || !document.body) return;

  highlightEl = document.createElement('div');
  highlightEl.id = 'veil-crawler-highlight';
  highlightEl.style.cssText = `
    position: fixed; pointer-events: none; border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1); z-index: 2147483647;
    transition: all 0.05s ease-out; display: none;
  `;

  labelEl = document.createElement('div');
  labelEl.style.cssText = `
    position: absolute; top: -24px; left: 0; background: #3b82f6;
    color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px;
    font-family: monospace; white-space: nowrap; max-width: 200px;
    overflow: hidden; text-overflow: ellipsis;
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
  if (highlightEl) highlightEl.style.display = 'none';
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isSelecting) return;
  const target = e.target as HTMLElement;
  if (target.id === 'veil-crawler-highlight' || target.closest('#veil-crawler-highlight')) return;
  updateHighlight(target);
};

const handleClick = (e: MouseEvent) => {
  if (!isSelecting) return;
  const target = e.target as HTMLElement;
  if (target.id === 'veil-crawler-highlight' || target.closest('#veil-crawler-highlight')) return;

  e.preventDefault();
  e.stopPropagation();

  chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    data: {
      selector: getSmartSelector(target),
      xpath: getSmartXPath(target),
      text: target.innerText?.slice(0, 100) || ''
    }
  });
};

const queryElements = (selector: string, selectorType: 'css' | 'xpath' = 'css'): HTMLElement[] => {
  if (selectorType === 'xpath') return evaluateXPath(selector);
  try {
    return Array.from(document.querySelectorAll(selector)) as HTMLElement[];
  } catch {
    return [];
  }
};

const extractPreviewData = (rules: SelectorRule[]) => {
  if (rules.length === 0) return [];

  const columns = rules.map(rule => {
    const elements = queryElements(rule.selector, rule.selectorType || 'css');
    const values = elements.map(el => {
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
    columns.forEach(col => { row[col.field] = col.values[i] || ''; });
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
};

const stopSelecting = () => {
  if (!isSelecting) return;
  isSelecting = false;
  hideHighlight();
  removeHighlighter();
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
};

const isUrlMatch = (pattern: string, url: string) => {
  if (!pattern) return true;
  try {
    if (pattern.includes('*')) {
      const regexStr = pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      return new RegExp(regexStr).test(url);
    }
    return url.includes(pattern);
  } catch {
    return url.includes(pattern);
  }
};

// ============ 采集任务 ============

let isRunning = false;
let stopRequested = false;

const runJsonCollectTask = async (rules: SelectorRule[], jsonData: any, config: any) => {
  isRunning = true;
  stopRequested = false;
  
  const extractDataFromJson = (data: any): Record<string, string>[] => {
    let dataArray: any[] = [];
    
    if (rules.length > 0) {
      const firstPath = rules[0].selector;
      const arrayMatch = firstPath.match(/^(.+?)\[\*\]/);
      if (arrayMatch) {
        const pathParts = arrayMatch[1].split('.').filter(p => p !== '');
        let current = data;
        for (const part of pathParts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            current = null;
            break;
          }
        }
        if (Array.isArray(current)) dataArray = current;
      }
    }
    
    if (dataArray.length === 0 && Array.isArray(data)) dataArray = data;
    
    if (dataArray.length === 0 && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          dataArray = data[key];
          break;
        }
      }
    }
    
    const result: Record<string, string>[] = [];
    for (const item of dataArray) {
      const row: Record<string, string> = {};
      for (const rule of rules) {
        let relativePath = rule.selector;
        const arrayMatch = rule.selector.match(/\[\*\]\.?(.*)$/);
        if (arrayMatch) relativePath = arrayMatch[1];
        
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
      result.push(row);
    }
    return result;
  };

  const allData: Record<string, string>[] = [];
  const uniqueKeys = rules.filter(r => r.isUniqueKey).map(r => r.fieldName);
  const seenKeys = new Set<string>();
  const maxItems = config.maxItems || 0;
  let noNewDataCount = 0;
  let processedRequestIds = new Set<string>();

  // 处理初始数据
  const initialData = extractDataFromJson(jsonData);
  const shouldDeduplicate = config.deduplicate !== false;
  
  initialData.forEach(row => {
    if (maxItems > 0 && allData.length >= maxItems) return;
    if (shouldDeduplicate) {
      const key = uniqueKeys.length > 0 
        ? uniqueKeys.map(k => row[k]).join('|') 
        : Object.values(row).join('|');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allData.push(row);
      }
    } else {
      allData.push(row);
    }
  });

  // 记录已处理的请求
  if (interceptedRequests.length > 0) {
    processedRequestIds.add(interceptedRequests[interceptedRequests.length - 1].id);
  }

  chrome.runtime.sendMessage({ type: 'COLLECT_PROGRESS', data: allData }).catch(() => {});

  // 如果没有翻页，直接返回
  if (config.paginationType === 'none' || !config.paginationType) {
    isRunning = false;
    chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: allData }).catch(() => {});
    return;
  }

  // 翻页采集
  const waitForNewRequest = (timeout: number = 5000): Promise<InterceptedRequest | null> => {
    return new Promise(resolve => {
      const startTime = Date.now();
      const check = () => {
        // 查找新的未处理请求，且 URL 匹配
        const newRequest = interceptedRequests.find(r => 
          !processedRequestIds.has(r.id) && 
          isUrlMatch(config.interceptUrl || '', r.url)
        );
        if (newRequest) {
          resolve(newRequest);
          return;
        }
        if (Date.now() - startTime >= timeout) {
          resolve(null);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  };

  const scrollToLoadMore = async () => {
    const totalHeight = document.body.scrollHeight;
    const currentScroll = window.scrollY;
    const step = Math.max(100, (totalHeight - currentScroll) / 5);
    
    // 分步滚动以触发事件
    for (let s = currentScroll; s < totalHeight; s += step) {
      window.scrollTo(0, s);
      await new Promise(r => setTimeout(r, 50));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 1000));
  };

  const clickNextPage = async (selector: string) => {
    try {
      const btn = document.querySelector(selector) as HTMLElement;
      if (btn) {
        const isDisabled = btn.hasAttribute('disabled') || 
                          btn.classList.contains('disabled') ||
                          btn.getAttribute('aria-disabled') === 'true';
        if (isDisabled) return false;
        btn.click();
        return true;
      }
    } catch {}
    return false;
  };

  // 翻页循环
  while (!stopRequested) {
    if (maxItems > 0 && allData.length >= maxItems) break;
    if (noNewDataCount >= 3) break;

    // 执行翻页操作
    if (config.paginationType === 'scroll') {
      await scrollToLoadMore();
    } else if (config.paginationType === 'click' && config.nextPageSelector) {
      const hasNext = await clickNextPage(config.nextPageSelector);
      if (!hasNext) break;
    } else {
      break;
    }

    // 等待新请求
    const newRequest = await waitForNewRequest(config.pageInterval || 5000);
    if (!newRequest || !newRequest.responseData) {
      noNewDataCount++;
      continue;
    }

    processedRequestIds.add(newRequest.id);
    const previousCount = allData.length;
    const pageData = extractDataFromJson(newRequest.responseData);

    pageData.forEach(row => {
      if (maxItems > 0 && allData.length >= maxItems) return;
      if (shouldDeduplicate) {
        const key = uniqueKeys.length > 0 
          ? uniqueKeys.map(k => row[k]).join('|') 
          : Object.values(row).join('|');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allData.push(row);
        }
      } else {
        allData.push(row);
      }
    });

    chrome.runtime.sendMessage({ type: 'COLLECT_PROGRESS', data: allData }).catch(() => {});

    if (allData.length === previousCount) {
      noNewDataCount++;
    } else {
      noNewDataCount = 0;
    }
  }

  isRunning = false;
  chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: allData }).catch(() => {});
};

const runCollectTask = async (rules: SelectorRule[], config: any, resumeData: Record<string, string>[] = []) => {
  if (config.sourceType === 'json') {
    const latestRequest = interceptedRequests[interceptedRequests.length - 1];
    if (latestRequest?.responseData) {
      await runJsonCollectTask(rules, latestRequest.responseData, config);
    } else {
      chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: [] }).catch(() => {});
    }
    return;
  }
  
  isRunning = true;
  stopRequested = false;
  
  const allData: Record<string, string>[] = [...resumeData];
  const uniqueKeys = rules.filter(r => r.isUniqueKey).map(r => r.fieldName);
  const seenKeys = new Set<string>(resumeData.map(r => {
    return uniqueKeys.length > 0 ? uniqueKeys.map(k => r[k]).join('|') : Object.values(r).join('|');
  }));
  const maxItems = config.maxItems || 0;
  let noNewDataCount = 0;
  
  const collectCurrentPage = () => {
    const columns = rules.map(rule => {
      const elements = queryElements(rule.selector, rule.selectorType || 'css');
      const values = elements.map(el => {
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
      columns.forEach(col => { row[col.field] = col.values[i] || ''; });
      rows.push(row);
    }
    return rows;
  };

  const domReadyTimeout = 10000;

  const waitForReady = (oldContent: string = ''): Promise<void> => {
    if (config.pageInterval && config.pageInterval > 0) {
      return new Promise(resolve => setTimeout(resolve, config.pageInterval));
    }

    return new Promise(resolve => {
      const startTime = Date.now();
      const check = () => {
        if (rules.length > 0) {
          const rule = rules[0];
          const elements = queryElements(rule.selector, rule.selectorType || 'css');
          if (elements.length > 0) {
            const content = elements[0]?.innerText || '';
            if (!oldContent || content !== oldContent) {
              resolve();
              return;
            }
          }
        }
        if (Date.now() - startTime >= domReadyTimeout) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  };

  const getFirstContent = (): string => {
    if (rules.length === 0) return '';
    const rule = rules[0];
    const elements = queryElements(rule.selector, rule.selectorType || 'css');
    return elements[0]?.innerText || '';
  };

  const scrollToLoadMore = async () => {
    const previousHeight = document.body.scrollHeight;
    const oldContent = getFirstContent();
    window.scrollTo(0, document.body.scrollHeight);
    await waitForReady(oldContent);
    return document.body.scrollHeight > previousHeight;
  };

  const clickNextPage = async (selector: string) => {
    try {
      const btn = document.querySelector(selector) as HTMLElement;
      if (btn) {
        const isDisabled = btn.hasAttribute('disabled') || 
                          btn.classList.contains('disabled') ||
                          btn.getAttribute('aria-disabled') === 'true' ||
                          (btn as HTMLButtonElement).disabled;
        if (isDisabled) return false;
        
        const oldContent = getFirstContent();
        btn.click();
        await waitForReady(oldContent);
        return true;
      }
    } catch {}
    return false;
  };

  do {
    if (stopRequested) break;

    const previousCount = allData.length;
    const pageData = collectCurrentPage();
    
    const shouldDeduplicate = config.deduplicate !== false;
    const uniqueKeys = rules.filter(r => r.isUniqueKey).map(r => r.fieldName);
    
    pageData.forEach(row => {
      if (maxItems > 0 && allData.length >= maxItems) return;
      
      if (shouldDeduplicate) {
        const key = uniqueKeys.length > 0 
          ? uniqueKeys.map(k => row[k]).join('|') 
          : Object.values(row).join('|');
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allData.push(row);
        }
      } else {
        allData.push(row);
      }
    });

    chrome.runtime.sendMessage({ type: 'COLLECT_PROGRESS', data: allData }).catch(() => {});

    if (allData.length === previousCount) {
      noNewDataCount++;
    } else {
      noNewDataCount = 0;
    }

    if (maxItems > 0 && allData.length >= maxItems) {
      saveCollectState(null);
      break;
    }

    if (noNewDataCount >= 3) {
      saveCollectState(null);
      break;
    }

    if (config.paginationType === 'scroll') {
      const hasMore = await scrollToLoadMore();
      if (!hasMore) {
        saveCollectState(null);
        break;
      }
    } else if (config.paginationType === 'click' && config.nextPageSelector) {
      const urlBeforeClick = window.location.href;
      
      saveCollectState({
        isRunning: true,
        taskId: config.id || '',
        rules, config,
        collectedData: allData,
        currentUrl: urlBeforeClick,
        startTime: Date.now()
      });
      
      const hasNext = await clickNextPage(config.nextPageSelector);
      if (!hasNext) {
        saveCollectState(null);
        break;
      }
      
      if (window.location.href === urlBeforeClick) {
        saveCollectState(null);
      }
    } else {
      break;
    }

  } while (!stopRequested);

  isRunning = false;
  saveCollectState(null);
  chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: allData }).catch(() => {});
};

// ============ 消息监听 ============

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_SELECTING':
      startSelecting();
      break;
    case 'STOP_SELECTING':
      stopSelecting();
      break;
    case 'GET_PREVIEW':
      chrome.runtime.sendMessage({ type: 'PREVIEW_DATA', data: extractPreviewData(message.rules) });
      break;
    case 'RUN_TASK':
      if (!isRunning) runCollectTask(message.rules, message.config);
      break;
    case 'STOP_TASK':
      stopRequested = true;
      break;
    case 'SET_INTERCEPT_URL':
      setInterceptPattern(message.url || '', message.enabled === true);
      saveInterceptState(message.enabled === true, message.url || '');
      if (!message.enabled) interceptedRequests.length = 0;
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

// ============ 页面加载时恢复采集 ============

const checkAndResumeCollect = async () => {
  const state = await getCollectState();
  if (!state || !state.isRunning) return;
  
  if (Date.now() - state.startTime > 5 * 60 * 1000) {
    await saveCollectState(null);
    return;
  }
  
  chrome.runtime.sendMessage({
    type: 'COLLECT_RESUMED',
    data: state.collectedData,
    taskId: state.taskId
  }).catch(() => {});
  
  const domReadyTimeout = 10000;
  await new Promise<void>(resolve => {
    const startTime = Date.now();
    const check = () => {
      if (state.rules.length > 0) {
        const rule = state.rules[0];
        const elements = rule.selectorType === 'xpath' 
          ? evaluateXPath(rule.selector)
          : Array.from(document.querySelectorAll(rule.selector) || []) as HTMLElement[];
        if (elements.length > 0) {
          resolve();
          return;
        }
      }
      if (Date.now() - startTime >= domReadyTimeout) {
        resolve();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
  
  runCollectTask(state.rules, state.config, state.collectedData);
};

if (document.readyState === 'complete') {
  checkAndResumeCollect();
} else {
  window.addEventListener('load', checkAndResumeCollect);
}
