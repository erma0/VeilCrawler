import React, { useState } from 'react';
import { Search, Command, ArrowRight, AlertCircle } from 'lucide-react';
import { normalizeUrl } from '../utils/urlUtils';

interface StartPageProps {
  onStart: (url: string) => void;
}

const StartPage: React.FC<StartPageProps> = ({ onStart }) => {
  const [url, setUrl] = useState('example.com/products');
  const [error, setError] = useState('');

  const validate = (input: string) => {
    if (!input.trim()) return '请输入网址';
    // Simple check: must contain at least one dot and not start/end with dot
    if (!/^[^.]+\.[^.]+/.test(input)) return '请输入有效的网址格式 (如 example.com)';
    return '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(url);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    const cleanUrl = normalizeUrl(url);
    onStart(cleanUrl);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-900 text-white pointer-events-auto">
      <div className="w-full max-w-2xl px-8 flex flex-col items-center animate-fade-in-up">
        {/* Logo / Icon */}
        <div className="mb-8 p-4 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700">
          <Command size={48} className="text-blue-500" />
        </div>

        <h1 className="text-4xl font-bold mb-4 tracking-tight">WebView2 Scraper</h1>
        <p className="text-gray-400 mb-10 text-center text-lg">
          请输入目标网站 URL 开始可视化采集任务
        </p>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="w-full relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="text-gray-500" size={20} />
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError('');
            }}
            className={`w-full bg-gray-800 text-lg py-4 pl-12 pr-16 rounded-xl border focus:outline-none focus:ring-2 transition-all shadow-lg placeholder-gray-600 ${
              error 
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                : 'border-gray-700 focus:border-blue-500 focus:ring-blue-500/20'
            }`}
            placeholder="example.com..."
            autoFocus
          />
          <button
            type="submit"
            className="absolute inset-y-2 right-2 bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg flex items-center justify-center transition-colors"
          >
            <ArrowRight size={20} />
          </button>
        </form>
        
        {/* Error Message */}
        <div className="h-6 mt-2 w-full px-1">
          {error && (
            <div className="flex items-center gap-1 text-red-400 text-xs animate-fade-in">
              <AlertCircle size={12} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Recent / Quick Links */}
        <div className="mt-8 flex gap-4 text-sm text-gray-500">
          <span>推荐示例:</span>
          <button onClick={() => { setUrl('shop.example.com'); setError(''); }} className="hover:text-blue-400 transition-colors">电商列表</button>
          <button onClick={() => { setUrl('news.example.com'); setError(''); }} className="hover:text-blue-400 transition-colors">新闻详情</button>
          <button onClick={() => { setUrl('api.example.com/data'); setError(''); }} className="hover:text-blue-400 transition-colors">API 数据</button>
        </div>
      </div>
    </div>
  );
};

export default StartPage;
