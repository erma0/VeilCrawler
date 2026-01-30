// 此脚本会被注入到页面上下文中执行
// 用于拦截网络请求

(function() {
  if ((window as any).__veilCrawlerInjected) return;
  (window as any).__veilCrawlerInjected = true;
  
  let interceptPattern = '';
  // 缓存早期请求，等待模式设置后再检查
  const pendingRequests: Array<{
    id: string;
    method: string;
    url: string;
    status: number;
    responseData: any;
  }> = [];
  let patternInitialized = false;
  
  // 监听来自 content script 的模式更新
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'VEIL_CRAWLER_SET_PATTERN') {
      interceptPattern = e.data.pattern || '';
      console.log('VeilCrawler: 拦截模式设置为', interceptPattern);
      
      // 首次设置模式时，检查缓存的早期请求
      if (!patternInitialized && interceptPattern) {
        patternInitialized = true;
        pendingRequests.forEach(req => {
          if (shouldIntercept(req.url)) {
            window.postMessage({
              type: 'VEIL_CRAWLER_INTERCEPTED',
              ...req
            }, '*');
          }
        });
        // 清空缓存
        pendingRequests.length = 0;
      }
    } else if (e.data?.type === 'VEIL_CRAWLER_GET_PATTERN') {
      // 响应模式查询
      window.postMessage({
        type: 'VEIL_CRAWLER_PATTERN_RESPONSE',
        pattern: interceptPattern
      }, '*');
    }
  });
  
  const shouldIntercept = function(url: string): boolean {
    if (!interceptPattern) return false;
    try {
      if (interceptPattern.includes('*')) {
        // 转义特殊字符，但保留 * 作为通配符
        const escaped = interceptPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped.replace(/\*/g, '.*'), 'i');
        return regex.test(url);
      }
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    } catch {
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    }
  };
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).slice(2);
  
  const processResponse = (method: string, url: string, status: number, data: any) => {
    const request = {
      id: generateId(),
      method,
      url,
      status,
      responseData: data
    };
    
    // 如果模式还未初始化，缓存请求
    if (!patternInitialized) {
      pendingRequests.push(request);
      // 限制缓存大小
      if (pendingRequests.length > 50) {
        pendingRequests.shift();
      }
      return;
    }
    
    if (shouldIntercept(url)) {
      window.postMessage({
        type: 'VEIL_CRAWLER_INTERCEPTED',
        ...request
      }, '*');
    }
  };
  
  // 拦截 XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL) {
    (this as any)._veilMethod = method;
    // 处理相对 URL
    const fullUrl = new URL(url.toString(), window.location.href).href;
    (this as any)._veilUrl = fullUrl;
    return origOpen.apply(this, arguments as any);
  };
  
  XMLHttpRequest.prototype.send = function(body?: any) {
    const xhr = this;
    const url = (xhr as any)._veilUrl || '';
    const method = (xhr as any)._veilMethod || 'GET';
    
    // 始终监听，让 processResponse 决定是否处理
    xhr.addEventListener('load', function() {
      try {
        const ct = xhr.getResponseHeader('content-type') || '';
        if (ct.includes('application/json') || ct.includes('text/json') || url.endsWith('.json')) {
          const data = JSON.parse(xhr.responseText);
          processResponse(method, url, xhr.status, data);
        }
      } catch (e) {
        // 静默失败
      }
    });
    
    return origSend.apply(this, arguments as any);
  };
  
  // 拦截 Fetch
  const origFetch = window.fetch;
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    const response = await origFetch.apply(this, arguments as any);
    
    let url: string;
    if (typeof input === 'string') {
      url = new URL(input, window.location.href).href;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = (input as Request).url;
    }
    
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    
    // 始终尝试解析 JSON，让 processResponse 决定是否处理
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json') || ct.includes('text/json') || url.endsWith('.json')) {
        const cloned = response.clone();
        const data = await cloned.json();
        processResponse(method, url, response.status, data);
      }
    } catch (e) {
      // 静默失败
    }
    
    return response;
  };
  
  console.log('VeilCrawler: 网络拦截器已注入');
})();
