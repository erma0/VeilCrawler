/**
 * 检查元素是否有相同标签的兄弟元素
 */
const hasSimilarSiblings = (el: HTMLElement): boolean => {
  const tag = el.tagName;
  let sibling = el.parentElement?.firstElementChild;
  let count = 0;
  while (sibling) {
    if (sibling.tagName === tag) count++;
    sibling = sibling.nextElementSibling;
  }
  return count > 1;
};

/**
 * 获取元素在同类型兄弟中的索引
 */
const getNthIndex = (el: HTMLElement): number => {
  const tagName = el.tagName;
  let sibling: Element | null = el;
  let nth = 1;
  while (sibling.previousElementSibling) {
    sibling = sibling.previousElementSibling;
    if (sibling.tagName === tagName) nth++;
  }
  return nth;
};

/**
 * 过滤出有效的 CSS 类名
 */
const getValidClasses = (el: HTMLElement): string[] => {
  if (!el.className || typeof el.className !== 'string') return [];
  
  return el.className.split(/\s+/).filter(c =>
    c.length > 1 &&
    !c.includes(':') &&
    !c.includes('[') &&
    !c.includes('(') &&
    !/^\d/.test(c) &&  // 不以数字开头
    !/^-?\d+$/.test(c) &&  // 不是纯数字
    !c.startsWith('_') &&  // 不以下划线开头（通常是动态生成的）
    !/[A-Z]{2,}/.test(c.slice(1))  // 避免类似 hash 的类名
  );
};

/**
 * 检查选择器是否能唯一定位到元素
 */
const isUniqueSelector = (selector: string, target: HTMLElement): boolean => {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === target;
  } catch {
    return false;
  }
};

/**
 * 检查选择器是否能匹配到多个相似元素（用于列表采集）
 */
const getMatchCount = (selector: string): number => {
  try {
    return document.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
};

/**
 * 生成智能选择器
 * 策略：生成能匹配到同类元素的选择器，适合列表数据采集
 */
export const getSmartSelector = (el: HTMLElement): string => {
  // 1. 如果有 ID，检查是否适合作为选择器
  if (el.id && !/\d{3,}/.test(el.id)) {
    // ID 不包含长数字串（可能是动态 ID）
    return `#${el.id}`;
  }

  const path: string[] = [];
  let current: HTMLElement | null = el;
  const MAX_DEPTH = 6;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === 'body' || tagName === 'html') break;

    let selectorPart = tagName;
    const classes = getValidClasses(current);
    
    // 优先使用有语义的类名
    if (classes.length > 0) {
      // 选择最有语义的类名（通常较短且不含数字）
      const semanticClass = classes.find(c => 
        !c.includes('-') || c.split('-').every(p => !/^\d+$/.test(p))
      ) || classes[0];
      selectorPart += `.${semanticClass}`;
    }

    // 如果是目标元素且有多个相同类型的兄弟，考虑是否需要 nth-of-type
    // 但对于列表采集，通常不需要 nth-of-type
    if (current === el && hasSimilarSiblings(current)) {
      // 检查不带 nth 的选择器能匹配多少元素
      const testPath = [...path];
      testPath.unshift(selectorPart);
      const testSelector = testPath.join(' > ');
      const matchCount = getMatchCount(testSelector);
      
      // 如果匹配多个元素，这可能是我们想要的（列表采集）
      // 只有当匹配 0 个或需要精确定位时才加 nth
      if (matchCount === 0) {
        const nth = getNthIndex(current);
        selectorPart += `:nth-of-type(${nth})`;
      }
    }

    path.unshift(selectorPart);

    // 检查当前路径是否已经足够
    const currentSelector = path.join(' > ');
    if (getMatchCount(currentSelector) > 0) {
      // 如果能匹配到元素，检查是否需要继续向上
      // 对于列表元素，匹配多个是正常的
      if (depth >= 2) break;
    }

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
};

/**
 * 获取元素的精确选择器（唯一定位）
 */
export const getUniqueSelector = (el: HTMLElement): string => {
  // 优先使用 ID
  if (el.id && !/\d{3,}/.test(el.id)) {
    return `#${el.id}`;
  }

  const path: string[] = [];
  let current: HTMLElement | null = el;
  const MAX_DEPTH = 8;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === 'body' || tagName === 'html') break;

    let selectorPart = tagName;
    const classes = getValidClasses(current);
    
    if (classes.length > 0) {
      selectorPart += `.${classes[0]}`;
    }

    // 对于精确选择器，需要加上 nth-of-type
    if (hasSimilarSiblings(current)) {
      const nth = getNthIndex(current);
      selectorPart += `:nth-of-type(${nth})`;
    }

    path.unshift(selectorPart);

    // 检查是否已经唯一
    const currentSelector = path.join(' > ');
    if (isUniqueSelector(currentSelector, el)) {
      break;
    }

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
};

/**
 * 获取元素的位置和尺寸
 */
export const getElementRect = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
};

/**
 * 生成元素的 XPath
 * 策略：生成能匹配同类元素的 XPath，适合列表数据采集
 */
export const getSmartXPath = (el: HTMLElement): string => {
  // 如果有 ID，直接使用
  if (el.id && !/\d{3,}/.test(el.id)) {
    return `//*[@id="${el.id}"]`;
  }

  const path: string[] = [];
  let current: HTMLElement | null = el;
  const MAX_DEPTH = 6;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === 'body' || tagName === 'html') break;

    let xpathPart = tagName;
    const classes = getValidClasses(current);

    // 使用 class 属性
    if (classes.length > 0) {
      const cls = classes[0];
      xpathPart += `[contains(@class,"${cls}")]`;
    }

    path.unshift(xpathPart);

    // 检查当前路径是否已经足够
    if (depth >= 2) {
      const testXPath = '//' + path.join('/');
      try {
        const result = document.evaluate(testXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (result.snapshotLength > 0) break;
      } catch {}
    }

    current = current.parentElement;
    depth++;
  }

  return '//' + path.join('/');
};

/**
 * 生成精确的 XPath（唯一定位）
 */
export const getUniqueXPath = (el: HTMLElement): string => {
  if (el.id && !/\d{3,}/.test(el.id)) {
    return `//*[@id="${el.id}"]`;
  }

  const path: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === 'html') break;

    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName.toLowerCase() === tagName) index++;
      sibling = sibling.previousElementSibling;
    }

    const xpathPart = `${tagName}[${index}]`;
    path.unshift(xpathPart);

    current = current.parentElement;
  }

  return '/' + path.join('/');
};

/**
 * 使用 XPath 查询元素
 */
export const evaluateXPath = (xpath: string): HTMLElement[] => {
  const results: HTMLElement[] = [];
  try {
    const xpathResult = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < xpathResult.snapshotLength; i++) {
      const node = xpathResult.snapshotItem(i);
      if (node instanceof HTMLElement) {
        results.push(node);
      }
    }
  } catch (e) {
    console.warn('XPath 查询错误:', e);
  }
  return results;
};
