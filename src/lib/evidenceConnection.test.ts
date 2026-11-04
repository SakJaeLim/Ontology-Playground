import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectEvidenceReview, EvidenceClient } from './evidenceConnection';

const ontology = { name: 'Dataset', description: '정의', entityTypes: [], relationships: [] };
const state = { revision: 'generation-1', ontology, notices: [] };
const fetchMock = vi.fn<typeof fetch>();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { hostname: '127.0.0.1' });
});

afterEach(() => vi.unstubAllGlobals());

describe('local evidence connection', () => {
  it('requires loopback and the expected capability protocol', async () => {
    vi.stubGlobal('location', { hostname: 'example.com' });
    expect(await connectEvidenceReview()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal('location', { hostname: '127.0.0.1' });
    fetchMock.mockResolvedValueOnce(json({ connected: true, protocol: 'other', csrfToken: 'secret' }));
    expect(await connectEvidenceReview()).toBeNull();
  });

  it('sends a revision and CSRF header only to the same-origin editor endpoint', async () => {
    fetchMock.mockResolvedValueOnce(json({ connected: true, protocol: 'evidence-connection-v1', csrfToken: 'test-token' }));
    const client = await connectEvidenceReview();
    fetchMock.mockResolvedValueOnce(json(state));
    await expect(client?.save('generation-1', ontology)).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/editor', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-token' },
      body: JSON.stringify({ expectedRevision: 'generation-1', ontology }),
    }));
  });

  it('rejects malformed ontology and revision responses', async () => {
    const client = new EvidenceClient('token');
    fetchMock.mockResolvedValueOnce(json({ ...state, ontology: { ...ontology, entityTypes: 'wrong' } }));
    await expect(client.read()).rejects.toThrow('온톨로지 형식');
    fetchMock.mockResolvedValueOnce(json({ ...state, revision: '' }));
    await expect(client.read()).rejects.toThrow('버전');
  });

  it('preserves conflict status for a stale save', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'stale_revision', message: 'Workspace changed' }, 409));
    await expect(new EvidenceClient('token').save('old', ontology)).rejects.toMatchObject({ status: 409, message: 'Workspace changed' });
  });

  it('accepts an empty workspace without manufacturing an ontology', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...state, ontology: null }));
    await expect(new EvidenceClient('token').read()).resolves.toMatchObject({ ontology: null });
  });
});
