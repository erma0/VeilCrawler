import React, { useState, useRef, useEffect } from 'react';
import { Task, AppMode } from '../types';
import { Plus, FileText, CheckCircle2, Circle, Edit2, Check, X, Globe, Link as LinkIcon, Layout, MousePointer2, Copy, Lock } from 'lucide-react';
import { normalizeUrl, getDomain } from '../utils/urlUtils';

interface TaskPanelProps {
  tasks: Task[];
  activeTaskId: string | null;
  mode: AppMode;
  targetUrl: string;
  onSetMode: (mode: AppMode) => void;
  onSelectTask: (taskId: string) => void;
  onAddTask: (url: string, name?: string) => void;
  onUpdateTask: (task: Task) => void;
  onGoHome: () => void;
}

const TaskPanel: React.FC<TaskPanelProps> = ({ 
  tasks, 
  activeTaskId, 
  mode,
  targetUrl,
  onSetMode,
  onSelectTask, 
  onAddTask, 
  onUpdateTask, 
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState(false);
  const newNameInputRef = useRef<HTMLInputElement>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isCreating && newNameInputRef.current) newNameInputRef.current.focus();
  }, [isCreating]);

  const handleConfirmCreate = () => {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) { setCreateError(true); return; }
    const cleanUrl = normalizeUrl(trimmedUrl);
    onAddTask(cleanUrl, newName.trim());
    setIsCreating(false);
    setNewUrl('');
    setNewName('');
    setCreateError(false);
  };

  const startEditing = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(task.id);
    setEditForm({ ...task });
  };

  const saveEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId && editForm) {
      const original = tasks.find(t => t.id === editingId);
      if (original) onUpdateTask({ ...original, ...editForm } as Task);
      setEditingId(null);
    }
  };

  const handleCopyUrl = () => {
    if (!targetUrl) return;
    navigator.clipboard.writeText(targetUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-300">
      
      {/* Top Actions: Mode & Current URL info */}
      <div className="flex flex-col border-b border-gray-800 bg-gray-900/50 p-3 gap-2 shrink-0">
         {/* Mode Toggle */}
         <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
            <button 
               onClick={() => onSetMode(AppMode.BROWSE)}
               className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-medium transition-all ${mode === AppMode.BROWSE ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
             >
               <Layout size={12} /> 浏览模式
             </button>
             <button 
               onClick={() => onSetMode(AppMode.COLLECT)}
               className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[10px] font-medium transition-all ${mode === AppMode.COLLECT ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
             >
               <MousePointer2 size={12} /> 采集模式
             </button>
          </div>

          {/* Current URL (Read only) */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-950 rounded border border-gray-800 text-[10px]">
             <Lock size={10} className="text-green-500 shrink-0" />
             <span className="truncate flex-1 font-mono text-gray-500" title={targetUrl}>{targetUrl}</span>
             <button onClick={handleCopyUrl} className="text-gray-500 hover:text-white">
                {isCopied ? <Check size={10} className="text-green-500"/> : <Copy size={10}/>}
             </button>
          </div>
      </div>

      {/* Task List Header */}
      <div className="px-3 py-2 flex justify-between items-center text-xs text-gray-400 font-semibold uppercase tracking-wider bg-gray-900">
        <span>全部任务 ({tasks.length})</span>
        <button 
          onClick={() => setIsCreating(true)}
          className="p-1 hover:bg-gray-800 rounded text-blue-400 hover:text-blue-300 transition-colors"
          title="新建任务"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {isCreating && (
          <div className="bg-gray-800 border border-blue-500 rounded p-3 animate-fade-in shadow-lg">
             <div className="flex items-center gap-2 mb-2 text-xs font-bold text-blue-400">
              <LinkIcon size={12} /> <span>新建任务</span>
            </div>
            <input 
              ref={newNameInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none mb-2 placeholder-gray-500"
              placeholder="任务名称 (可选)"
            />
            <input 
              value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setCreateError(false); }}
              className={`w-full bg-gray-900 border rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none mb-2 ${createError ? 'border-red-500' : 'border-gray-600'}`}
              placeholder="https://example.com"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsCreating(false)} className="px-2 py-1 text-[10px] hover:bg-gray-700 rounded text-gray-400">取消</button>
              <button onClick={handleConfirmCreate} className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white">确定</button>
            </div>
          </div>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => { if (editingId !== task.id) onSelectTask(task.id); }}
            className={`group flex flex-col p-3 rounded border transition-all cursor-pointer ${
              activeTaskId === task.id 
                ? 'bg-gray-800 border-blue-500/50 shadow-md' 
                : 'bg-gray-800/30 border-gray-800 hover:bg-gray-800 hover:border-gray-700'
            }`}
          >
            {editingId === task.id ? (
              <div className="flex flex-col gap-2 animate-fade-in" onClick={e => e.stopPropagation()}>
                <input 
                  value={editForm.name || ''}
                  onChange={e => setEditForm(prev => ({...prev, name: e.target.value}))}
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                  autoFocus
                />
                 <input 
                  value={editForm.url || ''}
                  onChange={e => setEditForm(prev => ({...prev, url: e.target.value}))}
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-400 focus:border-blue-500 outline-none"
                />
                <div className="flex justify-end gap-2 mt-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 hover:bg-gray-700 rounded text-gray-400"><X size={14}/></button>
                  <button onClick={saveEditing} className="p-1 bg-blue-600 hover:bg-blue-500 rounded text-white"><Check size={14}/></button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                 <div className={`mt-0.5 ${activeTaskId === task.id ? 'text-blue-400' : 'text-gray-600'}`}>
                   <FileText size={16} />
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-start">
                     <span className={`text-xs font-medium truncate ${activeTaskId === task.id ? 'text-gray-100' : 'text-gray-400'}`}>{task.name}</span>
                     <button onClick={(e) => startEditing(task, e)} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                       <Edit2 size={12} />
                     </button>
                   </div>
                   <div className="flex items-center gap-1.5 mt-1">
                     {task.status === 'active' ? <Circle size={8} className="text-blue-500 fill-blue-500"/> : <CheckCircle2 size={8} className={task.status === 'completed' ? "text-green-500" : "text-gray-600"} />}
                     <Globe size={10} className="text-gray-500" />
                     <span className="text-[10px] text-gray-500 truncate">{getDomain(task.url)}</span>
                   </div>
                 </div>
              </div>
            )}
          </div>
        ))}

        {tasks.length === 0 && !isCreating && (
          <div className="text-center py-8 text-gray-600 text-xs">
            暂无任务，请点击右上角 + 新建
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskPanel;