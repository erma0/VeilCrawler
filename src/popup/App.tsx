import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Settings, Play, Trash2, Plus, MousePointer2, Ban, ArrowDownToLine, MousePointerClick, Power, Code, Braces, ChevronRight, ChevronDown, Globe, RefreshCw, Edit2, Check, X, FileJson, FileSpreadsheet, Copy, StopCircle, Upload, Download, Package, Link } from 'lucide-react';
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
  const [selectingMode, setSelectingMode] = useState<'element' | 'nextPage' | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [previewData, setPreviewData] = useState<CollectedData[]>([]);
  const [collectedData, setCollectedData] = useState<CollectedData[]>([]);
  const [interceptedJson, setInterceptedJson] = useState<any>(null);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  
  // 新建任务表单状态
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskUrl, setNewTaskUrl] = useState('');
  
  // URL 导入任务状态
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  
  // 页面更新触发器
  const [pageUpdateTrigger, setPageUpdateTrigger] = useState(0);
  
  // 结果预览区域折叠状态
  const [isPreviewCollapsed, setIsPreviewCollapsed] = useState(false);
  
  // 编辑任务状态
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editTaskUrl, setEditTaskUrl] = useState('');

  // 获取任务的规则数量
  const [taskRuleCounts, setTaskRuleCounts] = useState<Record<string, number>>({});

  // 加载所有任务的规则数量
  useEffect(() => {
    if (tasks.length > 0) {
      const keys = tasks.map(t => `rules_${t.id}`);
      chrome.storage.local.get(keys, (result) => {
        const counts: Record<string, number> = {};
        tasks.forEach(t => {
          const rules = result[`rules_${t.id}`] || [];
          counts[t.id] = rules.length;
        });
        setTaskRuleCounts(counts);
      });
    }
  }, [tasks]);

  // 更新当前任务的规则数量
  useEffect(() => {
    if (activeTaskId) {
      setTaskRuleCounts(prev => ({ ...prev, [activeTaskId]: rules.length }));
    }
  }, [rules.length, activeTaskId]);

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // 从 storage 加载任务
  useEffect(() => {
    chrome.storage.local.get(['tasks', 'activeTaskId', '_collectState'], (result) => {
      if (result.tasks && result.tasks.length > 0) {
        // 检查是否有正在进行的采集
        const collectState = result._collectState;
        const hasActiveCollect = collectState && collectState.isRunning && 
          (Date.now() - collectState.startTime < 5 * 60 * 1000); // 5分钟内有效
        
        // 重置所有 active 状态的任务为 idle（除非真的在采集中）
        const tasks = result.tasks.map((t: Task) => {
          if (t.status === 'active') {
            // 只有当前正在采集的任务保持 active
            if (hasActiveCollect && t.id === collectState.taskId) {
              return t;
            }
            return { ...t, status: 'idle' as const };
          }
          return t;
        });
        
        setTasks(tasks);
        setActiveTaskId(result.activeTaskId || tasks[0].id);
        
        // 如果没有有效的采集状态，清理它
        if (!hasActiveCollect && result._collectState) {
          chrome.storage.local.remove(['_collectState']);
        }
      }
    });
  }, []);

  // 保存任务到 storage
  useEffect(() => {
    if (tasks.length > 0) {
      chrome.storage.local.set({ tasks, activeTaskId });
    }
  }, [tasks, activeTaskId]);

  // 加载当前任务的规则
  useEffect(() => {
    if (activeTaskId) {
      chrome.storage.local.get([`rules_${activeTaskId}`], (result) => {
        const savedRules = result[`rules_${activeTaskId}`];
        if (savedRules) {
          setRules(savedRules);
        } else {
          setRules([]);
        }
      });
    }
  }, [activeTaskId]);

  // 保存规则
  useEffect(() => {
    if (activeTaskId) {
      chrome.storage.local.set({ [`rules_${activeTaskId}`]: rules });
    }
  }, [rules, activeTaskId]);

  // 获取当前标签页信息
  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          setCurrentUrl(tab.url);
          
          // 只有在没有任务时才创建初始任务
          chrome.storage.local.get(['tasks'], (result) => {
            if (!result.tasks || result.tasks.length === 0) {
              const domain = getDomain(tab.url!);
              const initialTask: Task = {
                id: 'init-1',
                name: `${domain} 采集`,
                status: 'idle',
                url: tab.url!,
                sourceType: 'dom',
                paginationType: 'none',
                count: 0
              };
              setTasks([initialTask]);
              setActiveTaskId(initialTask.id);
            }
          });
        }
      } catch (e) {
        console.error('Failed to get current tab:', e);
      }
    };
    
    getCurrentTab();
    
    // 监听标签页切换
    const handleTabActivated = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          setCurrentUrl(tabs[0].url);
        }
      });
    };
    
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (tab.active) {
        if (changeInfo.url) {
          handleTabActivated();
        }
        // 当页面加载完成或 URL 变化时，触发预览更新
        if (changeInfo.status === 'complete' || changeInfo.url) {
          setPageUpdateTrigger(prev => prev + 1);
        }
      }
    });
    
    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  // 使用 ref 保存最新的状态，避免闭包问题
  const selectingModeRef = React.useRef(selectingMode);
  const activeTaskIdRef = React.useRef(activeTaskId);
  
  useEffect(() => {
    selectingModeRef.current = selectingMode;
  }, [selectingMode]);
  
  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  // 监听来自 content script 的消息
  useEffect(() => {
    const handleMessage = (message: any) => {
      // 只处理从 background 转发的消息（带有 _fromContentScript 标记）
      if (!message._fromContentScript) return;
      
      console.log('Side panel received:', message.type);

      if (message.type === 'ELEMENT_SELECTED') {
        const { selector, xpath, text } = message.data;
        
        // 判断是选择元素还是选择下一页按钮
        if (selectingModeRef.current === 'nextPage') {
          // 直接更新任务配置，使用 ref 获取最新的 activeTaskId
          const taskId = activeTaskIdRef.current;
          if (taskId) {
            setTasks(prev => prev.map(t =>
              t.id === taskId ? { ...t, nextPageSelector: selector } : t
            ));
          }
          setSelectingMode(null);
          setIsSelecting(false);
          chrome.runtime.sendMessage({ type: 'STOP_SELECTING' });
        } else {
          setRules(prev => {
            // 允许同一选择器添加多次以获取不同属性
            const newRule: SelectorRule = {
              id: Date.now().toString(),
              type: 'dom',
              fieldName: `field_${prev.length + 1}`,
              selector,
              selectorType: 'css',
              attribute: 'innerText',
              exampleValue: text?.slice(0, 50)
            };
            // 保存两种选择器备用
            (newRule as any)._css = selector;
            (newRule as any)._xpath = xpath;
            return [...prev, newRule];
          });
          setActiveTab('config');
        }
      } else if (message.type === 'PREVIEW_DATA') {
        setPreviewData(message.data);
      } else if (message.type === 'COLLECT_RESULT') {
        // 采集完成
        setCollectedData(message.data);
        setTasks(prev => prev.map(t =>
          t.id === activeTaskIdRef.current ? { ...t, status: 'completed' as const, count: message.data.length } : t
        ));
      } else if (message.type === 'COLLECT_PROGRESS') {
        // 采集进度更新
        setCollectedData(message.data);
        setTasks(prev => prev.map(t =>
          t.id === activeTaskIdRef.current ? { ...t, count: message.data.length } : t
        ));
      } else if (message.type === 'COLLECT_RESUMED') {
        // 采集恢复（页面跳转后继续）
        console.log('VeilCrawler: 采集已恢复，已有', message.data.length, '条数据');
        setCollectedData(message.data);
        // 更新对应任务的状态
        if (message.taskId) {
          setTasks(prev => prev.map(t =>
            t.id === message.taskId ? { ...t, status: 'active' as const, count: message.data.length } : t
          ));
          setActiveTaskId(message.taskId);
        }
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
    setSelectingMode(newState ? 'element' : null);

    chrome.runtime.sendMessage({
      type: newState ? 'START_SELECTING' : 'STOP_SELECTING'
    });
  }, [isSelecting]);

  // 开始选择下一页按钮
  const startSelectNextPage = useCallback(() => {
    setIsSelecting(true);
    setSelectingMode('nextPage');
    chrome.runtime.sendMessage({ type: 'START_SELECTING' });
  }, []);

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
  }, [rules, requestPreview, pageUpdateTrigger]);

  const handleAddTask = () => {
    // 显示创建表单，默认使用当前 URL
    setNewTaskName('');
    setNewTaskUrl(currentUrl);
    setIsCreating(true);
  };

  // 生成不重复的任务名称
  const generateTaskName = (baseName: string) => {
    const existingNames = tasks.map(t => t.name);
    if (!existingNames.includes(baseName)) return baseName;
    
    let counter = 2;
    while (existingNames.includes(`${baseName} ${counter}`)) {
      counter++;
    }
    return `${baseName} ${counter}`;
  };

  const handleConfirmAddTask = () => {
    if (!newTaskUrl.trim()) return;
    
    const domain = getDomain(newTaskUrl);
    const baseName = newTaskName.trim() || `${domain} 采集`;
    const finalName = generateTaskName(baseName);
    
    const newTask: Task = {
      id: Date.now().toString(),
      name: finalName,
      status: 'idle',
      url: newTaskUrl.trim(),
      sourceType: 'dom',
      paginationType: 'none',
      count: 0
    };
    setTasks([...tasks, newTask]);
    setActiveTaskId(newTask.id);
    setRules([]);
    setIsCreating(false);
    setActiveTab('config');
  };

  const handleCancelAddTask = () => {
    setIsCreating(false);
    setNewTaskName('');
    setNewTaskUrl('');
  };

  // 删除任务
  const handleDeleteTask = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 删除任务对应的规则
    chrome.storage.local.remove([`rules_${taskId}`]);
    
    const remaining = tasks.filter(t => t.id !== taskId);
    setTasks(remaining);
    
    if (remaining.length === 0) {
      // 清空 storage 中的任务数据
      chrome.storage.local.remove(['tasks', 'activeTaskId']);
      setActiveTaskId(null);
      setRules([]);
    } else if (activeTaskId === taskId) {
      setActiveTaskId(remaining[0].id);
    }
  };

  // 开始编辑任务
  const handleStartEditTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTaskId(task.id);
    setEditTaskName(task.name);
    setEditTaskUrl(task.url);
  };

  // 保存编辑
  const handleSaveEditTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingTaskId || !editTaskUrl.trim()) return;
    
    // 检查名称是否与其他任务重复
    const newName = editTaskName.trim() || getDomain(editTaskUrl);
    const isDuplicate = tasks.some(t => t.id !== editingTaskId && t.name === newName);
    const finalName = isDuplicate ? generateTaskName(newName) : newName;
    
    setTasks(prev => prev.map(t => 
      t.id === editingTaskId 
        ? { ...t, name: finalName, url: editTaskUrl.trim() }
        : t
    ));
    setEditingTaskId(null);
  };

  // 取消编辑
  const handleCancelEditTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTaskId(null);
  };

  // 导出任务配置（单个）
  const handleExportTask = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 获取该任务的规则
    chrome.storage.local.get([`rules_${task.id}`], (result) => {
      const taskRules = result[`rules_${task.id}`] || [];
      
      const exportData = {
        task,
        rules: taskRules,
        version: '1.0.0',
        exportedAt: Date.now(),
        type: 'single_task'
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `veil_task_${task.name}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // 批量导出所有任务
  const handleExportAllTasks = () => {
    if (tasks.length === 0) return;

    // 获取所有任务的规则
    const ruleKeys = tasks.map(t => `rules_${t.id}`);
    chrome.storage.local.get(ruleKeys, (result) => {
      const exportData = {
        tasks: tasks.map(t => ({
          task: t,
          rules: result[`rules_${t.id}`] || []
        })),
        version: '1.0.0',
        exportedAt: Date.now(),
        type: 'batch_backup'
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `veil_backup_all_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // 处理导入数据逻辑
  const processImportData = (importData: any) => {
    try {
      const importedTasks: Task[] = [];
      const importedRules: Record<string, SelectorRule[]> = {};

      // 处理单个任务导入
      if (importData.task && importData.rules) {
        const newTaskId = Date.now().toString();
        const newTask: Task = {
          ...importData.task,
          id: newTaskId,
          name: generateTaskName(importData.task.name + ' (导入)'),
          status: 'idle',
          count: 0
        };
        importedTasks.push(newTask);
        importedRules[`rules_${newTaskId}`] = importData.rules;
      }
      // 处理批量备份导入
      else if (importData.type === 'batch_backup' && Array.isArray(importData.tasks)) {
        importData.tasks.forEach((item: any, index: number) => {
          if (item.task && item.rules) {
            const newTaskId = (Date.now() + index).toString();
            const newTask: Task = {
              ...item.task,
              id: newTaskId,
              name: generateTaskName(item.task.name + ' (导入)'),
              status: 'idle',
              count: 0
            };
            importedTasks.push(newTask);
            importedRules[`rules_${newTaskId}`] = item.rules;
          }
        });
      } else {
        alert('无效的任务文件格式');
        return;
      }
      
      if (importedTasks.length === 0) {
        alert('未找到有效的任务数据');
        return;
      }

      // 保存新任务
      const newTasks = [...tasks, ...importedTasks];
      setTasks(newTasks);
      
      // 保存规则
      chrome.storage.local.set(importedRules);
      
      // 如果只导入了一个任务，自动选中它
      if (importedTasks.length === 1) {
        const newTaskId = importedTasks[0].id;
        setActiveTaskId(newTaskId);
        setRules(importedRules[`rules_${newTaskId}`]);
        setActiveTab('config');
      }
      
      alert(`成功导入 ${importedTasks.length} 个任务！`);
    } catch (err) {
      console.error('Import failed:', err);
      alert('导入失败：数据格式错误');
    }
  };

  // 从 URL 导入任务 (开始)
  const handleStartImportTaskFromUrl = () => {
    setIsImportingUrl(true);
    setImportUrl('');
  };

  // 确认导入 URL
  const handleConfirmImportUrl = async () => {
    if (!importUrl.trim()) return;

    try {
      const res = await fetch(importUrl.trim());
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      processImportData(data);
      setIsImportingUrl(false);
      setImportUrl('');
    } catch (error) {
      console.error('Fetch failed:', error);
      alert('从 URL 导入失败，请检查链接是否有效且允许跨域访问。');
    }
  };

  // 取消导入 URL
  const handleCancelImportUrl = () => {
    setIsImportingUrl(false);
    setImportUrl('');
  };

  // 导入任务配置（支持单个或批量）
  const handleImportTask = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const importData = JSON.parse(content);
          processImportData(importData);
        } catch (err) {
          console.error('Import failed:', err);
          alert('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
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

  const handleUpdateRule = (id: string, field: keyof SelectorRule, value: string | boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value === 'true' ? true : value === 'false' ? false : value } : r));
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

    // 设置为运行中
    handleUpdateTaskConfig({ status: 'active' });
    setCollectedData([]);

    chrome.runtime.sendMessage({
      type: 'RUN_TASK',
      rules,
      config: activeTask
    });
  };

  // 停止任务
  const handleStopTask = () => {
    chrome.runtime.sendMessage({ type: 'STOP_TASK' });
    chrome.runtime.sendMessage({ type: 'CLEAR_COLLECT_STATE' }); // 清除保存的采集状态
    handleUpdateTaskConfig({ status: 'idle' });
  };

  // 重置任务状态
  const handleResetTask = () => {
    handleUpdateTaskConfig({ status: 'idle', count: 0 });
    setCollectedData([]);
  };

  // 导出为 JSON
  const handleExportJson = () => {
    const data = collectedData.length > 0 ? collectedData : previewData;
    if (data.length === 0) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTask?.name || 'data'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 CSV
  const handleExportCsv = () => {
    const data = collectedData.length > 0 ? collectedData : previewData;
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const val = String(row[h] || '').replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      )
    ];

    const blob = new Blob(['\ufeff' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTask?.name || 'data'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 复制到剪贴板
  const handleCopyData = () => {
    const data = collectedData.length > 0 ? collectedData : previewData;
    if (data.length === 0) return;

    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert('已复制到剪贴板');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-300">
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
              <div className="flex items-center gap-1">
                <button
                  onClick={handleStartImportTaskFromUrl}
                  className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white"
                  title="从 URL 导入任务"
                >
                  <Link size={14} />
                </button>
                <button
                  onClick={handleImportTask}
                  className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white"
                  title="导入任务 (文件)"
                >
                  <Upload size={14} />
                </button>
                <button
                  onClick={handleExportAllTasks}
                  className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white"
                  title="批量导出备份"
                  disabled={tasks.length === 0}
                >
                  <Package size={14} />
                </button>
                <button
                  onClick={handleAddTask}
                  className="p-1 hover:bg-gray-800 rounded text-blue-400"
                  disabled={isCreating}
                  title="新建任务"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* URL 导入表单 */}
            {isImportingUrl && (
              <div className="bg-gray-800 border border-blue-500/50 rounded p-3 space-y-2 mb-2">
                <div className="text-xs font-semibold text-blue-400 mb-2">从 URL 导入任务</div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">配置 URL</label>
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://example.com/task.json"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none font-mono"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={handleCancelImportUrl}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmImportUrl}
                    disabled={!importUrl.trim()}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded"
                  >
                    导入
                  </button>
                </div>
              </div>
            )}

            {/* 新建任务表单 */}
            {isCreating && (
              <div className="bg-gray-800 border border-blue-500/50 rounded p-3 space-y-2">
                <div className="text-xs font-semibold text-blue-400 mb-2">新建任务</div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">任务名称</label>
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="可选，默认使用域名"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">目标网址</label>
                  <input
                    type="text"
                    value={newTaskUrl}
                    onChange={(e) => setNewTaskUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={handleCancelAddTask}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmAddTask}
                    disabled={!newTaskUrl.trim()}
                    className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}

            {tasks.map(task => (
              <div
                key={task.id}
                onClick={() => { 
                  if (editingTaskId !== task.id) {
                    setActiveTaskId(task.id); 
                    setActiveTab('config'); 
                  }
                }}
                className={`p-3 rounded border cursor-pointer transition-colors group ${
                  activeTaskId === task.id
                    ? 'bg-gray-800 border-blue-500/50'
                    : 'bg-gray-800/30 border-gray-800 hover:bg-gray-800'
                }`}
              >
                {editingTaskId === task.id ? (
                  // 编辑模式
                  <div className="space-y-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTaskName}
                      onChange={(e) => setEditTaskName(e.target.value)}
                      placeholder="任务名称"
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editTaskUrl}
                      onChange={(e) => setEditTaskUrl(e.target.value)}
                      placeholder="目标网址"
                      className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none font-mono"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={handleCancelEditTask}
                        className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={handleSaveEditTask}
                        className="p-1 text-green-500 hover:text-white hover:bg-green-600 rounded"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{task.name}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{task.url}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          task.sourceType === 'dom' 
                            ? 'bg-blue-900/50 text-blue-400' 
                            : 'bg-yellow-900/50 text-yellow-400'
                        }`}>
                          {task.sourceType === 'dom' ? 'DOM' : 'JSON'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          task.status === 'active' 
                            ? 'bg-green-900/50 text-green-400'
                            : task.status === 'completed'
                            ? 'bg-purple-900/50 text-purple-400'
                            : (taskRuleCounts[task.id] || 0) > 0
                            ? 'bg-blue-900/50 text-blue-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {task.status === 'active' 
                            ? '运行中' 
                            : task.status === 'completed' 
                            ? `已完成 (${task.count || 0})` 
                            : (taskRuleCounts[task.id] || 0) > 0
                            ? `${taskRuleCounts[task.id]} 个规则`
                            : '待配置'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button
                        onClick={(e) => handleExportTask(task, e)}
                        className="p-1 text-gray-500 hover:text-green-400 hover:bg-gray-700 rounded"
                        title="导出配置"
                      >
                        <Download size={12} />
                      </button>
                      <button
                        onClick={(e) => handleStartEditTask(task, e)}
                        className="p-1 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded"
                        title="编辑"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {tasks.length === 0 && !isCreating && (
              <div className="text-center py-8 text-gray-600 text-xs border border-dashed border-gray-800 rounded">
                暂无任务，点击 + 新建
              </div>
            )}
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
                <div className={`px-3 py-2 text-xs flex items-center justify-between border-b border-gray-800 shrink-0 ${
                  isSelecting ? 'bg-green-900/30' : 'bg-gray-800/50'
                }`}>
                  <div className="flex items-center gap-2">
                    <MousePointer2 size={12} className={isSelecting ? 'text-green-300' : 'text-gray-500'} />
                    <span className={isSelecting ? 'text-green-300' : 'text-gray-500'}>
                      {isSelecting ? '点击页面元素添加字段' : '点击右侧按钮开始选择'}
                    </span>
                  </div>
                  <button
                    onClick={toggleSelecting}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      isSelecting
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isSelecting ? <Power size={12} /> : <MousePointer2 size={12} />}
                    {isSelecting ? '停止' : '选择元素'}
                  </button>
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
                          <div className="flex items-center gap-2 mr-2">
                            <label className="flex items-center gap-1.5 cursor-pointer group" title="勾选作为去重依据。&#10;支持多选：多选时表示这些字段组合起来必须唯一（联合主键）。">
                              <div className={`w-3 h-3 rounded border flex items-center justify-center transition-all ${
                                rule.isUniqueKey 
                                  ? 'bg-blue-600 border-blue-600' 
                                  : 'bg-gray-800 border-gray-600 group-hover:border-gray-500'
                              }`}>
                                {rule.isUniqueKey && <Check size={8} className="text-white" strokeWidth={4} />}
                              </div>
                              <input
                                type="checkbox"
                                checked={!!rule.isUniqueKey}
                                onChange={(e) => handleUpdateRule(rule.id, 'isUniqueKey', String(e.target.checked))}
                                className="hidden"
                              />
                              <span className={`text-[10px] font-medium transition-colors ${
                                rule.isUniqueKey ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-400'
                              }`}>主键</span>
                            </label>
                          </div>
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
                      <div className="flex items-center gap-1">
                        <select
                          value={rule.selectorType || 'css'}
                          onChange={(e) => {
                            const newType = e.target.value as 'css' | 'xpath';
                            const currentType = rule.selectorType || 'css';
                            
                            if (newType === currentType) return;
                            
                            // 保存当前选择器到备用字段
                            if (currentType === 'css') {
                              (rule as any)._css = rule.selector;
                            } else {
                              (rule as any)._xpath = rule.selector;
                            }
                            
                            // 切换到新类型，使用备用选择器
                            const backup = newType === 'xpath' ? (rule as any)._xpath : (rule as any)._css;
                            if (backup) {
                              handleUpdateRule(rule.id, 'selector', backup);
                            }
                            handleUpdateRule(rule.id, 'selectorType', newType);
                          }}
                          className="bg-gray-900 border border-gray-700 rounded px-1 py-1 text-[10px] text-gray-400 outline-none shrink-0"
                        >
                          <option value="css">CSS</option>
                          <option value="xpath">XPath</option>
                        </select>
                        <input
                          value={rule.selector}
                          onChange={(e) => handleUpdateRule(rule.id, 'selector', e.target.value)}
                          className="flex-1 bg-gray-950 rounded px-2 py-1 text-[10px] font-mono text-gray-400 border border-transparent focus:border-blue-500 outline-none"
                          placeholder={rule.selectorType === 'xpath' ? 'XPath 表达式' : 'CSS 选择器'}
                        />
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
              <div className="flex gap-2">
                {[
                  { id: 'none', label: '无', icon: Ban },
                  { id: 'scroll', label: '滚动', icon: ArrowDownToLine },
                  { id: 'click', label: '点击', icon: MousePointerClick },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => handleUpdateTaskConfig({ paginationType: id as PaginationType })}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-[10px] transition-colors ${
                      activeTask.paginationType === id
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={10} />
                    {label}
                  </button>
                ))}
              </div>
              
              {/* 点击翻页选择器 */}
              {activeTask.paginationType === 'click' && (
                <div className="mt-1.5 flex items-center gap-1">
                  <input
                    type="text"
                    value={activeTask.nextPageSelector || ''}
                    onChange={(e) => handleUpdateTaskConfig({ nextPageSelector: e.target.value })}
                    placeholder="下一页按钮选择器"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[10px] text-white font-mono focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={startSelectNextPage}
                    className={`px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-colors ${
                      selectingMode === 'nextPage'
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <MousePointer2 size={10} />
                    {selectingMode === 'nextPage' ? '选择中' : '选取'}
                  </button>
                </div>
              )}
              
              {/* 翻页参数 */}
              {activeTask.paginationType !== 'none' && (
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">间隔:</span>
                    <input
                      type="number"
                      value={activeTask.pageInterval || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleUpdateTaskConfig({ pageInterval: val === '' ? 0 : parseInt(val) });
                      }}
                      placeholder="智能"
                      title="留空: 智能检测 DOM 变化 (推荐)&#10;设置数值: 固定等待时间 (毫秒)"
                      className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white focus:border-blue-500 outline-none placeholder-gray-600"
                    />
                    <span className="text-gray-600">ms</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">数量:</span>
                    <input
                      type="number"
                      value={activeTask.maxItems || ''}
                      onChange={(e) => handleUpdateTaskConfig({ maxItems: parseInt(e.target.value) || 0 })}
                      placeholder="不限"
                      className="w-14 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white focus:border-blue-500 outline-none"
                    />
                  </div>
                  
                  {/* 去重开关 - 放在同一行 */}
                  <label className="flex items-center gap-1.5 cursor-pointer group ml-auto" title="开启后将过滤重复数据&#10;可在字段配置中勾选“主键”来指定唯一标识">
                    <span className="text-gray-500 group-hover:text-gray-400 transition-colors">
                      去重
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={activeTask.deduplicate !== false} // 默认为 true
                        onChange={(e) => handleUpdateTaskConfig({ deduplicate: e.target.checked })}
                        className="peer sr-only"
                      />
                      <div className="w-6 h-3 bg-gray-700 rounded-full peer-checked:bg-blue-600 transition-colors"></div>
                      <div className="absolute left-0.5 top-0.5 w-2 h-2 bg-white rounded-full transition-transform peer-checked:translate-x-3"></div>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* 预览/结果 */}
            {(previewData.length > 0 || collectedData.length > 0) && activeTask.sourceType === 'dom' && (
              <div className="border-t border-gray-800 flex flex-col shrink-0 transition-all duration-300" style={{ maxHeight: isPreviewCollapsed ? '32px' : '200px' }}>
                <div 
                  className="px-3 py-1.5 bg-gray-950 flex items-center justify-between sticky top-0 shrink-0 cursor-pointer hover:bg-gray-900 transition-colors"
                  onClick={() => setIsPreviewCollapsed(!isPreviewCollapsed)}
                >
                  <div className="flex items-center gap-1.5">
                    {isPreviewCollapsed ? <ChevronRight size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">
                      {collectedData.length > 0 ? `结果 (${collectedData.length} 条)` : `预览 (${previewData.length} 条)`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={requestPreview}
                      className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded"
                      title="刷新预览"
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button
                      onClick={handleCopyData}
                      className="p-1 text-gray-500 hover:text-white hover:bg-gray-800 rounded"
                      title="复制"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={handleExportJson}
                      className="p-1 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded"
                      title="导出 JSON"
                    >
                      <FileJson size={12} />
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="p-1 text-gray-500 hover:text-green-400 hover:bg-gray-800 rounded"
                      title="导出 CSV"
                    >
                      <FileSpreadsheet size={12} />
                    </button>
                  </div>
                </div>
                {!isPreviewCollapsed && (
                  <div className="overflow-auto flex-1">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="bg-gray-800">
                          {Object.keys((collectedData.length > 0 ? collectedData : previewData)[0]).map(key => (
                            <th key={key} className="p-1 text-left text-gray-400 font-medium sticky top-0 bg-gray-800">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(collectedData.length > 0 ? collectedData : previewData).map((row, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="p-1 text-gray-500 truncate max-w-[100px]" title={String(val)}>{String(val)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 运行按钮 */}
            <div className="p-3 border-t border-gray-800 shrink-0">
              {activeTask.status === 'completed' ? (
                <div className="space-y-2">
                  <div className="text-center text-xs text-green-400">
                    ✓ 已采集 {activeTask.count || collectedData.length || previewData.length} 条数据
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleResetTask}
                      className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-medium transition-colors"
                    >
                      重新配置
                    </button>
                    <button
                      onClick={handleRunTask}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                    >
                      <Play size={12} /> 再次运行
                    </button>
                  </div>
                </div>
              ) : activeTask.status === 'active' ? (
                <div className="space-y-2">
                  {collectedData.length > 0 && (
                    <div className="text-center text-xs text-yellow-400">
                      已采集 {collectedData.length} 条...
                    </div>
                  )}
                  <button
                    onClick={handleStopTask}
                    className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <StopCircle size={14} /> 停止采集
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRunTask}
                  disabled={rules.length === 0}
                  className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Play size={14} /> 运行采集
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
