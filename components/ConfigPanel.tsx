import React, { useState, useRef, useEffect } from 'react';
import { SelectorRule, CollectedData, SelectionMode, Task, PaginationType } from '../types';
import JsonTreeViewer from './JsonTreeViewer';
import { Settings, Play, Download, Plus, Trash, Code, Braces, MousePointer2, AlertCircle, GripHorizontal, SlidersHorizontal, MousePointerClick, ArrowDownToLine, Ban, Trash2, X } from 'lucide-react';

interface ConfigPanelProps {
  activeTask: Task | undefined;
  rules: SelectorRule[];
  previewData: CollectedData[]; 
  selectionMode: SelectionMode;
  onSetSelectionMode: (mode: SelectionMode) => void;
  onRemoveRule: (id: string) => void;
  onClearRules: () => void; 
  onUpdateRule: (id: string, field: keyof SelectorRule, value: string) => void;
  onAddJsonRule: (path: string, example: any) => void;
  onAddManualRule: (type: 'dom' | 'json') => void;
  onUpdateTaskConfig: (updates: Partial<Task>) => void;
  onSwitchSourceType: (type: 'dom' | 'json') => void;
  onRunTask: () => void;
}

// NOTE: Same mock data as before
const DISPLAY_JSON_DATA = {
  status: "success",
  data: {
    total: 4,
    items: [
      { id: 101, name: "Widget A", price: 19.99, stock: true },
      { id: 102, name: "Widget B", price: 39.99, stock: false }
    ],
    meta: { page: 1, limit: 20 }
  }
};

