import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileCheck2, FolderOpen, Send } from 'lucide-react';
import { useDesignerStore } from '../store/designerStore';
import { connectEvidenceReview, EvidenceConnectionError } from '../lib/evidenceConnection';
import type { EvidenceClient } from '../lib/evidenceConnection';
import { getOntologyDesignerScaleError } from '../lib/ontologyScale';
import '../styles/evidenceConnection.css';

export function EvidenceConnectionPanel({ onLoad }: { onLoad: () => void }) {
  const ontology = useDesignerStore((state) => state.ontology);
  const loaded = useDesignerStore((state) => state.evidenceBinding);
  const [client, setClient] = useState<EvidenceClient | null>(null);
  const [operation, setOperation] = useState<'load' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const dirty = loaded !== null && JSON.stringify(ontology) !== JSON.stringify(loaded.saved);

  useEffect(() => {
    const abort = new AbortController();
    void connectEvidenceReview(abort.signal).then((connection) => {
      if (!abort.signal.aborted) setClient(connection);
    }).catch(() => undefined);
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);

  async function load() {
    if (!client || operation) return;
    const before = useDesignerStore.getState();
    const abort = new AbortController();
    controller.current = abort;
    setOperation('load'); setError(null); setMessage('');
    try {
      const state = await client.read(abort.signal);
      if (abort.signal.aborted) return;
      const current = useDesignerStore.getState();
      if (current.ontology !== before.ontology || current.draftGeneration !== before.draftGeneration) {
        throw new Error('불러오는 동안 편집 내용이 바뀌었습니다. 현재 내용은 유지했습니다.');
      }
      if (!state.ontology) throw new Error('검토 화면에서 데이터 사전을 먼저 가져오세요.');
      const scaleError = getOntologyDesignerScaleError(state.ontology, state.ontology.name);
      if (scaleError) throw new Error(scaleError);
      onLoad();
      useDesignerStore.getState().loadEvidenceDraft({ revision: state.revision, saved: state.ontology, notices: state.notices });
      setMessage('작업 공간을 불러왔습니다. 설명을 수정한 뒤 검토로 보내세요.');
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : '작업 공간을 불러오지 못했습니다.');
    } finally {
      if (!abort.signal.aborted) setOperation(null);
    }
  }

  async function save() {
    if (!client || !loaded || operation) return;
    const submitted = useDesignerStore.getState().ontology;
    const abort = new AbortController();
    controller.current = abort;
    setOperation('save'); setError(null); setMessage('');
    try {
      const state = await client.save(loaded.revision, submitted, abort.signal);
      if (abort.signal.aborted) return;
      if (!state.ontology) throw new Error('저장한 온톨로지를 확인하지 못했습니다.');
      if (!useDesignerStore.getState().acceptEvidenceSave(loaded, { revision: state.revision, saved: state.ontology, notices: state.notices })) {
        throw new Error('전송 중 다른 초안을 열었습니다. 현재 초안과 연결 상태는 유지했습니다.');
      }
      setMessage(useDesignerStore.getState().ontology === submitted
        ? '검토할 내용을 저장했습니다. 승인은 검토 화면에서 별도로 진행합니다.'
        : '보낸 내용은 저장했습니다. 전송 중 추가한 편집 내용은 아직 보내지 않았습니다.');
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof EvidenceConnectionError && cause.status === 409
        ? '작업 공간이 다른 곳에서 바뀌었습니다. 현재 편집 내용은 유지했습니다. 내용을 따로 보관한 뒤 최신 작업 공간을 불러오세요.'
        : cause instanceof Error ? cause.message : '검토할 내용을 저장하지 못했습니다.');
    } finally {
      if (!abort.signal.aborted) setOperation(null);
    }
  }

  if (!client) return null;
  return (
    <section className="evidence-connection" aria-labelledby="evidence-connection-title">
      <div className="evidence-connection-heading">
        <h2 id="evidence-connection-title"><FileCheck2 size={17} aria-hidden="true" /> 근거 검토 연결</h2>
        <a href="/" target="_blank" rel="noopener noreferrer">검토 화면 <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>
      <p>개체와 속성의 설명, 온톨로지 제목과 설명을 수정할 수 있습니다. 개체나 속성의 이름, 자료형, 관계와 구조를 바꾸면 저장할 수 없습니다.</p>
      <div className="evidence-connection-actions">
        <button type="button" disabled={operation !== null} onClick={() => void load()}>
          <FolderOpen size={15} aria-hidden="true" />{operation === 'load' ? '불러오는 중' : '작업 공간 불러오기'}
        </button>
        <button type="button" disabled={!loaded || operation !== null} onClick={() => void save()}>
          <Send size={15} aria-hidden="true" />{operation === 'save' ? '보내는 중' : '검토로 보내기'}
        </button>
        {loaded && <span>{dirty ? '아직 보내지 않은 편집 내용' : '저장된 내용과 같음'}</span>}
      </div>
      <p className="evidence-connection-hint">불러오면 현재 편집 내용이 작업 공간의 내용으로 바뀝니다. 전송은 승인과 별개입니다.</p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert" className="evidence-connection-error">{error}</p>}
      {loaded && loaded.notices.length > 0 && <details>
        <summary>원본에서 보존한 내용과 편집 범위</summary>
        <ul>{loaded.notices.map((notice, index) => <li key={index}>{notice}</li>)}</ul>
      </details>}
    </section>
  );
}
