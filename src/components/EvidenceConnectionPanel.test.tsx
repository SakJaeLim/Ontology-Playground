import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ontology } from '../data/ontology';
import { useDesignerStore } from '../store/designerStore';
import { connectEvidenceReview, EvidenceClient, EvidenceConnectionError } from '../lib/evidenceConnection';
import type { EvidenceState } from '../lib/evidenceConnection';
import { EvidenceConnectionPanel } from './EvidenceConnectionPanel';

vi.mock('../lib/evidenceConnection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/evidenceConnection')>();
  return { ...original, connectEvidenceReview: vi.fn() };
});

const source: Ontology = {
  name: 'Dataset', description: '공공 데이터 사전',
  entityTypes: [{ id: 'dataset', name: 'Dataset', description: '원래 설명', properties: [], icon: 'D', color: '#0078D4' }],
  relationships: [],
};
const state: EvidenceState = { revision: 'generation-1', ontology: source, notices: ['SQL은 원본에 보존됩니다.'] };
let client: EvidenceClient;

beforeEach(() => {
  useDesignerStore.getState().resetDraft();
  client = new EvidenceClient('test-token');
  vi.spyOn(client, 'read').mockResolvedValue(structuredClone(state));
  vi.spyOn(client, 'save').mockImplementation(async (_revision, ontology) => ({ ...state, revision: 'generation-2', ontology }));
  vi.mocked(connectEvidenceReview).mockResolvedValue(client);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function loadWorkspace() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '작업 공간 불러오기' }));
  await screen.findByText('작업 공간을 불러왔습니다. 설명을 수정한 뒤 검토로 보내세요.');
  return user;
}

