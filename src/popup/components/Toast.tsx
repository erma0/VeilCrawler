import React, { useEffect } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <Check size={16} className="text-green-400" />,
    error: <AlertCircle size={16} className="text-red-400" />,
    info: <Info size={16} className="text-blue-400" />
  };

  const bgColors = {
    success: 'bg-gray-800 border-green-500/50',
    error: 'bg-gray-800 border-red-500/50',
    info: 'bg-gray-800 border-blue-500/50'
  };

  return (
    <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border ${bgColors[type]} z-50 animate-fade-in-up min-w-[200px]`}>
      {icons[type]}
      <span className="text-xs text-white flex-1">{message}</span>
      <button 
        onClick={onClose}
        className="text-gray-500 hover:text-white transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default Toast;
