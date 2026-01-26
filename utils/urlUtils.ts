/**
 * Normalizes a URL input string.
 * Adds https:// if protocol is missing.
 */
export const normalizeUrl = (input: string): string => {
  let url = input.trim();
  // Check if it starts with http:// or https://
  if (!/^https?:\/\//i.test(url)) {
    // Default to https
    url = 'https://' + url;
  }
  
  // validation check (optional, returning the best guess)
  try {
    // Try to construct a URL object to see if it's valid
    new URL(url); 
    return url;
  } catch (e) {
    // If it fails (e.g. contains spaces or invalid chars), return original or formatted best guess
    return url;
  }
};

/**
 * Extracts a clean domain name for display
 */
export const getDomain = (url: string) => {
  try {
    if (!url.startsWith('http')) return url;
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
};
