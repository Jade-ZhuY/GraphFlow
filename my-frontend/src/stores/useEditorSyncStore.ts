import { create } from 'zustand';

export type SyncStatus = 'saved' | 'unsaved' | 'syncing' | 'error';

interface EditorSyncState {
  /** 画布保存状态。手动保存模式下：编辑后为 unsaved，点保存转 syncing，成功 saved，失败 error。 */
  syncStatus: SyncStatus;
  /** 是否发生过编辑但尚未保存。用于离开确认。 */
  hasEditedSinceLastSync: boolean;
  /** 最近一次保存失败的错误信息，仅 syncStatus === 'error' 时有意义。 */
  lastErrorMessage: string | null;

  setSyncing: () => void;
  setSaved: () => void;
  setError: (message: string) => void;
  /** 标记一次编辑操作已发生（mutation 入口调用），置为 unsaved。 */
  markEdited: () => void;
  /** 重置为初始 saved 态（加载项目、切换项目时调用）。 */
  reset: () => void;
}

const INITIAL: Pick<
  EditorSyncState,
  'syncStatus' | 'hasEditedSinceLastSync' | 'lastErrorMessage'
> = {
  syncStatus: 'saved',
  hasEditedSinceLastSync: false,
  lastErrorMessage: null,
};

export const useEditorSyncStore = create<EditorSyncState>((set) => ({
  ...INITIAL,

  setSyncing: () => set({ syncStatus: 'syncing' }),

  // 保存成功即画布与后端一致，编辑标记随之清零——保存后离开不再弹确认。
  setSaved: () =>
    set({
      syncStatus: 'saved',
      hasEditedSinceLastSync: false,
      lastErrorMessage: null,
    }),

  setError: (message) =>
    set({ syncStatus: 'error', lastErrorMessage: message }),

  markEdited: () =>
    set({ syncStatus: 'unsaved', hasEditedSinceLastSync: true }),

  reset: () => set({ ...INITIAL }),
}));
