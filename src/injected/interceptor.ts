// 此脚本通过 manifest.json 注入到 MAIN world
// 用于拦截网络请求

(function() {
  if ((window as any).__veilCrawlerInjected) return;
  (window as any).__veilCrawlerInjected = true;
  
  console.log('[VeilCrawler] Interceptor initialized in MAIN world');

  let interceptPattern = '';
  let isEnabled = false;
  const requestBuffer: any[] = []; // 早期请求缓冲区
  const BUFFER_LIMIT = 100; // 增大缓冲区
  
  const originalFetch = window.fetch.bind(window);
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
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
          notifyIntercepted(req.method, req.url, req.status, req.data, req.timestamp, req.requestType);
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
  
  const notifyIntercepted = (method: string, url: string, status: number, data: any, timestamp?: number, requestType?: string) => {
    window.postMessage({
      type: 'VEIL_CRAWLER_INTERCEPTED',
      id: generateId(),
      method,
      url,
      status,
      responseData: data,
      timestamp: timestamp || Date.now(),
      requestType: requestType || 'unknown'
    }, '*');
  };

  const handleInterceptedData = (method: string, url: string, status: number, data: any, requestType: string = 'unknown') => {
    // 始终存入缓冲区（无论是否启用），以便后续启用时可以回溯
    const record = { method, url, status, data, timestamp: Date.now(), requestType };
    requestBuffer.push(record);
    if (requestBuffer.length > BUFFER_LIMIT) requestBuffer.shift();
    
    // 如果已启用且匹配，立即通知
    if (isEnabled && shouldIntercept(url)) {
      console.log(`[VeilCrawler] Intercepted (${requestType}): ${method} ${url}`);
      notifyIntercepted(method, url, status, data, undefined, requestType);
    }
  };
  
  const isJsonResponse = (contentType: string, url: string): boolean => {
    const ct = (contentType || '').toLowerCase();
    // 扩展 JSON 类型检测
    if (ct.includes('application/json') || 
        ct.includes('text/json') || 
        ct.includes('application/javascript') || 
        ct.includes('text/javascript') ||
        ct.includes('+json') ||
        ct.includes('text/plain')) { // 某些 API 返回 text/plain 但实际是 JSON
      return true;
    }
    const urlPath = url.split('?')[0].split('#')[0].toLowerCase();
    if (urlPath.endsWith('.json')) return true;
    // 检查常见的 API 路径模式
    if (urlPath.includes('/api/') || urlPath.includes('/v1/') || urlPath.includes('/v2/')) return true;
    return false;
  };

  const tryParseJsonText = (text: string): any => {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    
    // 快速检查是否可能是 JSON
    const firstChar = trimmed[0];
    if (firstChar !== '{' && firstChar !== '[' && firstChar !== '"') {
      // 可能是 JSONP 格式: callback({...})
      const jsonpMatch = trimmed.match(/^\w+\s*\(\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*\)\s*;?\s*$/);
      if (jsonpMatch) {
        try {
          return JSON.parse(jsonpMatch[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
    
    try {
      return JSON.parse(trimmed);
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
  
  // 调试开关（生产环境设为 false）
  const debugFetch = false;

  // 拦截 XMLHttpRequest
  XMLHttpRequest.prototype.open = function(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...args: any[]
  ) {
    (this as any)._veilMethod = method;
    (this as any)._veilRequestHeaders = {};
    (this as any)._veilProcessed = false;
    try {
      (this as any)._veilUrl = new URL(url.toString(), window.location.href).href;
    } catch {
      (this as any)._veilUrl = url.toString();
    }
    // @ts-ignore
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  // 拦截 setRequestHeader 以获取请求头信息
  XMLHttpRequest.prototype.setRequestHeader = function(this: XMLHttpRequest, name: string, value: string) {
    if ((this as any)._veilRequestHeaders) {
      (this as any)._veilRequestHeaders[name.toLowerCase()] = value;
    }
    return originalXHRSetRequestHeader.call(this, name, value);
  };
  
  // 处理 XHR 响应的核心函数
  const processXhrResponse = async (xhr: XMLHttpRequest) => {
    if ((xhr as any)._veilProcessed) return;
    if (xhr.readyState !== 4) return;
    
    (xhr as any)._veilProcessed = true;
    
    const url = (xhr as any)._veilUrl || '';
    const method = (xhr as any)._veilMethod || 'GET';
    const requestHeaders = (xhr as any)._veilRequestHeaders || {};
    
    if (debugFetch) {
      console.log(`[VeilCrawler] XHR complete: ${method} ${url.slice(0, 80)}... status=${xhr.status}`);
    }
    
    try {
      const contentType = xhr.getResponseHeader('content-type') || '';
      const acceptHeader = requestHeaders['accept'] || '';
      const matched = isEnabled && shouldIntercept(url);
      
      const isPotentialJson = isJsonResponse(contentType, url) || 
                             xhr.responseType === 'json' || 
                             acceptHeader.includes('application/json') ||
                             matched;
      
      if (debugFetch) {
        console.log(`[VeilCrawler] XHR check: contentType=${contentType}, responseType=${xhr.responseType}, isPotentialJson=${isPotentialJson}`);
      }
      
      if (isPotentialJson) {
        let data: any = null;
        
        if (xhr.responseType === 'json' && xhr.response !== null) {
          data = xhr.response;
        } else if (xhr.responseType === 'arraybuffer' && xhr.response instanceof ArrayBuffer) {
          const text = new TextDecoder('utf-8').decode(new Uint8Array(xhr.response));
          data = tryParseJsonText(text);
        } else if (xhr.responseType === 'blob' && xhr.response instanceof Blob) {
          try {
            const text = await readBlobAsText(xhr.response);
            data = tryParseJsonText(text);
          } catch {}
        } else {
          try {
            data = tryParseJsonText(xhr.responseText);
          } catch {}
        }
        
        if (data !== null) {
          handleInterceptedData(method, url, xhr.status, data, 'xhr');
        } else if (matched) {
          handleInterceptedData(method, url, xhr.status, { _veilCrawlerParseFailed: true, contentType }, 'xhr');
        }
      }
    } catch (err) {
      console.warn('[VeilCrawler] XHR intercept error:', err);
    }
  };
  
  XMLHttpRequest.prototype.send = function(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this;
    const url = (xhr as any)._veilUrl || '';
    const method = (xhr as any)._veilMethod || 'GET';
    
    if (debugFetch) {
      console.log(`[VeilCrawler] XHR send: ${method} ${url.slice(0, 100)}...`);
    }
    
    // 方法1: 监听 readystatechange
    xhr.addEventListener('readystatechange', () => processXhrResponse(xhr));
    
    // 方法2: 监听 load 事件
    xhr.addEventListener('load', () => processXhrResponse(xhr));
    
    // 方法3: 拦截 onreadystatechange 属性设置
    const originalOnReadyStateChange = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'onreadystatechange');
    let userHandler: ((this: XMLHttpRequest, ev: Event) => any) | null = null;
    
    try {
      Object.defineProperty(xhr, 'onreadystatechange', {
        get() {
          return userHandler;
        },
        set(handler) {
          userHandler = handler;
          // 当用户设置 handler 时，我们包装它
          if (originalOnReadyStateChange?.set) {
            originalOnReadyStateChange.set.call(xhr, function(this: XMLHttpRequest, ev: Event) {
              // 先处理我们的逻辑
              processXhrResponse(this);
              // 再调用用户的 handler
              if (userHandler) {
                userHandler.call(this, ev);
              }
            });
          }
        },
        configurable: true
      });
    } catch {}
    
    // 方法4: 使用 setTimeout 轮询检查（兜底方案）
    const checkComplete = () => {
      if (xhr.readyState === 4) {
        processXhrResponse(xhr);
      } else if (xhr.readyState !== 0) {
        setTimeout(checkComplete, 50);
      }
    };
    setTimeout(checkComplete, 100);
    
    return originalXHRSend.call(this, body);
  };
  
  // 拦截 Fetch
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
    
    // 调试日志
    if (debugFetch) {
      console.log(`[VeilCrawler] Fetch called: ${url.slice(0, 100)}...`);
    }
    
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    const headers = init?.headers || (input instanceof Request ? input.headers : {});
    
    // 获取 Accept 头 - 需要更全面地处理各种 headers 格式
    let acceptHeader = '';
    try {
      if (headers instanceof Headers) {
        acceptHeader = headers.get('accept') || headers.get('Accept') || '';
      } else if (Array.isArray(headers)) {
        // headers 可能是 [['accept', 'application/json'], ...] 格式
        const found = headers.find(([k]) => k.toLowerCase() === 'accept');
        if (found) acceptHeader = found[1];
      } else if (typeof headers === 'object' && headers !== null) {
        // 遍历所有 key，不区分大小写
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'accept') {
            acceptHeader = (headers as Record<string, string>)[key];
            break;
          }
        }
      }
    } catch {
      // headers 解析失败，忽略
    }
    
    let response: Response;
    try {
      response = await originalFetch(input, init);
    } catch (err) {
      // 网络错误也记录
      const matched = isEnabled && shouldIntercept(url);
      if (matched) {
        handleInterceptedData(method, url, 0, { _veilCrawlerNetworkError: true, error: String(err) }, 'fetch');
      }
      throw err;
    }
    
    try {
      const matched = isEnabled && shouldIntercept(url);
      
      // opaque 响应无法读取内容
      if (response.type === 'opaque') {
        if (matched) {
          handleInterceptedData(method, url, response.status, { _veilCrawlerOpaque: true }, 'fetch');
        }
        return response;
      }

      const contentType = response.headers.get('content-type') || '';
      const shouldTryParse = isJsonResponse(contentType, url) || 
                            acceptHeader.includes('application/json') ||
                            matched;
      
      if (shouldTryParse) {
        try {
          const cloned = response.clone();
          // 先尝试读取文本，再解析，这样可以处理 JSONP
          const text = await cloned.text();
          const data = tryParseJsonText(text);
          
          if (data !== null) {
            handleInterceptedData(method, url, response.status, data, 'fetch');
          } else if (matched) {
            // URL 匹配但解析失败
            handleInterceptedData(method, url, response.status, { 
              _veilCrawlerParseFailed: true, 
              contentType,
              preview: text.slice(0, 200) 
            }, 'fetch');
          }
        } catch (parseErr) {
          // 即使解析失败，如果 URL 匹配也要记录
          if (matched) {
            handleInterceptedData(method, url, response.status, { _veilCrawlerParseFailed: true }, 'fetch');
          }
        }
      } else {
        // 即使不满足 shouldTryParse，也尝试解析一下（兜底）
        // 因为有些网站的 Content-Type 可能不标准
        try {
          const cloned = response.clone();
          const text = await cloned.text();
          const data = tryParseJsonText(text);
          if (data !== null) {
            handleInterceptedData(method, url, response.status, data, 'fetch');
          }
        } catch {
          // 静默失败
        }
      }
    } catch (err) {
      console.warn('[VeilCrawler] Fetch intercept error:', err);
    }
    
    return response;
  };
  
  // 拦截 sendBeacon（某些网站用于发送数据）
  const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
  if (originalSendBeacon) {
    navigator.sendBeacon = function(url: string | URL, data?: BodyInit | null): boolean {
      const urlStr = url.toString();
      // sendBeacon 通常用于发送数据，不是获取数据，但某些场景可能有用
      // 这里只记录 URL 匹配的请求
      if (isEnabled && shouldIntercept(urlStr)) {
        let parsedData = null;
        if (data) {
          if (typeof data === 'string') {
            parsedData = tryParseJsonText(data);
          } else if (data instanceof Blob) {
            // Blob 需要异步读取，但 sendBeacon 是同步的，这里只能记录元信息
            parsedData = { _veilCrawlerBeaconBlob: true, type: data.type, size: data.size };
          }
        }
        handleInterceptedData('POST', urlStr, 0, parsedData || { _veilCrawlerBeacon: true }, 'beacon');
      }
      return originalSendBeacon(url, data);
    };
  }
})();
