/**
 * Checks if an element has siblings with the same tag name.
 * Used to determine if a selector should be specific (:nth-of-type) or generic (all items).
 */
const hasSimilarSiblings = (el: HTMLElement): boolean => {
  const tag = el.tagName;
  let sibling = el.parentElement?.firstElementChild;
  let count = 0;
  while (sibling) {
    if (sibling.tagName === tag) {
      count++;
    }
    sibling = sibling.nextElementSibling;
  }
  return count > 1;
};

/**
 * Generates a "Smart" CSS selector.
 * - If an element looks like part of a list (has similar siblings), it generates a generic selector matching all items.
 * - If an element looks unique, it generates a specific selector.
 */
export const getSmartSelector = (el: HTMLElement): string => {
  let path: string[] = [];
  let current: HTMLElement | null = el;
  
  // We will traverse up to 4 levels max to keep selector manageable, 
  // or until we hit body/html
  const MAX_DEPTH = 5;
  let depth = 0;

  while (current && depth < MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    
    // Stop at body
    if (tagName === 'body') break;

    let selectorPart = tagName;

    // 1. Check for ID (Strongest, but strictly specific)
    // NOTE: For list generation, we usually DON'T want ID on the list item itself, 
    // unless we are sure we want a single item. 
    // Heuristic: If we are clicking a leaf node inside a list, we avoid ID if siblings exist.
    if (current.id && !hasSimilarSiblings(current)) {
      selectorPart += `#${current.id}`;
      path.unshift(selectorPart);
      break; // ID is unique enough, stop here
    }

    // 2. Check for Classes (Good for lists)
    if (current.className && typeof current.className === 'string' && current.className.trim() !== '') {
       // Filter out common utility classes that are likely noise (e.g. Tailwind layout classes)
       // This is a heuristic. In a real app, this list would be configurable.
       const rawClasses = current.className.split(/\s+/);
       const semanticClasses = rawClasses.filter(c => {
         // Filter out classes with colons (Tailwind states), brackets, or purely numeric
         return !c.includes(':') && !c.includes('[') && !/^\d+$/.test(c) && c.length > 2;
       });

       if(semanticClasses.length > 0) {
         // Use the first valid class found. 
         // ideally we might use .class1.class2 but that gets brittle.
         selectorPart += `.${semanticClasses[0]}`; 
       }
    }

    // 3. Smart Generalization Logic
    // If this element has siblings of the same tag, we assume it's a list item.
    // We intentionally DO NOT add :nth-of-type() to capture the whole list.
    // If it does NOT have similar siblings, we add :nth-of-type to be precise.
    if (!hasSimilarSiblings(current)) {
       // It's a unique structural element (like a header container)
       // We still check index just to be safe if it's not the *only* child but the only *tag* child logic is handled above.
       // Actually, let's be safer: if it has no same-tag siblings, nth-of-type(1) is redundant but harmless.
       // But to ensure we don't accidentally select wrong things if structure is loose:
       let sibling = current;
       let nth = 1;
       while (sibling.previousElementSibling) {
         sibling = sibling.previousElementSibling as HTMLElement;
         if (sibling.tagName.toLowerCase() === tagName) nth++;
       }
       if (nth !== 1) selectorPart += `:nth-of-type(${nth})`;
    } 
    // ELSE: It HAS similar siblings. We OMIT :nth-of-type, making it a "List Selector".

    path.unshift(selectorPart);
    current = current.parentElement;
    depth++;
  }
  
  return path.join(' > ');
};

/**
 * Calculates the bounding rect relative to the viewport
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
 * Legacy support if needed, or strictly unique selector
 */
export const getUniqueSelector = (el: HTMLElement): string => {
   // Simplified version of the old one, mostly for specific interactions like clicking a button
   if (el.id) return `#${el.id}`;
   return getSmartSelector(el); // Fallback
};