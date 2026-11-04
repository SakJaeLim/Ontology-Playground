import type { Ontology } from '../data/ontology';
import { parseOntologyValue } from './ontologySchema';

export interface EvidenceState {
  revision: string;
  ontology: Ontology | null;
  notices: string[];
}

export class EvidenceConnectionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EvidenceConnectionError';
    this.status = status;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit;
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  const text = await response.text();
  if (text.length > 2_097_152) throw new Error('검토 서비스 응답이 너무 큽니다.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('검토 서비스에서 올바른 응답을 받지 못했습니다.');
  }
  if (!response.ok) {
    const message = record(data) && boundedString(data.message, 2000)
      ? data.message
      : '검토 서비스 요청을 완료하지 못했습니다.';
    throw new EvidenceConnectionError(message, response.status);
  }
  return data;
}

function parseState(value: unknown): EvidenceState {
  if (!record(value) || !boundedString(value.revision, 256)
    || !Array.isArray(value.notices) || value.notices.length > 256
    || !value.notices.every((notice) => typeof notice === 'string' && notice.length <= 4096)) {
    throw new Error('작업 공간의 버전 또는 안내 정보를 읽을 수 없습니다.');
  }
  const parsed = value.ontology === null ? null : parseOntologyValue(value.ontology);
  if (parsed && !parsed.ontology) {
    throw new Error('작업 공간의 온톨로지 형식이 편집기와 맞지 않습니다.');
  }
  return { revision: value.revision, ontology: parsed?.ontology ?? null, notices: value.notices };
}

export class EvidenceClient {
  private readonly csrfToken: string;

  constructor(csrfToken: string) {
    this.csrfToken = csrfToken;
  }

  async read(signal?: AbortSignal): Promise<EvidenceState> {
    return parseState(await request('/api/state', { signal }));
  }

  async save(expectedRevision: string, ontology: Ontology, signal?: AbortSignal): Promise<EvidenceState> {
    return parseState(await request('/api/editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken },
      body: JSON.stringify({ expectedRevision, ontology }),
      signal,
    }));
  }
}

export async function connectEvidenceReview(signal?: AbortSignal): Promise<EvidenceClient | null> {
  if (window.location.hostname !== '127.0.0.1') return null;
  const data = await request('/api/session', { signal });
  if (!record(data) || data.connected !== true || data.protocol !== 'evidence-connection-v1'
    || !boundedString(data.csrfToken, 256)) return null;
  return new EvidenceClient(data.csrfToken);
}
