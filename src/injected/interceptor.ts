// 此脚本会被注入到页面上下文中执行
// 用于拦截网络请求

(function() {
  if ((window as any).__veilCrawlerInjected) return;
  (window as any).__veilCrawlerInjected = true;
  
  let interceptPattern = '';
  
  // 监听来自 content script 的模式更新
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'VEIL_CRAWLER_SET_PATTERN') {
      interceptPattern = e.data.pattern || '';
      console.log('VeilCrawler: 拦截模式设置为', interceptPattern);
    }
  });
  
  const shouldIntercept = function(url: string): boolean {
    if (!interceptPattern) return false;
    try {
      if (interceptPattern.includes('*')) {
        const regex = new RegExp(interceptPattern.replace(/\*/g, '.*'), 'i');
        return regex.test(url);
      }
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    } catch {
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    }
  };
  
  // 拦截 XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL) {
    (this as any)._veilMethod = method;
    (this as any)._veilUrl = url.toString();
    return origOpen.apply(this, arguments as any);
  };
  
  XMLHttpRequest.prototype.send = function(body?: any) {
    const xhr = this;
    const url = (xhr as any)._veilUrl || '';
    
    if (shouldIntercept(url)) {
      xhr.addEventListener('load', function() {
        try {
          const ct = xhr.getResponseHeader('content-type') || '';
          if (ct.includes('application/json') || url.endsWith('.json')) {
            const data = JSON.parse(xhr.responseText);
            window.postMessage({
              type: 'VEIL_CRAWLER_INTERCEPTED',
              id: Date.now().toString() + Math.random().toString(36).slice(2),
              method: (xhr as any)._veilMethod || 'GET',
              url: url,
              status: xhr.status,
              responseData: data
            }, '*');
          }
        } catch {}
      });
    }
    return origSend.apply(this, arguments as any);
  };
  
  // 拦截 Fetch
  const origFetch = window.fetch;
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    const response = await origFetch.apply(this, arguments as any);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    
    if (shouldIntercept(url)) {
      try {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json') || url.endsWith('.json')) {
          const cloned = response.clone();
          const data = await cloned.json();
          window.postMessage({
            type: 'VEIL_CRAWLER_INTERCEPTED',
            id: Date.now().toString() + Math.random().toString(36).slice(2),
            method: init?.method || 'GET',
            url: url,
            status: response.status,
            responseData: data
          }, '*');
        }
      } catch {}
    }
    return response;
  };
  
  console.log('VeilCrawler: 网络拦截器已注入');
})();
