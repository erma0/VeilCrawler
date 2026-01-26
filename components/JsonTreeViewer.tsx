import React from 'react';
import { ChevronRight, ChevronDown, Braces, TextQuote } from 'lucide-react';

interface JsonTreeViewerProps {
  data: any;
  onSelectPath: (path: string, value: any) => void;
}

// Simple recursive component to visualize JSON and allow "picking"
const JsonNode: React.FC<{ 
  name: string; 
  value: any; 
  path: string; 
  onSelect: (path: string, value: any) => void; 
  level?: number 
}> = ({ name, value, path, onSelect, level = 0 }) => {
  const [expanded, setExpanded] = React.useState(true);
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);
  
  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    // For arrays, we generalize the path to help the user (e.g., items[0].id -> items[*].id)
    // simplistic logic for demo
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
          <span className="w-3.5 mr-1" /> // spacer
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

        {/* Hidden "Add" button that shows on hover */}
        <span className="ml-auto text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 bg-gray-900 px-1 rounded">
          + Select
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

const JsonTreeViewer: React.FC<JsonTreeViewerProps> = ({ data, onSelectPath }) => {
  return (
    <div className="bg-gray-950 p-2 rounded border border-gray-800 overflow-auto h-full">
      <JsonNode name="root" value={data} path="" onSelect={onSelectPath} />
    </div>
  );
};

export default JsonTreeViewer;
