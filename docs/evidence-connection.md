# Local evidence review connection

## English

This fork can use the real Designer as the editing surface for the local
[LLM Wiki evidence-review extension](https://github.com/SakJaeLim/llm_wiki/tree/main/extensions/evidence-review).
The Python service imports native NVIDIA Auto Ontology interchange files,
preserves their source, and creates the bound draft. The service owns source
bindings, revision history and review decisions. The browser owns unsaved edits.

Build the editor for the service mount. In PowerShell, from this repository:

```powershell
npm ci --ignore-scripts
$env:VITE_BASE_PATH = '/editor/'
$env:VITE_EVIDENCE_REVIEW = 'true'
npm run build
Remove-Item Env:VITE_BASE_PATH
Remove-Item Env:VITE_EVIDENCE_REVIEW
```

Pass the resulting `build` directory to the evidence-review service's
`--editor-dist` option. Use the service's `127.0.0.1` address, import a dictionary
on its home page, then open `/editor/#/designer`. An ordinary static preview
has no evidence service, so it does not show this panel.

From the installed evidence-review environment:

```sh
python -m evidence_wiki serve PATH_TO_WORKSPACE --editor-dist PATH_TO_PLAYGROUND_BUILD --port 8770
```

1. Select **작업 공간 불러오기** to load the current workspace. This explicitly
   replaces the draft currently open in the Designer.
2. Edit entity or property descriptions, or the ontology title and description.
   Entity/property names, types, order and relationships are outside the first
   connection contract. The service rejects these structural edits.
3. Select **검토로 보내기** to save the draft for review.
4. Follow **검토 화면** to inspect the supplied evidence in a separate tab and make an explicit
   review decision. The editor remains open with unsent edits. Saving a draft never creates an approval.

If another tab changed the workspace, saving returns a conflict. The editor
retains local edits and does not retry with a newer revision automatically.
Keep a copy of the local work before loading the latest workspace. Edits made
while a load or save is pending are also retained.

The bound draft and saved revision survive in-app Back/history navigation.
Opening a different draft, template or RDF document clears that binding. The
draft remains in memory; a full page reload still requires loading the saved
workspace again. The existing Designer size guard also applies before a
workspace replaces the current draft.

Only the local same-origin service is contacted. The client verifies the
`evidence-connection-v1` capability and sends the service-issued CSRF header
with its session cookie. No token is placed in a URL or local storage. Setting
`VITE_API_BASE` does not redirect this connection to another host.

The editor displays a projection. Source fields not represented in that
projection remain with the service and appear in its notices. The panel does
not claim a complete NVIDIA model round trip, live NVIDIA inference, semantic
equivalence of edited definitions, or native LLM Wiki answer enforcement.

## 한국어

이 포크의 편집기는 LLM Wiki 근거 검토 도구와 같은 로컬 주소에서 실행할 수
있습니다. 데이터 사전은 Python 서비스가 가져와 원본과 연결 정보를 보관하고,
Microsoft 편집기에서는 검토할 설명을 수정합니다.

위 PowerShell 명령으로 빌드한 뒤 `build` 폴더를 근거 검토 서비스의
`--editor-dist`에 지정합니다. 서비스 첫 화면에서 NVIDIA 형식의 데이터 사전을
가져오고 편집기를 여세요. 일반 정적 웹사이트에서는 연결 패널이 표시되지 않습니다.

**작업 공간 불러오기**를 누르면 현재 편집 내용이 서버의 작업 공간 내용으로
바뀝니다. 개체와 속성 설명, 온톨로지 제목과 설명을 수정한 뒤 **검토로 보내기**를
누릅니다. 이름, 자료형, 순서, 관계와 구조 변경은 아직 지원하지 않아 저장이
거부됩니다. **검토 화면**은 별도 탭으로 열려 보내지 않은 편집 내용을 유지합니다.
원문을 비교한 뒤 저장한 내용을 따로 승인해야 합니다.

다른 탭이 작업 공간을 바꾼 경우 오래된 버전으로 저장할 수 없습니다. 이때 화면의
편집 내용은 그대로 남습니다. 현재 내용을 별도로 보관한 뒤 최신 작업 공간을
불러오세요. 불러오기나 전송 중 추가한 편집 내용도 자동으로 덮어쓰지 않습니다.

앱 안에서 다른 화면으로 이동했다 돌아와도 초안과 검토 연결 정보가 유지됩니다.
다른 초안이나 템플릿, RDF 문서를 열면 이전 연결은 해제됩니다. 브라우저 전체
새로고침까지 보존되는 방식은 아니므로, 새로고침 전에는 검토로 보내 저장하세요.

원본에서 편집 화면으로 옮기지 못한 항목은 서비스에 보존되며 안내에 표시됩니다.
이 연결은 NVIDIA 서버나 모델을 배포하지 않으며, 설명을 수정했다고 그 의미가
원문과 같다는 판단이나 승인을 자동으로 내리지 않습니다.
