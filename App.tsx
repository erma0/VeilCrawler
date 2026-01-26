import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TaskPanel from './components/TaskPanel';
import ConfigPanel from './components/ConfigPanel';
import Highlighter from './components/Highlighter';
import { Task, SelectorRule, CollectedData, AppMode, HighlightRect, SelectionMode } from './types';
import { getSmartSelector, getUniqueSelector, getElementRect } from './utils/domUtils';
import { getDomain } from './utils/urlUtils';
import { Minus, Layers, Settings, Command } from 'lucide-react';

// --- Mock Data ---
const MOCK_API_RESPONSE = {
  status: "success",
  data: {
    total: 4,
    items: [
      { id: 101, name: "Widget A", price: 19.99, stock: true },
      { id: 102, name: "Widget B", price: 39.99, stock: false }
    ]
  }
};

const App: React.FC = () => {
  // --- Global State ---
  const [targetUrl, setTargetUrl] = useState(window.location.href);
  
  // --- UI State ---
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'config'>('tasks');
  const [mode, setMode] = useState<AppMode>(AppMode.COLLECT);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(SelectionMode.DOM);
  
  // Tasks & Rules
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [rules, setRules] = useState<SelectorRule[]>([]);
  
  // Interaction State
  const [hoverRect, setHoverRect] = useState<HighlightRect | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string>('');
  
  // Initialize
  useEffect(() => {
    const domain = getDomain(window.location.href);
    const initialTask: Task = {
      id: 'init-1',
      name: `${domain} Task`,
      status: 'idle',
      url: window.location.href,
      sourceType: 'dom',
      interceptUrl: '',
      paginationType: 'none',
      count: 0
    };
    setTasks([initialTask]);
    setActiveTaskId(initialTask.id);
  }, []);

  const activeTask = tasks.find(t => t.id === activeTaskId);

  // --- Handlers ---

  const handleAddTask = (url: string, name?: string) => {
    const domain = getDomain(url);
    const newTask: Task = {
      id: Date.now().toString(),
      name: name || `${domain} Task`,
      status: 'idle',
      url: url,
      sourceType: 'dom',
      interceptUrl: '',
      paginationType: 'none',
      count: 0
    };
    setTasks([...tasks, newTask]);
    setActiveTaskId(newTask.id);
    setActiveTab('config'); // Auto switch to config
  };

  const handleSelectTask = (taskId: string) => {
    setActiveTaskId(taskId);
    setActiveTab('config');
  };

  const handleUpdateActiveTaskConfig = (updates: Partial<Task>) => {
    if (activeTaskId) {
      setTasks(prev => prev.map(t => 
        t.id === activeTaskId ? { ...t, ...updates } : t
      ));
    }
  };

  const handleRunTask = () => {
    if (!activeTask) return;
    alert(`Running Task: ${activeTask.name}\nRules: ${rules.length}`);
    handleUpdateActiveTaskConfig({ status: 'active' });
  };

  const handleClearRules = () => setRules([]);

  // --- Core Logic: Element Picking ---
  
  const isExtensionElement = (el: HTMLElement) => {
    return el.closest('#veil-crawler-extension-root');
  };

  const handleElementClick = useCallback((e: MouseEvent) => {
    if (mode === AppMode.BROWSE) return;
    const target = e.target as HTMLElement;
    if (isExtensionElement(target)) return;

    e.preventDefault();
    e.stopPropagation();

    if (activeTask?.sourceType === 'json') return;
    
    if (selectionMode === SelectionMode.DOM) {
      const selector = getSmartSelector(target);
      const text = target.innerText.slice(0, 50); 
      const newRule: SelectorRule = {
        id: Date.now().toString(),
        type: 'dom',
        fieldName: `field_${rules.length + 1}`,
        selector: selector,
        attribute: 'innerText',
        exampleValue: text
      };
      setRules(prev => [...prev, newRule]);
      
      // Auto switch to config tab if not already there to show the new rule
      if (activeTab !== 'config') setActiveTab('config');
    }
    else if (selectionMode === SelectionMode.PAGINATION) {
      const selector = getUniqueSelector(target);
      handleUpdateActiveTaskConfig({ nextPageSelector: selector });
      setSelectionMode(SelectionMode.DOM);
      if (activeTab !== 'config') setActiveTab('config');
    }
  }, [mode, selectionMode, rules, activeTaskId, activeTask, activeTab]); 

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (mode !== AppMode.COLLECT || isMinimized) {
      setHoverRect(null);
      return;
    }
    if ((selectionMode !== SelectionMode.DOM && selectionMode !== SelectionMode.PAGINATION) || activeTask?.sourceType === 'json') {
       setHoverRect(null);
       return;
    }
    const target = e.target as HTMLElement;
    if (isExtensionElement(target)) {
      setHoverRect(null);
      return;
    }
    setHoverRect(getElementRect(target));
    setHoverLabel(getSmartSelector(target));
  }, [mode, selectionMode, activeTask, isMinimized]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleElementClick, { capture: true });
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleElementClick, { capture: true });
    };
  }, [handleMouseMove, handleElementClick]);

  // --- Preview Data Logic ---
  const previewData = useMemo(() => {
    if (rules.length === 0) return [];
    if (activeTask?.sourceType === 'dom') {
      const extractedColumns = rules.map(rule => {
        let elements: NodeListOf<HTMLElement>;
        try { elements = document.querySelectorAll(rule.selector); } catch (e) { return { field: rule.fieldName, values: [] }; }
        const values = Array.from(elements).map(el => {
          if (rule.attribute === 'href') return (el as HTMLAnchorElement).href || '';
          if (rule.attribute === 'src') return (el as HTMLImageElement).src || '';
          if (rule.attribute === 'innerHTML') return el.innerHTML;
          return el.innerText || '';
        });
        return { field: rule.fieldName, values };
      });
      const maxRows = Math.max(...extractedColumns.map(c => c.values.length), 0);
      const rows: CollectedData[] = [];
      for (let i = 0; i < maxRows; i++) {
        const row: CollectedData = {};
        extractedColumns.forEach(col => row[col.field] = col.values[i]);
        rows.push(row);
      }
      return rows;
    }
    // Simple JSON Mock
    if (activeTask?.sourceType === 'json') {
        // ... (Simplified logic for brevity, same as before)
        return [{ id: 101, name: "Widget A" }, { id: 102, name: "Widget B" }];
    }
    return [];
  }, [rules, activeTask?.sourceType]);


  return (
    <div className="w-full h-full relative pointer-events-none font-sans">
      
      {/* FLOATING CONTROL PANEL */}
      <div 
        className={`fixed right-4 top-4 z-[2147483647] bg-gray-900 border border-gray-700 shadow-2xl rounded-xl flex flex-col transition-all duration-300 pointer-events-auto overflow-hidden ${
          isMinimized ? 'w-12 h-12 rounded-full cursor-pointer hover:scale-105' : 'w-[420px] h-[650px]'
        }`}
      >
        {isMinimized ? (
           <button 
             onClick={() => setIsMinimized(false)}
             className="w-full h-full flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-blue-500 rounded-full shadow-lg border border-gray-600"
             title="Open VeilCrawler"
           >
             <Command size={24} />
           </button>
        ) : (
          <>
            {/* Header */}
            <div className="h-10 bg-gray-950 flex items-center justify-between px-4 border-b border-gray-800 shrink-0 select-none">
              <div className="flex items-center gap-2 text-gray-100 font-semibold text-sm">
                <Command size={16} className="text-blue-500"/>
                <span>VeilCrawler</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsMinimized(true)}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                >
                  <Minus size={16} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-gray-900 border-b border-gray-800 shrink-0">
              <button 
                onClick={() => setActiveTab('tasks')}
                className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'tasks' ? 'border-blue-500 text-blue-400 bg-gray-800/50' : 'border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
              >
                <Layers size={14} /> 任务列表
              </button>
              <button 
                onClick={() => setActiveTab('config')}
                disabled={!activeTask}
                className={`flex-1 py-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'config' ? 'border-purple-500 text-purple-400 bg-gray-800/50' : 'border-transparent text-gray-500 hover:bg-gray-800 hover:text-gray-300'} ${!activeTask ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Settings size={14} /> 
                {activeTask ? '配置: ' + (activeTask.name.length > 10 ? activeTask.name.slice(0,10)+'...' : activeTask.name) : '当前配置'}
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative bg-gray-900">
               {activeTab === 'tasks' && (
                 <TaskPanel 
                    tasks={tasks}
                    activeTaskId={activeTaskId}
                    mode={mode}
                    targetUrl={targetUrl}
                    onSetMode={setMode}
                    onSelectTask={handleSelectTask}
                    onAddTask={handleAddTask}
                    onUpdateTask={(t) => setTasks(prev => prev.map(pt => pt.id === t.id ? t : pt))}
                    onGoHome={() => {}}
                 />
               )}
               {activeTab === 'config' && (
                 <ConfigPanel 
                   activeTask={activeTask}
                   rules={rules}
                   previewData={previewData}
                   selectionMode={selectionMode}
                   onSetSelectionMode={setSelectionMode}
                   onRemoveRule={(id) => setRules(p => p.filter(r => r.id !== id))}
                   onClearRules={handleClearRules}
                   onUpdateRule={(id, f, v) => setRules(p => p.map(r => r.id === id ? { ...r, [f]: v } : r))}
                   onAddJsonRule={(path, val) => {
                       const newRule: SelectorRule = {
                        id: Date.now().toString(),
                        type: 'json',
                        fieldName: path.split('.').pop() || `field_${rules.length + 1}`,
                        selector: path,
                        exampleValue: String(val)
                      };
                      setRules(prev => [...prev, newRule]);
                   }}
                   onAddManualRule={(type) => {
                      const newRule: SelectorRule = {
                        id: Date.now().toString(),
                        type: type,
                        fieldName: `field_${rules.length + 1}`,
                        selector: type === 'dom' ? 'div' : 'data',
                        attribute: 'innerText',
                        exampleValue: 'New Rule'
                      };
                      setRules(prev => [...prev, newRule]);
                   }}
                   onUpdateTaskConfig={handleUpdateActiveTaskConfig}
                   onSwitchSourceType={(t) => {
                      setRules([]);
                      handleUpdateActiveTaskConfig({ sourceType: t });
                      setSelectionMode(t === 'dom' ? SelectionMode.DOM : SelectionMode.JSON);
                   }}
                   onRunTask={handleRunTask}
                 />
               )}
            </div>
          </>
        )}
      </div>

      {/* HIGHLIGHTER LAYER */}
      {!isMinimized && mode === AppMode.COLLECT && (selectionMode === SelectionMode.DOM || selectionMode === SelectionMode.PAGINATION) && (
        <Highlighter 
          rect={hoverRect} 
          label={selectionMode === SelectionMode.PAGINATION ? 'Click to set Next Page Button' : hoverLabel} 
          isActive={false} 
        />
      )}

    </div>
  );
};

export default App;