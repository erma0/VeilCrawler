// 此脚本会被注入到页面上下文中执行
// 用于拦截网络请求（只在用户启用时才注入）

(function() {
  if ((window as any).__veilCrawlerInjected) return;
  (window as any).__veilCrawlerInjected = true;
  
  let interceptPattern = '';
  let isEnabled = false;
  
  const originalFetch = window.fetch.bind(window);
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'VEIL_CRAWLER_SET_PATTERN') {
      interceptPattern = e.data.pattern || '';
      isEnabled = e.data.enabled === true;
    }
  });
  
  const escapeRegex = (str: string): string => {
    return str.replace(/[.+?^${}()|[\]\\]/g, (match) => '\\' + match);
  };
  
  const shouldIntercept = (url: string): boolean => {
    if (!isEnabled || !interceptPattern) return false;
    try {
      if (interceptPattern.includes('*')) {
        const escaped = escapeRegex(interceptPattern);
        const regex = new RegExp(escaped.replace(/\*/g, '.*'), 'i');
        return regex.test(url);
      }
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    } catch {
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    }
  };
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).slice(2);
  
  const notifyIntercepted = (method: string, url: string, status: number, data: any) => {
    window.postMessage({
      type: 'VEIL_CRAWLER_INTERCEPTED',
      id: generateId(),
      method,
      url,
      status,
      responseData: data
    }, '*');
  };
  
  const isJsonResponse = (contentType: string, url: string): boolean => {
    const ct = (contentType || '').toLowerCase();
    return ct.includes('application/json') || 
           ct.includes('text/json') || 
           ct.includes('+json') ||
           url.endsWith('.json');
  };
  
  // 拦截 XMLHttpRequest
  XMLHttpRequest.prototype.open = function(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ) {
    (this as any)._veilMethod = method;
    try {
      (this as any)._veilUrl = new URL(url.toString(), window.location.href).href;
    } catch {
      (this as any)._veilUrl = url.toString();
    }
    return originalXHROpen.call(this, method, url, async, username, password);
  };
  
  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this;
    const url = (xhr as any)._veilUrl || '';
    const method = (xhr as any)._veilMethod || 'GET';
    
    xhr.addEventListener('load', function() {
      if (!shouldIntercept(url)) return;
      try {
        const contentType = xhr.getResponseHeader('content-type') || '';
        if (isJsonResponse(contentType, url)) {
          const data = JSON.parse(xhr.responseText);
          notifyIntercepted(method, url, xhr.status, data);
        }
      } catch {}
    });
    
    return originalXHRSend.call(this, body);
  };
  
  // 拦截 Fetch
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await originalFetch(input, init);
    
    let url: string;
    try {
      if (typeof input === 'string') {
        url = new URL(input, window.location.href).href;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }
    } catch {
      url = String(input);
    }
    
    if (!shouldIntercept(url)) return response;
    
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    
    try {
      const contentType = response.headers.get('content-type') || '';
      if (isJsonResponse(contentType, url)) {
        const cloned = response.clone();
        const data = await cloned.json();
        notifyIntercepted(method, url, response.status, data);
      }
    } catch {}
    
    return response;
  };
})();