describe('EvidenceConnectionPanel', () => {
  it('does not change the draft or read a workspace until explicitly loaded', async () => {
    const before = useDesignerStore.getState().ontology;
    const onLoad = vi.fn();
    render(<EvidenceConnectionPanel onLoad={onLoad} />);
    await screen.findByRole('heading', { name: '근거 검토 연결' });
    expect(client.read).not.toHaveBeenCalled();
    expect(useDesignerStore.getState().ontology).toBe(before);
    expect(screen.getByRole('button', { name: '검토로 보내기' })).toBeDisabled();
    await loadWorkspace();
    expect(onLoad).toHaveBeenCalledOnce();
    expect(useDesignerStore.getState().ontology).toEqual(source);
    expect(screen.getByText('SQL은 원본에 보존됩니다.')).toBeInTheDocument();
  });

  it('publishes the actual edited draft and advances its save revision', async () => {
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const user = await loadWorkspace();
    act(() => useDesignerStore.getState().updateEntity('dataset', { description: '수정된 설명' }));
    await user.click(screen.getByRole('button', { name: '검토로 보내기' }));
    await screen.findByText('검토할 내용을 저장했습니다. 승인은 검토 화면에서 별도로 진행합니다.');
    expect(client.save).toHaveBeenCalledWith('generation-1', expect.objectContaining({
      entityTypes: [expect.objectContaining({ description: '수정된 설명' })],
    }), expect.any(AbortSignal));
    await user.click(screen.getByRole('button', { name: '검토로 보내기' }));
    await waitFor(() => expect(client.save).toHaveBeenLastCalledWith('generation-2', expect.anything(), expect.any(AbortSignal)));
    expect(screen.getByRole('link', { name: '검토 화면' })).toHaveAttribute('href', '/');
  });

  it('retains edits and the original revision after a stale save', async () => {
    vi.mocked(client.save).mockRejectedValue(new EvidenceConnectionError('stale', 409));
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const user = await loadWorkspace();
    act(() => useDesignerStore.getState().updateEntity('dataset', { description: '보존할 내용' }));
    await user.click(screen.getByRole('button', { name: '검토로 보내기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('현재 편집 내용은 유지했습니다');
    expect(useDesignerStore.getState().ontology.entityTypes[0].description).toBe('보존할 내용');
    expect(screen.getByText('아직 보내지 않은 편집 내용')).toBeInTheDocument();
  });

  it('does not overwrite edits made while a workspace load is pending', async () => {
    let finish!: (value: EvidenceState) => void;
    vi.mocked(client.read).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '작업 공간 불러오기' }));
    act(() => useDesignerStore.getState().setOntologyName('진행 중인 편집'));
    await act(async () => finish(state));
    expect(screen.getByRole('alert')).toHaveTextContent('불러오는 동안 편집 내용이 바뀌었습니다');
    expect(useDesignerStore.getState().ontology.name).toBe('진행 중인 편집');
  });

  it('retains later edits when a save completes', async () => {
    let finish!: (value: EvidenceState) => void;
    vi.mocked(client.save).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const user = await loadWorkspace();
    await user.click(screen.getByRole('button', { name: '검토로 보내기' }));
    act(() => useDesignerStore.getState().setOntologyDescription('전송 중 추가한 내용'));
    const reviewLink = screen.getByRole('link', { name: '검토 화면' });
    expect(reviewLink).toHaveAttribute('target', '_blank');
    expect(reviewLink).toHaveAttribute('rel', 'noopener noreferrer');
    await act(async () => finish({ ...state, revision: 'generation-2' }));
    expect(screen.getByRole('status')).toHaveTextContent('추가한 편집 내용은 아직 보내지 않았습니다');
    expect(useDesignerStore.getState().ontology.description).toBe('전송 중 추가한 내용');
    expect(reviewLink).toHaveAttribute('target', '_blank');
  });

  it('stays absent when the service is unavailable', async () => {
    vi.mocked(connectEvidenceReview).mockResolvedValue(null);
    const { container } = render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    await waitFor(() => expect(connectEvidenceReview).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the binding and unsent edits after navigating away and remounting', async () => {
    const view = render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    await loadWorkspace();
    act(() => useDesignerStore.getState().updateEntity('dataset', { description: '돌아와서 보낼 설명' }));
    view.unmount();
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const submit = await screen.findByRole('button', { name: '검토로 보내기' });
    expect(submit).toBeEnabled();
    expect(screen.getByText('아직 보내지 않은 편집 내용')).toBeInTheDocument();
    await userEvent.setup().click(submit);
    await waitFor(() => expect(client.save).toHaveBeenCalledWith('generation-1', expect.objectContaining({
      entityTypes: [expect.objectContaining({ description: '돌아와서 보낼 설명' })],
    }), expect.any(AbortSignal)));
    expect(client.read).toHaveBeenCalledTimes(1);
  });

  it('does not replace the current draft or context with an oversized workspace', async () => {
    const oversized = { ...source, entityTypes: Array.from({ length: 1000 }, (_, index) => ({ ...source.entityTypes[0], id: `entity-${index}` })) };
    vi.mocked(client.read).mockResolvedValue({ ...state, ontology: oversized });
    const before = useDesignerStore.getState().ontology;
    const onLoad = vi.fn();
    render(<EvidenceConnectionPanel onLoad={onLoad} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '작업 공간 불러오기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too large for safe all-at-once editing');
    expect(useDesignerStore.getState().ontology).toBe(before);
    expect(onLoad).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '검토로 보내기' })).toBeDisabled();
  });

  it.each(['reset', 'replace'] as const)('clears the binding on an explicit %s', async (replacement) => {
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    await loadWorkspace();
    act(() => {
      const store = useDesignerStore.getState();
      if (replacement === 'reset') store.resetDraft();
      else store.loadDraft({ ...source, name: 'Another draft' });
    });
    expect(useDesignerStore.getState().evidenceBinding).toBeNull();
    expect(screen.getByRole('button', { name: '검토로 보내기' })).toBeDisabled();
  });

  it('does not reattach an old binding after a pending save and draft replacement', async () => {
    let finish!: (value: EvidenceState) => void;
    vi.mocked(client.save).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    const user = await loadWorkspace();
    await user.click(screen.getByRole('button', { name: '검토로 보내기' }));
    const replacement = { ...source, name: 'Replacement draft' };
    act(() => useDesignerStore.getState().loadDraft(replacement));
    await act(async () => finish({ ...state, revision: 'generation-2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('다른 초안을 열었습니다');
    expect(useDesignerStore.getState().ontology).toBe(replacement);
    expect(useDesignerStore.getState().evidenceBinding).toBeNull();
    expect(screen.getByRole('button', { name: '검토로 보내기' })).toBeDisabled();
  });

  it('rejects a pending load if the draft was replaced with the same ontology object', async () => {
    let finish!: (value: EvidenceState) => void;
    vi.mocked(client.read).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<EvidenceConnectionPanel onLoad={vi.fn()} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '작업 공간 불러오기' }));
    const before = useDesignerStore.getState().ontology;
    act(() => useDesignerStore.getState().loadDraft(before));
    await act(async () => finish(state));
    expect(screen.getByRole('alert')).toHaveTextContent('불러오는 동안 편집 내용이 바뀌었습니다');
    expect(useDesignerStore.getState().ontology).toBe(before);
    expect(useDesignerStore.getState().evidenceBinding).toBeNull();
  });
});
