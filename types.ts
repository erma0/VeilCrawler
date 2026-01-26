export enum AppMode {
  BROWSE = 'BROWSE',
  COLLECT = 'COLLECT',
}

export enum SelectionMode {
  DOM = 'DOM',
  JSON = 'JSON',
  PAGINATION = 'PAGINATION', // New mode for picking 'Next Page' button
}

export type PaginationType = 'none' | 'scroll' | 'click';

export interface Task {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'completed';
  url: string;
  // Configuration Settings
  sourceType: 'dom' | 'json'; // Enforces mutual exclusivity
  interceptUrl?: string; 
  paginationType: PaginationType;
  nextPageSelector?: string;
  maxItems?: number;
  count: number;
}

export interface SelectorRule {
  id: string;
  type: 'dom' | 'json';
  fieldName: string; // e.g., "title", "price"
  selector: string; // CSS Selector or JSON Path
  attribute?: string; // e.g., "innerText", "href" (Only for DOM)
  exampleValue?: string;
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

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  type: string;
  size: string;
}