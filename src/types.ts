export type PaginationType = 'none' | 'scroll' | 'click';

export interface Task {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'completed';
  url: string;
  sourceType: 'dom' | 'json';
  interceptUrl?: string;
  interceptEnabled?: boolean; // 是否启用拦截
  paginationType: PaginationType;
  nextPageSelector?: string;
  maxItems?: number;
  pageInterval?: number;  // 翻页间隔（毫秒）
  deduplicate?: boolean;  // 是否去重
  autoReload?: boolean;   // 是否在无数据时自动刷新页面
  count: number;
}

export interface SelectorRule {
  id: string;
  type: 'dom' | 'json';
  fieldName: string;
  selector: string;
  selectorType?: 'css' | 'xpath';  // 选择器类型
  attribute?: string;
  exampleValue?: string;
  isUniqueKey?: boolean; // 是否作为去重主键
}

export interface CollectedData {
  [key: string]: string | number | null;
}

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}
