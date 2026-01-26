export const normalizeUrl = (input: string): string => {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    new URL(url);
    return url;
  } catch {
    return url;
  }
};

export const getDomain = (url: string) => {
  try {
    if (!url.startsWith('http')) return url;
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
