import React from 'react';
import { NetworkRequest } from '../types';
import { Search, Filter, Database, Trash2 } from 'lucide-react';

interface NetworkPanelProps {
  requests: NetworkRequest[];
  onSelectRequest: (req: NetworkRequest) => void;
  selectedRequestId: string | null;
}

const NetworkPanel: React.FC<NetworkPanelProps> = ({ requests, onSelectRequest, selectedRequestId }) => {
  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-700 text-gray-300 shadow-xl w-80 pointer-events-auto">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 bg-gray-850">
        <h2 className="text-sm font-bold flex items-center gap-2 text-white">
          <Database size={14} className="text-blue-400" />
          网络请求 (Network)
        </h2>
        <div className="mt-2 relative">
          <Search className="absolute left-2 top-1.5 text-gray-500" size={14} />
          <input 
            type="text" 
            placeholder="Filter URL..." 
            className="w-full bg-gray-800 text-xs border border-gray-600 rounded pl-7 pr-2 py-1 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700 text-xs">
        <div className="flex gap-2">
          <button className="hover:text-white"><Filter size={12} /></button>
          <span className="text-gray-500">|</span>
          <button className="text-green-400 font-semibold">JSON</button>
          <button className="hover:text-white">XHR</button>
          <button className="hover:text-white">Doc</button>
        </div>
        <button className="text-gray-500 hover:text-red-400"><Trash2 size={12}/></button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
        {requests.map((req) => (
          <div 
            key={req.id}
            onClick={() => onSelectRequest(req)}
            className={`px-3 py-2 border-b border-gray-800 cursor-pointer text-xs hover:bg-gray-800 transition-colors ${selectedRequestId === req.id ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'}`}
          >
            <div className={`font-mono font-bold mb-0.5 ${req.method === 'GET' ? 'text-green-400' : 'text-yellow-400'}`}>
              {req.method}
            </div>
            <div className="truncate text-gray-300" title={req.url}>
              {req.url.split('/').pop() || req.url}
            </div>
            <div className="flex justify-between mt-1 text-gray-500 text-[10px]">
              <span>{req.status}</span>
              <span>{req.type}</span>
              <span>{req.size}</span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer Status */}
      <div className="p-1 px-3 text-[10px] bg-gray-950 text-gray-500 flex justify-between">
        <span>{requests.length} requests</span>
        <span>Recording...</span>
      </div>
    </div>
  );
};

export default NetworkPanel;
