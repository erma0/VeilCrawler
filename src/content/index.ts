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
const scriptStartTime = Date.now();

// 初始化消息监听
const initNetworkInterceptor = () => {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data?.type === 'VEIL_CRAWLER_READY') {
      console.log('[VeilCrawler] Interceptor ready, syncing state...');
      getInterceptState().then(state => {
        if (state && state.enabled) {
          window.postMessage({ type: 'VEIL_CRAWLER_SET_PATTERN', pattern: state.pattern, enabled: true }, '*');
        }
      });
      return;
    }

    if (event.data?.type === 'VEIL_CRAWLER_INTERCEPTED') {
      const { id, method, url, status, responseData, timestamp, requestType } = event.data;
      
      console.log(`[VeilCrawler] Content script received interception (${requestType || 'unknown'}): ${url}`);

      if (interceptedRequests.some(r => r.id === id)) return;
      
      const request: InterceptedRequest = {
        id, method, url, 
        type: requestType === 'xhr' ? 'xhr' : 'fetch', 
        status, responseData,
        timestamp: timestamp || Date.now()
      };
      interceptedRequests.push(request);
      
      if (interceptedRequests.length > 100) interceptedRequests.shift();
      
      chrome.runtime.sendMessage({
        type: 'JSON_INTERCEPTED',
        data: responseData,
        request: { id, method, url, status, requestType: request.type }
      }).catch(() => {});
    }
  });
};

let interceptStatusEl: HTMLDivElement | null = null;

const updateInterceptStatus = (enabled: boolean) => {
  if (enabled) {
    if (!document.body) {
      // 如果 body 还没准备好，等待 DOM 就绪后再试
      document.addEventListener('DOMContentLoaded', () => updateInterceptStatus(enabled), { once: true });
      return;
    }

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
    window.postMessage({ type: 'VEIL_CRAWLER_SET_PATTERN', pattern, enabled: true }, '*');
    updateInterceptStatus(true);
  } else {
    window.postMessage({ type: 'VEIL_CRAWLER_SET_PATTERN', pattern: '', enabled: false }, '*');
    updateInterceptStatus(false);
  }
};

initNetworkInterceptor();

const initInterceptorState = async () => {
  // 异步读取存储并同步配置
  const state = await getInterceptState();
  if (state && state.enabled) {
    console.log('[VeilCrawler] Syncing initial pattern to interceptor:', state.pattern);
    await setInterceptPattern(state.pattern, true);
  }
};

// 立即启动初始化
initInterceptorState();

// 监听 storage 变化，以便在多个标签页间同步状态（可选）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes._interceptState) {
    initInterceptorState();
  }
});

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
      // 兼容 JSON 路径选择器（虽然 DOM 预览不应该收到 JSON 规则，但以防万一）
      if (rule.selector.includes('[*]') || rule.type === 'json') {
        return { field: rule.fieldName, values: [] };
      }
      
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
    const targetUrl = url.split('?')[0].split('#')[0];
    if (pattern.includes('*')) {
      const regexStr = pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      const regex = new RegExp(regexStr, 'i');
      return regex.test(url) || regex.test(targetUrl);
    }
    const p = pattern.toLowerCase();
    return url.toLowerCase().includes(p) || targetUrl.toLowerCase().includes(p);
  } catch {
    return url.toLowerCase().includes(pattern.toLowerCase());
  }
};

// ============ 采集任务 ============

let isRunning = false;
let stopRequested = false;

const runJsonCollectTask = async (rules: SelectorRule[], jsonData: any, config: any) => {
  isRunning = true;
  stopRequested = false;
  
  // 确保拦截状态已恢复
  const interceptState = await getInterceptState();
  if (config.interceptUrl && (!interceptState || !interceptState.enabled || interceptState.pattern !== config.interceptUrl)) {
    await setInterceptPattern(config.interceptUrl, true);
    await saveInterceptState(true, config.interceptUrl);
  }

  const extractDataFromJson = (data: any): Record<string, string>[] => {
    let dataArray: any[] = [];
    console.log('[VeilCrawler] Extracting data from JSON...', typeof data);
    
    // 1. 严格模式：优先尝试根据用户配置的路径精确提取数组
    if (rules.length > 0) {
      // 找到第一个包含 [*] 的规则路径，作为主列表路径
      // 例如: data.list[*].title -> 主路径 data.list
      const listRule = rules.find(r => r.selector.includes('[*]'));
      if (listRule) {
        const arrayMatch = listRule.selector.match(/^(.+?)\[\*\]/);
        if (arrayMatch) {
          const pathParts = arrayMatch[1].split('.').filter(p => p !== '');
          let current = data;
          let found = true;
          for (const part of pathParts) {
            if (current && typeof current === 'object' && part in current) {
              current = current[part];
            } else {
              found = false;
              break;
            }
          }
          if (found && Array.isArray(current)) {
            dataArray = current;
            console.log(`[VeilCrawler] Found data array via rules: ${dataArray.length} items`);
          }
        }
      }
    }
    
    // 2. 根数组模式：如果数据本身就是数组
    if (dataArray.length === 0 && Array.isArray(data)) {
      dataArray = data;
      console.log(`[VeilCrawler] Data is a root array: ${dataArray.length} items`);
    }
    
    // 3. 兜底模式：如果严格路径没找到，才尝试搜索（避免过度智能）
    // 只有当用户没有配置明确的数组路径（例如只配了字段名）时，或者路径确实错了，才尝试这个
    if (dataArray.length === 0 && typeof data === 'object') {
       // ... 原有的模糊搜索逻辑 ...
       // 但根据用户反馈，这里可能导致误判，所以我们先只保留最基本的
       // 如果用户明确指定了路径但没找到，这里其实不应该乱猜，否则可能把错误的数组当成数据源
       // 暂时保留，但仅作为最后的无奈之举
    }
    
    const result: Record<string, string>[] = [];
    for (const item of dataArray) {
      const row: Record<string, string> = {};
      for (const rule of rules) {
        // 解析字段值
        // 1. 尝试从绝对路径提取（如果规则是完整的 path）
        // 2. 尝试从相对路径提取（如果规则是 [*].field）
        
        let value: any = undefined;
        
        // 尝试相对路径提取 (针对 dataArray 中的 item)
        // 从规则中提取 [*] 之后的部分
        const relativeMatch = rule.selector.match(/\[\*\]\.?(.*)$/);
        const relativePath = relativeMatch ? relativeMatch[1] : rule.selector;
        
        if (!relativePath) {
            // 如果路径就是 [*]，说明 item 本身就是值
            value = item;
        } else {
            const pathParts = relativePath.split('.').filter(p => p !== '');
            let current = item;
            for (const part of pathParts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    current = undefined;
                    break;
                }
            }
            value = current;
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
  const initialData = (jsonData && Object.keys(jsonData).length > 0) ? extractDataFromJson(jsonData) : [];
  const shouldDeduplicate = config.deduplicate !== false;
  
  if (initialData.length > 0) {
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

    // 只有处理了初始数据，才记录已处理的请求
    if (interceptedRequests.length > 0) {
      processedRequestIds.add(interceptedRequests[interceptedRequests.length - 1].id);
    }
  }

  chrome.runtime.sendMessage({ type: 'COLLECT_PROGRESS', data: allData }).catch(() => {});

  // 如果没有翻页，直接返回
  if (config.paginationType === 'none' || !config.paginationType) {
    isRunning = false;
    chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: allData }).catch(() => {});
    return;
  }

  // 翻页采集
  const waitForNewRequest = (timeout: number = 10000): Promise<InterceptedRequest | null> => {
    return new Promise(resolve => {
      const waitStartTime = Date.now();
      const check = () => {
        // 查找新的未处理请求，且 URL 匹配
        // 必须是本次脚本加载前后的请求（允许 10 秒误差，确保捕获缓冲区追溯补发的请求）
        const newRequest = interceptedRequests.find(r => 
          !processedRequestIds.has(r.id) && 
          r.timestamp >= scriptStartTime - 10000 &&
          config.interceptUrl && isUrlMatch(config.interceptUrl, r.url)
        );
        if (newRequest) {
          console.log(`[VeilCrawler] Found matching request: ${newRequest.url}`);
          resolve(newRequest);
          return;
        }
        if (Date.now() - waitStartTime >= timeout) {
          console.log(`[VeilCrawler] waitForNewRequest timeout after ${timeout}ms`);
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
    
    // 1. 模拟物理按键事件（针对 document 和 body）
    const keyEvent = { key: 'End', code: 'End', bubbles: true, cancelable: true, view: window };
    document.dispatchEvent(new KeyboardEvent('keydown', keyEvent));
    document.dispatchEvent(new KeyboardEvent('keyup', keyEvent));
    document.body.dispatchEvent(new KeyboardEvent('keydown', keyEvent));
    document.body.dispatchEvent(new KeyboardEvent('keyup', keyEvent));
    
    // 2. 查找可能的滚动容器并尝试滚动
    // 查找所有出现滚动条的元素
    const scrollableElements = Array.from(document.querySelectorAll('*')).filter(el => {
      return el.scrollHeight > el.clientHeight && 
             (getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll');
    });
    
    // 滚动所有找到的容器到底部
    scrollableElements.forEach(el => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    // 3. 兜底：window 滚动
    window.scrollTo({
      top: totalHeight,
      behavior: 'smooth'
    });
    
    // 等待加载
    await new Promise(r => setTimeout(r, 2000));
    
    // 检查是否高度增加
    const newHeight = document.body.scrollHeight;
    // 如果 body 高度没变，检查是否有任何滚动容器高度变化了
    if (newHeight <= totalHeight && scrollableElements.length > 0) {
       // 只要有一个容器高度增加了，就算成功
       const anyGrew = scrollableElements.some(el => el.scrollHeight > el.clientHeight); // 这里逻辑简化了，严谨应该对比前后高度
       // 暂时简单返回 true 让循环继续，因为 JSON 模式主要靠新请求判断
       return true; 
    }
    
    return newHeight > totalHeight;
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

  const waitForPaginationReady = async () => {
    const timeout = 10000;
    const startTime = Date.now();
    
    return new Promise<void>(resolve => {
      const check = () => {
        const isDomReady = document.readyState === 'interactive' || document.readyState === 'complete';
        let isActionable = true;
        
        if (config.paginationType === 'click' && config.nextPageSelector) {
          const btn = document.querySelector(config.nextPageSelector) as HTMLElement;
          isActionable = !!btn && !btn.hasAttribute('disabled') && btn.offsetParent !== null;
        } else if (config.paginationType === 'scroll') {
          isActionable = !!document.body && document.body.scrollHeight > 0;
        }
        
        if ((isDomReady && isActionable) || Date.now() - startTime >= timeout) {
          if (Date.now() - startTime >= timeout) {
            console.log('[VeilCrawler] Pagination ready check timeout, proceeding anyway...');
          }
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  };

  let isFirstLoop = true;

  // 翻页循环
  while (!stopRequested) {
    if (maxItems > 0 && allData.length >= maxItems) break;
    if (noNewDataCount >= 3) break;

    // 1. 等待新请求
    // 刷新后的第一次等待，给予更长时间 (30秒)
    // 如果是手动触发模式，给予 60 秒
    const waitTimeout = (config.skipFirstPagination && isFirstLoop) 
      ? 60000 
      : (isFirstLoop && config.autoReload !== false)
        ? 30000
        : (Math.max(config.pageInterval || 0, config.paginationType === 'scroll' ? 10000 : 5000));
      
    console.log('[VeilCrawler] Waiting for request, timeout:', waitTimeout);
    const newRequest = await waitForNewRequest(waitTimeout);
    
    if (newRequest && newRequest.responseData) {
      processedRequestIds.add(newRequest.id);
      const previousCount = allData.length;
      const pageData = extractDataFromJson(newRequest.responseData);
      
      console.log(`[VeilCrawler] Intercepted data: ${pageData.length} items from ${newRequest.url}`);

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
      
      // 保存进度到 storage，防止页面意外刷新丢失数据
      saveCollectState({
        isRunning: true,
        taskId: config.id || '',
        rules, config,
        collectedData: allData,
        currentUrl: window.location.href,
        startTime: Date.now()
      }).catch(() => {});

      if (allData.length === previousCount) {
        noNewDataCount++;
      } else {
        noNewDataCount = 0;
      }
    } else {
      noNewDataCount++;
      console.log('[VeilCrawler] No new request intercepted');
      // 如果连续多次没有新数据，且是滚动模式，尝试再次强力滚动（兜底）
      if (config.paginationType === 'scroll' && noNewDataCount < 3) {
         await scrollToLoadMore();
      }
    }

    // 2. 执行翻页操作（触发下一次请求）
    // 只有当还有余量且没有停止请求时才翻页
    if (!stopRequested && (maxItems === 0 || allData.length < maxItems)) {
      // 如果是第一次翻页，且是刷新恢复的，等待 DOM 就绪
      if (isFirstLoop && !config.skipFirstPagination) {
        console.log('[VeilCrawler] Waiting for DOM to be ready for pagination...');
        await waitForPaginationReady();
      }

      if (config.paginationType === 'scroll') {
        console.log('[VeilCrawler] Scrolling to load more...');
        await scrollToLoadMore();
      } else if (config.paginationType === 'click' && config.nextPageSelector) {
        console.log('[VeilCrawler] Clicking next page:', config.nextPageSelector);
        const hasNext = await clickNextPage(config.nextPageSelector);
        if (!hasNext) {
          console.log('[VeilCrawler] No next page button found or disabled');
          break;
        }
      } else if (config.paginationType !== 'none' && config.paginationType) {
        break;
      }
    }

    isFirstLoop = false;
  }

  isRunning = false;
  chrome.runtime.sendMessage({ type: 'COLLECT_RESULT', data: allData }).catch(() => {});
};

const runCollectTask = async (rules: SelectorRule[], config: any, resumeData: Record<string, string>[] = []) => {
  if (config.sourceType === 'json') {
    const state = await getCollectState();
    const isResuming = resumeData.length > 0 || (state?.isRunning && (Date.now() - state.startTime < 5 * 60 * 1000));

    // 策略 1: 自动刷新模式 (Auto Reload)
    // 只要开启，就强制刷新，不检查现有数据，确保从头开始
    // 如果是正在恢复中，则不再刷新
    if (config.autoReload !== false && !isResuming) {
      // 必须先清理旧的请求记录，防止污染
      interceptedRequests.length = 0;
      
      // 保存状态，以便刷新后恢复
      await saveCollectState({
        isRunning: true,
        taskId: config.id || '',
        rules, config,
        collectedData: resumeData,
        currentUrl: window.location.href,
        startTime: Date.now()
      });
      
      // 确保拦截设置已保存
      await setInterceptPattern(config.interceptUrl, true);
      await saveInterceptState(true, config.interceptUrl);
      
      console.log('[VeilCrawler] Auto reload enabled, reloading page to capture initial request...');
      window.location.reload();
      return;
    }

    // 策略 2: 手动/被动触发模式 (Manual Trigger) 或 刷新后的恢复模式
    // 如果是刷新后恢复，jsonData 传空，它会进入循环等待第一个请求
    console.log('[VeilCrawler] JSON collect task starting (resuming:', isResuming, ')');
    
    if (!isResuming) {
      // 如果不是恢复模式（即刚刚点击“运行”），清理之前的记录
      interceptedRequests.length = 0;
    }

    await runJsonCollectTask(rules, {}, { ...config, skipFirstPagination: isResuming ? false : true });
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

    // 保存进度到 storage
    saveCollectState({
      isRunning: true,
      taskId: config.id || '',
      rules, config,
      collectedData: allData,
      currentUrl: window.location.href,
      startTime: Date.now()
    }).catch(() => {});

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
      isRunning = false; // 立即标记为非运行状态，允许重新开始
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
  // 此时 initInterceptorState 已经在 document_start 处非阻塞启动了
  
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
    // JSON 模式不需要等待 DOM 元素
    if (state.config.sourceType === 'json') {
      resolve();
      return;
    }
    
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