const ConfigPanel: React.FC<ConfigPanelProps> = ({ 
  activeTask,
  rules, 
  previewData, 
  selectionMode,
  onSetSelectionMode,
  onRemoveRule, 
  onClearRules,
  onUpdateRule,
  onAddJsonRule,
  onAddManualRule,
  onUpdateTaskConfig,
  onSwitchSourceType,
  onRunTask
}) => {
  
  const [previewHeight, setPreviewHeight] = useState(200); 
  const [view, setView] = useState<'content' | 'settings'>('content');
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setView('content');
  }, [activeTask?.id]);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'row-resize';
  };

  const stopResizing = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = '';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY;
    const maxHeight = containerRect.height * 0.7;
    const minHeight = 35; 
    if (newHeight >= minHeight && newHeight <= maxHeight) setPreviewHeight(newHeight);
  };

  const handleTabClick = (tab: 'dom' | 'json' | 'settings') => {
    if (tab === 'settings') {
      setView('settings');
      if (selectionMode === SelectionMode.PAGINATION) onSetSelectionMode(SelectionMode.DOM);
    } else {
      setView('content');
      if (activeTask && activeTask.sourceType !== tab) onSwitchSourceType(tab);
    }
  };

  if (!activeTask) return <div className="h-full flex items-center justify-center text-gray-500 text-xs">No Active Task</div>;

  const activeTabUI = view === 'settings' ? 'settings' : activeTask.sourceType;

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-gray-900 text-gray-300">
      
      {/* Sub-Header Actions */}
      <div className="p-2 border-b border-gray-800 bg-gray-900 flex justify-between items-center shrink-0">
        <div className="flex gap-2">
           <button 
             onClick={onRunTask}
             className="p-1.5 bg-green-700 hover:bg-green-600 rounded text-white flex items-center gap-1 text-[10px] px-3 transition-colors shadow-sm"
           >
             <Play size={10} /> RUN
           </button>
        </div>
        <div className="flex bg-gray-800 rounded p-0.5 border border-gray-700">
           {['dom', 'json', 'settings'].map((t) => (
             <button
                key={t}
                onClick={() => handleTabClick(t as any)}
                className={`px-3 py-1 text-[10px] rounded transition-all ${activeTabUI === t ? 'bg-gray-600 text-white font-medium shadow' : 'text-gray-400 hover:text-white'}`}
             >
                {t === 'dom' && '元素'}
                {t === 'json' && 'JSON'}
                {t === 'settings' && '设置'}
             </button>
           ))}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-gray-900">
        
        {/* --- SETTINGS --- */}
        {view === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">拦截 URL</label>
              <input 
                type="text" 
                value={activeTask.interceptUrl || ''}
                onChange={(e) => onUpdateTaskConfig({ interceptUrl: e.target.value })}
                placeholder="/api/v1/products"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-yellow-500 font-mono focus:border-yellow-500 outline-none"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase">翻页模式</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'none', label: '无', icon: Ban },
                  { id: 'scroll', label: '滚动', icon: ArrowDownToLine },
                  { id: 'click', label: '点击', icon: MousePointerClick },
                ].map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => onUpdateTaskConfig({ paginationType: type.id as PaginationType })}
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded border transition-colors ${activeTask.paginationType === type.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                    >
                      <Icon size={14} />
                      <span className="text-[10px]">{type.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {activeTask.paginationType === 'click' && (
                <div className="bg-gray-800 p-2 rounded border border-gray-700 animate-fade-in">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-gray-400">下一页按钮 Selector</span>
                         <button 
                            onClick={() => onSetSelectionMode(selectionMode === SelectionMode.PAGINATION ? SelectionMode.DOM : SelectionMode.PAGINATION)}
                            className={`p-1 rounded text-[10px] flex items-center gap-1 border ${selectionMode === SelectionMode.PAGINATION ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}
                        >
                            <MousePointer2 size={10} /> 选取
                        </button>
                    </div>
                    <input 
                        value={activeTask.nextPageSelector || ''}
                        onChange={(e) => onUpdateTaskConfig({ nextPageSelector: e.target.value })}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[10px] font-mono text-gray-300 outline-none"
                    />
                </div>
            )}
          </div>
        )}

        {/* --- DOM RULES --- */}
        {view === 'content' && activeTask.sourceType === 'dom' && (
          <>
            <div className="bg-blue-900/20 px-3 py-2 text-[10px] text-blue-300 border-b border-blue-900/30 flex items-center gap-2 shrink-0">
              <MousePointer2 size={10} />
              点击页面元素自动添加采集字段
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-900">
               {rules.map(rule => (
                  <div key={rule.id} className="bg-gray-800/50 rounded p-2 border border-gray-700 group relative hover:border-blue-500/50 transition-colors">
                    <button onClick={() => onRemoveRule(rule.id)} className="absolute top-2 right-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash size={12} /></button>
                    <div className="flex gap-2 mb-1.5">
                       <input 
                        value={rule.fieldName}
                        onChange={(e) => onUpdateRule(rule.id, 'fieldName', e.target.value)}
                        className="w-1/3 bg-transparent border-b border-gray-600 text-xs font-bold text-white focus:border-blue-500 outline-none pb-0.5" 
                        placeholder="字段名"
                      />
                       <select 
                          value={rule.attribute}
                          onChange={(e) => onUpdateRule(rule.id, 'attribute', e.target.value)}
                          className="w-1/3 bg-gray-900 border border-gray-600 rounded px-1 text-[10px] text-gray-400 outline-none h-5"
                        >
                          <option value="innerText">Text</option>
                          <option value="innerHTML">HTML</option>
                          <option value="href">Href</option>
                          <option value="src">Src</option>
                        </select>
                    </div>
                    <div className="bg-gray-950 rounded px-2 py-1 border border-gray-800 flex items-center gap-2">
                       <Code size={10} className="text-gray-600"/>
                       <input 
                          value={rule.selector}
                          onChange={(e) => onUpdateRule(rule.id, 'selector', e.target.value)}
                          className="flex-1 bg-transparent text-[10px] font-mono text-gray-400 truncate outline-none" 
                        />
                    </div>
                  </div>
               ))}
               {rules.length === 0 && (
                   <div className="text-center py-6 text-gray-600 text-xs border border-dashed border-gray-800 rounded">暂无规则</div>
               )}
                <div className="pt-2 flex justify-center">
                    <button onClick={() => onAddManualRule('dom')} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10}/> 手动添加</button>
                </div>
            </div>
          </>
        )}
        
        {/* --- JSON RULES --- */}
        {view === 'content' && activeTask.sourceType === 'json' && (
           <div className="h-full flex flex-col">
              <div className="flex-1 overflow-hidden p-2">
                  <JsonTreeViewer data={DISPLAY_JSON_DATA} onSelectPath={(p, v) => onAddJsonRule(p, v)} />
              </div>
              <div className="h-1/3 border-t border-gray-800 bg-gray-850 p-2 overflow-y-auto">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Selected Fields</span>
                    <button onClick={onClearRules} className="text-gray-500 hover:text-red-400"><Trash2 size={10}/></button>
                 </div>
                 {rules.map(rule => (
                    <div key={rule.id} className="flex justify-between items-center text-[10px] bg-gray-800 p-1 mb-1 rounded">
                        <span className="text-green-400 font-mono mr-2">{rule.fieldName}</span>
                        <span className="text-gray-500 truncate flex-1">{rule.selector}</span>
                        <button onClick={() => onRemoveRule(rule.id)} className="text-gray-600 hover:text-red-400 ml-2"><X size={10}/></button>
                    </div>
                 ))}
              </div>
           </div>
        )}

      </div>

      {/* Resizer */}
      <div onMouseDown={startResizing} className="h-1 bg-gray-950 border-t border-gray-800 cursor-row-resize hover:bg-blue-500/50 flex justify-center items-center shrink-0 z-10">
        <GripHorizontal size={10} className="text-gray-700" />
      </div>

      {/* PREVIEW TABLE */}
      <div className="bg-gray-900 flex flex-col shrink-0" style={{ height: previewHeight }}>
        <div className="px-3 py-1 bg-gray-950 border-b border-gray-800 flex justify-between items-center shrink-0">
          <span className="text-[10px] font-semibold text-gray-500 uppercase">Preview ({previewData.length})</span>
        </div>
        <div className="flex-1 overflow-auto bg-gray-900">
           {previewData.length > 0 ? (
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr>
                   {Object.keys(previewData[0]).map(key => (
                     <th key={key} className="p-1.5 border-b border-gray-800 bg-gray-800 text-[9px] text-gray-400 font-medium whitespace-nowrap sticky top-0">
                       {key}
                     </th>
                   ))}
                 </tr>
               </thead>
               <tbody>
                 {previewData.map((row, i) => (
                   <tr key={i} className="hover:bg-gray-800">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="p-1.5 border-b border-gray-800/50 text-[10px] text-gray-400 whitespace-nowrap font-mono max-w-[100px] truncate">
                          {String(val)}
                        </td>
                      ))}
                   </tr>
                 ))}
               </tbody>
             </table>
           ) : (
             <div className="h-full flex items-center justify-center text-gray-700 text-[10px]">
               No Data
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;