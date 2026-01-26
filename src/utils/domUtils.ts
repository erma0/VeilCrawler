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

export const getSmartSelector = (el: HTMLElement): string => {
  const path: string[] = [];
  let current: HTMLElement | null = el;
  const MAX_DEPTH = 5;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    if (tagName === 'body') break;

    let selectorPart = tagName;

    if (current.id && !hasSimilarSiblings(current)) {
      selectorPart += `#${current.id}`;
      path.unshift(selectorPart);
      break;
    }

    if (current.className && typeof current.className === 'string' && current.className.trim() !== '') {
      const rawClasses = current.className.split(/\s+/);
      const semanticClasses = rawClasses.filter(c =>
        !c.includes(':') && !c.includes('[') && !/^\d+$/.test(c) && c.length > 2
      );
      if (semanticClasses.length > 0) {
        selectorPart += `.${semanticClasses[0]}`;
      }
    }

    if (!hasSimilarSiblings(current)) {
      let sibling: Element | null = current;
      let nth = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName.toLowerCase() === tagName) nth++;
      }
      if (nth !== 1) selectorPart += `:nth-of-type(${nth})`;
    }

    path.unshift(selectorPart);
    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
};

export const getElementRect = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
};

export const getUniqueSelector = (el: HTMLElement): string => {
  if (el.id) return `#${el.id}`;
  return getSmartSelector(el);
};
