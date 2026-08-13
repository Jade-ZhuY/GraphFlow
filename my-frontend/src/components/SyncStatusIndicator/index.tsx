import React from 'react';
import { Tooltip } from 'antd';
import { CheckCircle2, Loader2, AlertCircle, Edit3 } from 'lucide-react';
import { useEditorSyncStore } from '@/stores/useEditorSyncStore';
import './index.css';

interface SyncStatusIndicatorProps {
  /** 保存失败时点击「重试保存」，由 GraphEditor 提供。 */
  onRetry: () => void;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ onRetry }) => {
  const { syncStatus, lastErrorMessage } = useEditorSyncStore();

  if (syncStatus === 'syncing') {
    return (
      <Tooltip title="正在保存…">
        <span className="sync-indicator sync-indicator-syncing">
          <Loader2 size={14} className="sync-spin" />
          保存中
        </span>
      </Tooltip>
    );
  }

  if (syncStatus === 'error') {
    return (
      <Tooltip
        title={
          lastErrorMessage
            ? `保存失败：${lastErrorMessage} · 点击重试`
            : '保存失败 · 点击重试'
        }
      >
        <button
          type="button"
          className="sync-indicator sync-indicator-error"
          onClick={onRetry}
        >
          <AlertCircle size={14} />
          保存失败 · 点击重试
        </button>
      </Tooltip>
    );
  }

  if (syncStatus === 'unsaved') {
    return (
      <Tooltip title="有未保存的更改，点击保存按钮提交">
        <span className="sync-indicator sync-indicator-unsaved">
          <Edit3 size={14} />
          未保存
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title="画布与服务器一致">
      <span className="sync-indicator sync-indicator-saved">
        <CheckCircle2 size={14} />
        已保存
      </span>
    </Tooltip>
  );
};

export default SyncStatusIndicator;
