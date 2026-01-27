// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// 转发消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 来自 content script 的消息（有 sender.tab）
  if (sender.tab) {
    // 标记消息来源，避免重复处理
    const forwardedMessage = { ...message, _fromContentScript: true };
    // 广播给所有扩展页面（side panel）
    chrome.runtime.sendMessage(forwardedMessage).catch(() => {});
  } else if (!message._fromContentScript) {
    // 来自 side panel 的消息（非转发），转发到当前标签页的 content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    });
  }
  
  sendResponse({ success: true });
  return true;
});
