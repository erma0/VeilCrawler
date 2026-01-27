import React, { useState, useEffect, useCallback } from 'react';
import { Command, Layers, Settings, Play, Trash2, Plus, MousePointer2, Ban, ArrowDownToLine, MousePointerClick, Power, PowerOff, Code, Braces, ChevronRight, ChevronDown, Globe, RefreshCw } from 'lucide-react';
import type { Task, SelectorRule, CollectedData, PaginationType } from '../types';
import { getDomain } from '../utils/urlUtils';

interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status?: number;
}

// JSON 树形查看器组件
const JsonNode: React.FC<{
  name: string;
  value: any;
  path: string;
  onSelect: (path: string, value: any) => void;
  level?: number;
}> = ({ name, value, path, onSelect, level = 0 }) => {
  const [expanded, setExpanded] = useState(level < 2);
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const generalizedPath = path.replace(/\.\d+/g, '[*]');
    onSelect(generalizedPath, isObject ? '[Object]' : value);
  };

  return (
    <div style={{ paddingLeft: `${level * 12}px` }} className="text-xs font-mono">
      <div
        className="flex items-center hover:bg-gray-800 rounded px-1 py-0.5 cursor-pointer group"
        onClick={handleSelect}
      >
        {isObject ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="mr-1 text-gray-500 hover:text-white"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-3.5 mr-1" />
        )}

        <span className="text-purple-400 mr-1">{name}</span>
        <span className="text-gray-500 mr-1">:</span>

        {!isObject && (
          <span className={`truncate ${typeof value === 'number' ? 'text-orange-400' : 'text-green-400'}`}>
            {JSON.stringify(value)}
          </span>
        )}

        {isObject && (
          <span className="text-gray-600">
            {isArray ? `Array(${value.length})` : '{...}'}
          </span>
        )}

        <span className="ml-auto text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 bg-gray-900 px-1 rounded">
          + 选择
        </span>
      </div>

      {isObject && expanded && (
        <div>
          {Object.entries(value).map(([key, val]) => (
            <JsonNode
              key={key}
              name={key}
              value={val}
              path={`${path}${path ? '.' : ''}${key}`}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'config'>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [rules, setRules] = useState<SelectorRule[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [previewData, setPreviewData] = useState<CollectedData[]>([]);
  const [interceptedJson, setInterceptedJson] = useState<any>(null);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // 获取当前标签页信息
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        setCurrentUrl(tabs[0].url);
        const domain = getDomain(tabs[0].url);
        const initialTask: Task = {
          id: 'init-1',
          name: `${domain} 采集`,
          status: 'idle',
          url: tabs[0].url,
          sourceType: 'dom',
          paginationType: 'none',
          count: 0
        };
        setTasks([initialTask]);
        setActiveTaskId(initialTask.id);
      }
    });
  }, []);

  // 监听来自 content script 的消息
  useEffect(() => {
    const handleMessage = (message: any) => {
      console.log('Side panel received:', message.type);

      if (message.type === 'ELEMENT_SELECTED') {
        const { selector, text } = message.data;
        setRules(prev => {
          if (prev.some(r => r.selector === selector)) return prev;

          const newRule: SelectorRule = {
            id: Date.now().toString(),
            type: 'dom',
            fieldName: `field_${prev.length + 1}`,
            selector,
            attribute: 'innerText',
            exampleValue: text?.slice(0, 50)
          };
          return [...prev, newRule];
        });
        setActiveTab('config');
      } else if (message.type === 'PREVIEW_DATA') {
        setPreviewData(message.data);
      } else if (message.type === 'JSON_INTERCEPTED') {
        setInterceptedJson(message.data);
        if (message.request) {
          setNetworkRequests(prev => {
            // 避免重复
            if (prev.some(r => r.id === message.request.id)) return prev;
            return [...prev, message.request];
          });
          setSelectedRequestId(message.request.id);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // 切换选择模式
  const toggleSelecting = useCallback(() => {
    const newState = !isSelecting;
    setIsSelecting(newState);

    chrome.runtime.sendMessage({
      type: newState ? 'START_SELECTING' : 'STOP_SELECTING'
    });
  }, [isSelecting]);

  // 请求预览数据
  const requestPreview = useCallback(() => {
    if (rules.length > 0 && activeTask?.sourceType === 'dom') {
      chrome.runtime.sendMessage({
        type: 'GET_PREVIEW',
        rules
      });
    }
  }, [rules, activeTask?.sourceType]);

  useEffect(() => {
    if (rules.length > 0) {
      requestPreview();
    } else {
      setPreviewData([]);
    }
  }, [rules, requestPreview]);

  const handleAddTask = () => {
    const domain = getDomain(currentUrl);
    const newTask: Task = {
      id: Date.now().toString(),
      name: `${domain} 采集`,
      status: 'idle',
      url: currentUrl,
      sourceType: 'dom',
      paginationType: 'none',
      count: 0
    };
    setTasks([...tasks, newTask]);
    setActiveTaskId(newTask.id);
    setRules([]);
    setActiveTab('config');
  };

  const handleUpdateTaskConfig = (updates: Partial<Task>) => {
    if (activeTaskId) {
      setTasks(prev => prev.map(t =>
        t.id === activeTaskId ? { ...t, ...updates } : t
      ));
    }
  };

  const handleSwitchSourceType = (type: 'dom' | 'json') => {
    setRules([]);
    handleUpdateTaskConfig({ sourceType: type });
    if (type === 'dom') {
      setInterceptedJson(null);
      setNetworkRequests([]);
    }
  };

  // 设置拦截 URL
  const handleSetInterceptUrl = (url: string) => {
    handleUpdateTaskConfig({ interceptUrl: url });
    chrome.runtime.sendMessage({
      type: 'SET_INTERCEPT_URL',
      url
    });
  };

  const handleRemoveRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateRule = (id: string, field: keyof SelectorRule, value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleAddJsonRule = (path: string, value: any) => {
    const fieldName = path.split('.').pop() || `field_${rules.length + 1}`;
    const newRule: SelectorRule = {
      id: Date.now().toString(),
      type: 'json',
      fieldName,
      selector: path,
      exampleValue: String(value).slice(0, 50)
    };
    setRules(prev => [...prev, newRule]);
  };

  const handleRunTask = () => {
    if (!activeTask || rules.length === 0) return;

    chrome.runtime.sendMessage({
      type: 'RUN_TASK',
      rules,
      config: activeTask
    });
    handleUpdateTaskConfig({ status: 'active' });
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Command size={18} className="text-blue-500" />
          <span className="font-semibold text-white">VeilCrawler</span>
        </div>
        {activeTask?.sourceType === 'dom' && (
          <button
            onClick={toggleSelecting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              isSelecting
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {isSelecting ? <Power size={12} /> : <PowerOff size={12} />}
            {isSelecting ? '采集中' : '开始采集'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 shrink-0">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'tasks'
              ? 'border-blue-500 text-blue-400 bg-gray-800/50'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Layers size={14} /> 任务
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'config'
              ? 'border-purple-500 text-purple-400 bg-gray-800/50'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Settings size={14} /> 配置
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'tasks' && (
          <div className="p-3 space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 uppercase font-semibold">
                任务列表 ({tasks.length})
              </span>
              <button
                onClick={handleAddTask}
                className="p-1 hover:bg-gray-800 rounded text-blue-400"
              >
                <Plus size={14} />
              </button>
            </div>

            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => { setActiveTaskId(task.id); setActiveTab('config'); }}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  activeTaskId === task.id
                    ? 'bg-gray-800 border-blue-500/50'
                    : 'bg-gray-800/30 border-gray-800 hover:bg-gray-800'
                }`}
              >
                <div className="text-sm font-medium text-white">{task.name}</div>
                <div className="text-xs text-gray-500 mt-1 truncate">{task.url}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'config' && activeTask && (
          <div className="flex flex-col h-full">
            {/* 数据源切换 */}
            <div className="p-2 border-b border-gray-800 shrink-0">
              <div className="flex bg-gray-800 rounded p-0.5 border border-gray-700">
                <button
                  onClick={() => handleSwitchSourceType('dom')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded flex items-center justify-center gap-1.5 transition-all ${
                    activeTask.sourceType === 'dom'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Code size={12} /> DOM 元素
                </button>
                <button
                  onClick={() => handleSwitchSourceType('json')}
                  className={`flex-1 px-3 py-1.5 text-xs rounded flex items-center justify-center gap-1.5 transition-all ${
                    activeTask.sourceType === 'json'
                      ? 'bg-yellow-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Braces size={12} /> JSON 数据
                </button>
              </div>
            </div>

            {/* DOM 模式 */}
            {activeTask.sourceType === 'dom' && (
              <>
                <div className={`px-3 py-2 text-xs flex items-center gap-2 border-b border-gray-800 shrink-0 ${
                  isSelecting ? 'bg-green-900/30 text-green-300' : 'bg-gray-800/50 text-gray-500'
                }`}>
                  <MousePointer2 size={12} />
                  {isSelecting ? '点击页面元素添加字段' : '点击右上角开始采集'}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                  {rules.map(rule => (
                    <div key={rule.id} className="bg-gray-800/50 rounded p-2 border border-gray-700 group">
                      <div className="flex items-center justify-between mb-1">
                        <input
                          value={rule.fieldName}
                          onChange={(e) => handleUpdateRule(rule.id, 'fieldName', e.target.value)}
                          className="bg-transparent text-xs font-bold text-white border-b border-transparent focus:border-blue-500 outline-none w-24"
                        />
                        <div className="flex items-center gap-1">
                          <select
                            value={rule.attribute}
                            onChange={(e) => handleUpdateRule(rule.id, 'attribute', e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded px-1 text-[10px] text-gray-400 outline-none"
                          >
                            <option value="innerText">Text</option>
                            <option value="innerHTML">HTML</option>
                            <option value="href">Href</option>
                            <option value="src">Src</option>
                          </select>
                          <button
                            onClick={() => handleRemoveRule(rule.id)}
                            className="text-gray-600 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-950 rounded px-2 py-1 text-[10px] font-mono text-gray-500 truncate">
                        {rule.selector}
                      </div>
                    </div>
                  ))}

                  {rules.length === 0 && (
                    <div className="text-center py-8 text-gray-600 text-xs border border-dashed border-gray-800 rounded">
                      暂无规则，请在页面上选择元素
                    </div>
                  )}
                </div>
              </>
            )}

            {/* JSON 模式 */}
            {activeTask.sourceType === 'json' && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* 拦截 URL 设置 */}
                <div className="p-3 border-b border-gray-800 shrink-0">
                  <label className="text-[10px] text-gray-500 uppercase font-semibold block mb-1">
                    拦截 URL（支持 * 通配符）
                  </label>
                  <input
                    type="text"
                    value={activeTask.interceptUrl || ''}
                    onChange={(e) => handleSetInterceptUrl(e.target.value)}
                    placeholder="/api/products 或 *.json"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-yellow-400 font-mono focus:border-yellow-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">
                    设置后刷新页面，匹配的请求会被拦截
                  </p>
                </div>

                <div className="px-3 py-2 text-xs text-yellow-300 bg-yellow-900/20 border-b border-gray-800 shrink-0 flex items-center justify-between">
                  <span>
                    <Globe size={12} className="inline mr-1" />
                    已拦截 {networkRequests.length} 个请求
                  </span>
                  <button
                    onClick={() => { setNetworkRequests([]); setInterceptedJson(null); }}
                    className="text-gray-500 hover:text-white"
                    title="清空"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* 网络请求列表 */}
                {networkRequests.length > 0 && (
                  <div className="border-b border-gray-800 max-h-28 overflow-y-auto shrink-0">
                    {networkRequests.map(req => (
                      <div
                        key={req.id}
                        onClick={() => setSelectedRequestId(req.id)}
                        className={`px-3 py-1.5 text-[10px] cursor-pointer border-b border-gray-800/50 ${
                          selectedRequestId === req.id
                            ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
                            : 'hover:bg-gray-800'
                        }`}
                      >
                        <span className={`font-bold mr-2 ${req.method === 'GET' ? 'text-green-400' : 'text-yellow-400'}`}>
                          {req.method}
                        </span>
                        <span className="text-gray-400 truncate">{req.url.split('/').pop()?.split('?')[0] || req.url}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* JSON 查看器 */}
                {interceptedJson ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-2 min-h-0">
                      <div className="bg-gray-950 p-2 rounded border border-gray-800 h-full overflow-auto">
                        <JsonNode name="root" value={interceptedJson} path="" onSelect={handleAddJsonRule} />
                      </div>
                    </div>

                    {rules.length > 0 && (
                      <div className="border-t border-gray-800 p-2 max-h-32 overflow-y-auto shrink-0">
                        <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">已选字段</div>
                        {rules.map(rule => (
                          <div key={rule.id} className="flex justify-between items-center text-[10px] bg-gray-800 p-1.5 mb-1 rounded">
                            <span className="text-green-400 font-mono">{rule.fieldName}</span>
                            <span className="text-gray-500 truncate flex-1 mx-2">{rule.selector}</span>
                            <button onClick={() => handleRemoveRule(rule.id)} className="text-gray-600 hover:text-red-400">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
                    <div className="text-center">
                      <Globe size={24} className="mx-auto mb-2 opacity-50" />
                      {activeTask.interceptUrl ? (
                        <>
                          <p>等待匹配的请求...</p>
                          <p className="text-[10px] mt-1">刷新页面触发网络请求</p>
                        </>
                      ) : (
                        <>
                          <p>请先设置拦截 URL</p>
                          <p className="text-[10px] mt-1">例如: /api/list 或 *.json</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 翻页设置 */}
            <div className="p-3 border-t border-gray-800 shrink-0">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-2">翻页模式</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'none', label: '无', icon: Ban },
                  { id: 'scroll', label: '滚动', icon: ArrowDownToLine },
                  { id: 'click', label: '点击', icon: MousePointerClick },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => handleUpdateTaskConfig({ paginationType: id as PaginationType })}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-[10px] transition-colors ${
                      activeTask.paginationType === id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 预览 */}
            {previewData.length > 0 && activeTask.sourceType === 'dom' && (
              <div className="border-t border-gray-800 max-h-32 overflow-auto shrink-0">
                <div className="px-3 py-1 bg-gray-950 text-[10px] text-gray-500 uppercase font-semibold sticky top-0">
                  预览 ({previewData.length})
                </div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-gray-800">
                      {Object.keys(previewData[0]).map(key => (
                        <th key={key} className="p-1 text-left text-gray-400 font-medium">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="p-1 text-gray-500 truncate max-w-[80px]">{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 运行按钮 */}
            <div className="p-3 border-t border-gray-800 shrink-0">
              <button
                onClick={handleRunTask}
                disabled={rules.length === 0}
                className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Play size={14} /> 运行采集
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
