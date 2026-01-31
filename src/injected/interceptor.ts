// 此脚本通过 manifest.json 注入到 MAIN world
// 用于拦截网络请求

(function() {
  if ((window as any).__veilCrawlerInjected) return;
  (window as any).__veilCrawlerInjected = true;
  
  console.log('[VeilCrawler] Interceptor initialized in MAIN world');

  let interceptPattern = '';
  let isEnabled = false;
  const requestBuffer: any[] = []; // 早期请求缓冲区
  const BUFFER_LIMIT = 50;
  
  const originalFetch = window.fetch.bind(window);
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  const enableInterception = (pattern: string) => {
    interceptPattern = pattern;
    isEnabled = true;
    console.log(`[VeilCrawler] Interceptor enabled with pattern: ${pattern}`);
    
    // 处理缓冲区中的请求
    if (requestBuffer.length > 0) {
      console.log(`[VeilCrawler] Processing ${requestBuffer.length} buffered requests...`);
      const toProcess = [...requestBuffer];
      requestBuffer.length = 0;
      
      toProcess.forEach(req => {
        if (shouldIntercept(req.url)) {
          console.log(`[VeilCrawler] Notifying buffered request: ${req.url}`);
          notifyIntercepted(req.method, req.url, req.status, req.data, req.timestamp);
        }
      });
    }
  };

  window.addEventListener('message', function(e) {
    if (e.data?.type === 'VEIL_CRAWLER_SET_PATTERN') {
      if (e.data.enabled) {
        enableInterception(e.data.pattern || '');
      } else {
        isEnabled = false;
        interceptPattern = '';
      }
    }
  });
  
  const escapeRegex = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };
  
  const shouldIntercept = (url: string): boolean => {
    if (!interceptPattern) return false;

    const targetUrl = url.split('?')[0].split('#')[0];

    try {
      if (interceptPattern.includes('*')) {
        const regexStr = interceptPattern.split('*').map(s => escapeRegex(s)).join('.*');
        const regex = new RegExp(regexStr, 'i');
        return regex.test(url) || regex.test(targetUrl);
      }
      const p = interceptPattern.toLowerCase();
      const u = url.toLowerCase();
      return u.includes(p) || targetUrl.toLowerCase().includes(p);
    } catch (e) {
      return url.toLowerCase().includes(interceptPattern.toLowerCase());
    }
  };
  
  const generateId = () => Date.now().toString() + Math.random().toString(36).slice(2);
  
  const notifyIntercepted = (method: string, url: string, status: number, data: any, timestamp?: number) => {
    window.postMessage({
      type: 'VEIL_CRAWLER_INTERCEPTED',
      id: generateId(),
      method,
      url,
      status,
      responseData: data,
      timestamp: timestamp || Date.now()
    }, '*');
  };

  const handleInterceptedData = (method: string, url: string, status: number, data: any) => {
    if (isEnabled && shouldIntercept(url)) {
      notifyIntercepted(method, url, status, data);
    } else {
      // 如果还没启用或还没同步到 pattern，先存入缓冲区
      requestBuffer.push({ method, url, status, data, timestamp: Date.now() });
      if (requestBuffer.length > BUFFER_LIMIT) requestBuffer.shift();
    }
  };
  
  const isJsonResponse = (contentType: string, url: string): boolean => {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('application/json') || 
        ct.includes('text/json') || 
        ct.includes('application/javascript') || 
        ct.includes('+json')) {
      return true;
    }
    const urlPath = url.split('?')[0].split('#')[0].toLowerCase();
    if (urlPath.endsWith('.json')) return true;
    return false;
  };

  const tryParseJsonText = (text: string) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const readBlobAsText = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('blob read failed'));
      reader.readAsText(blob);
    });
  };

  // 发送就绪消息，请求最新配置
  window.postMessage({ type: 'VEIL_CRAWLER_READY' }, '*');

  // 拦截 XMLHttpRequest
  XMLHttpRequest.prototype.open = function(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    (this as any)._veilMethod = method;
    try {
      (this as any)._veilUrl = new URL(url.toString(), window.location.href).href;
    } catch {
      (this as any)._veilUrl = url.toString();
    }
    // @ts-ignore
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  XMLHttpRequest.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this;
    const url = (xhr as any)._veilUrl || '';
    const method = (xhr as any)._veilMethod || 'GET';
    
    xhr.addEventListener('load', async function() {
      try {
        const contentType = xhr.getResponseHeader('content-type') || '';
        const matched = isEnabled && shouldIntercept(url);
        
        // 抖音等站点可能会修改 responseType，我们需要全面覆盖
        const isPotentialJson = isJsonResponse(contentType, url) || xhr.responseType === 'json' || matched;
        
        if (isPotentialJson) {
          let data;
          if (xhr.responseType === 'json' && xhr.response) {
            data = xhr.response;
          } else {
            if (xhr.responseType === 'arraybuffer' && xhr.response instanceof ArrayBuffer) {
              const text = new TextDecoder('utf-8').decode(new Uint8Array(xhr.response));
              const parsed = tryParseJsonText(text);
              data = parsed ?? (matched ? { _veilCrawlerParseFailed: true } : null);
            } else if (xhr.responseType === 'blob' && xhr.response instanceof Blob) {
              try {
                const text = await readBlobAsText(xhr.response);
                const parsed = tryParseJsonText(text);
                data = parsed ?? (matched ? { _veilCrawlerParseFailed: true } : null);
              } catch {
                data = matched ? { _veilCrawlerParseFailed: true } : null;
              }
            } else {
              // 兜底尝试从 responseText 读取
              try {
                const parsed = tryParseJsonText(xhr.responseText);
                data = parsed ?? (matched ? { _veilCrawlerParseFailed: true } : null);
              } catch {
                data = matched ? { _veilCrawlerParseFailed: true } : null;
              }
            }
          }
          if (data !== null && data !== undefined) {
            handleInterceptedData(method, url, xhr.status, data);
          }
        }
      } catch (err) {}
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
    
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    
    try {
      const matched = isEnabled && shouldIntercept(url);
      if (matched && response.type === 'opaque') {
        handleInterceptedData(method, url, response.status, { _veilCrawlerOpaque: true });
        return response;
      }

      const contentType = response.headers.get('content-type') || '';
      if (isJsonResponse(contentType, url) || matched) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          handleInterceptedData(method, url, response.status, data);
        } catch {
          if (matched) {
            handleInterceptedData(method, url, response.status, { _veilCrawlerParseFailed: true });
          }
        }
      } else {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          handleInterceptedData(method, url, response.status, data);
        } catch {
          return response;
        }
      }
    } catch {}
    
    return response;
  };
})();
