import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorSyncStore } from '@/stores/useEditorSyncStore';

describe('useEditorSyncStore', () => {
  beforeEach(() => {
    useEditorSyncStore.getState().reset();
  });

  it('starts in the saved state with no edits', () => {
    const state = useEditorSyncStore.getState();
    expect(state.syncStatus).toBe('saved');
    expect(state.hasEditedSinceLastSync).toBe(false);
    expect(state.lastErrorMessage).toBeNull();
  });

  it('transitions saved → unsaved after an edit, then syncing → saved on save', () => {
    useEditorSyncStore.getState().markEdited();
    expect(useEditorSyncStore.getState().syncStatus).toBe('unsaved');
    expect(useEditorSyncStore.getState().hasEditedSinceLastSync).toBe(true);

    useEditorSyncStore.getState().setSyncing();
    expect(useEditorSyncStore.getState().syncStatus).toBe('syncing');

    useEditorSyncStore.getState().setSaved();

    const state = useEditorSyncStore.getState();
    expect(state.syncStatus).toBe('saved');
    // setSaved clears the edit flag so leaving after a save does not prompt.
    expect(state.hasEditedSinceLastSync).toBe(false);
    expect(state.lastErrorMessage).toBeNull();
  });

  it('transitions to error on a failed save and keeps the edit flag', () => {
    useEditorSyncStore.getState().markEdited();
    useEditorSyncStore.getState().setSyncing();
    useEditorSyncStore.getState().setError('网络请求失败');

    const state = useEditorSyncStore.getState();
    expect(state.syncStatus).toBe('error');
    expect(state.lastErrorMessage).toBe('网络请求失败');
    // A failed save leaves unsaved edits — still block leaving.
    expect(state.hasEditedSinceLastSync).toBe(true);
  });

  it('recovers from error back to saved via a successful retry', () => {
    useEditorSyncStore.getState().setError('保存失败');

    useEditorSyncStore.getState().setSyncing();
    useEditorSyncStore.getState().setSaved();

    const state = useEditorSyncStore.getState();
    expect(state.syncStatus).toBe('saved');
    expect(state.lastErrorMessage).toBeNull();
    expect(state.hasEditedSinceLastSync).toBe(false);
  });

  it('reset restores the initial saved state', () => {
    useEditorSyncStore.getState().markEdited();
    useEditorSyncStore.getState().setError('保存失败');

    useEditorSyncStore.getState().reset();

    const state = useEditorSyncStore.getState();
    expect(state.syncStatus).toBe('saved');
    expect(state.lastErrorMessage).toBeNull();
    expect(state.hasEditedSinceLastSync).toBe(false);
  });
});
