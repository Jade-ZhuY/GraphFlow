import type { ToolMode } from '@/types/graph';

export function canDragNodeInMode(toolMode: ToolMode): boolean {
  return toolMode === 'select';
}
