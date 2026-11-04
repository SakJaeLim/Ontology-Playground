import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ontology } from '../data/ontology';
import { useDesignerStore } from '../store/designerStore';
import { useAppStore } from '../store/appStore';
import type { CatalogueEntry } from '../types/catalogue';
import { createImportedRdfDocument } from '../lib/rdf/document';
import { loadCatalogueEntry } from '../lib/catalogue';
import { OntologyDesigner } from './OntologyDesigner';
import { navigate } from '../lib/router';

vi.hoisted(() => { vi.stubEnv('VITE_EVIDENCE_REVIEW', 'true'); });

vi.mock('../lib/catalogue', () => ({
  loadCatalogueEntry: vi.fn(),
}));

vi.mock('../lib/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('./EvidenceConnectionPanel', () => ({
  EvidenceConnectionPanel: ({ onLoad }: { onLoad: () => void }) => (
    <button onClick={() => {
      onLoad();
      useDesignerStore.getState().loadEvidenceDraft({
        revision: 'evidence-1', notices: [],
        saved: { ...useDesignerStore.getState().ontology, name: 'Evidence draft' },
      });
    }}>Load evidence fixture</button>
  ),
}));

vi.mock('./designer', () => ({
  DesignerToolbar: ({
    catalogueEntry,
    onNewOntology,
  }: {
    catalogueEntry?: CatalogueEntry | null;
    onNewOntology?: () => void;
  }) => (
    <>
      <span>{catalogueEntry?.name ?? 'No catalogue context'}</span>
      <button onClick={onNewOntology}>New draft</button>
    </>
  ),
  DesignerPreview: ({
    onOntologyReplaced,
  }: {
    onOntologyReplaced?: () => void;
  }) => (
    <button onClick={() => {
      useDesignerStore.getState().loadDraft({
        name: 'Replacement',
        description: '',
        entityTypes: [],
        relationships: [],
      });
      onOntologyReplaced?.();
    }}>
      Replace draft
    </button>
  ),
  DesignerValidation: () => null,
  EntityForm: () => null,
  RelationshipForm: () => null,
  TemplatePicker: () => <div>Start from a template</div>,
}));

const ontology: Ontology = {
  name: 'External Equipment',
  description: 'External ontology fixture',
  entityTypes: [{
    id: 'equipment',
    name: 'Equipment',
    description: 'A piece of equipment',
    icon: 'E',
    color: '#0078D4',
    properties: [],
  }],
  relationships: [],
};

const externalEntry: CatalogueEntry = {
  id: 'external/equipment/model',
  name: 'External Equipment',
  description: 'External ontology fixture',
  category: 'general',
  tags: [],
  author: 'Test',
  source: 'external',
  entityCount: 1,
  relationshipCount: 0,
  payloadUrl:
    `catalogue-payloads/external/equipment/model/${'a'.repeat(64)}.json`,
  payloadHash: `sha256:${'a'.repeat(64)}`,
  sourceArtifactUrl:
    `catalogue-sources/external/equipment/model/${'b'.repeat(64)}.rdf`,
  sourceArtifactHash: `sha256:${'b'.repeat(64)}`,
  sourceArtifactByteLength: 42,
  sourceArtifactMediaType: 'application/rdf+xml',
};

describe('OntologyDesigner catalogue provenance', () => {
  beforeEach(async () => {
    useAppStore.getState().resetToDefault();
    useAppStore.getState().loadOntology(ontology, [], externalEntry);
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="https://example.com/equipment">
    <rdfs:label>External Equipment</rdfs:label>
  </owl:Ontology>
  <owl:Class rdf:about="https://example.com/equipment#Equipment">
    <rdfs:label>Equipment</rdfs:label>
  </owl:Class>
</rdf:RDF>`),
      { name: 'equipment.rdf' },
    );
    useDesignerStore.getState().loadDraft(ontology, parsed.document);
  });

  it('clears only Designer provenance when its draft is replaced', async () => {
    const user = userEvent.setup();
    render(<OntologyDesigner route={{ page: 'designer' }} />);

    const note = screen.getByRole('note');
    expect(note.classList.contains('source-fidelity-note')).toBe(true);
    expect(note.querySelector('.lucide-info')).toBeTruthy();
    expect(note.textContent).toContain(
      'The full source for External Equipment remains authoritative',
    );
    expect(note.textContent).toContain(
      'all other RDF statements remain preserved and read-only',
    );
    expect(screen.getByPlaceholderText('Ontology name')).toBeEnabled();
    expect(screen.getByPlaceholderText('Description')).toBeDisabled();
    expect(screen.getByText('External Equipment')).toBeTruthy();

    await user.click(screen.getByText('Replace draft'));

    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByText('No catalogue context')).toBeTruthy();
    expect(useAppStore.getState().currentCatalogueEntry).toBe(
      externalEntry,
    );
  });

  it('does not restore old catalogue provenance when a bound evidence draft remounts', () => {
    useDesignerStore.getState().loadEvidenceDraft({
      revision: 'generation-1', saved: { ...ontology, name: 'NVIDIA draft' }, notices: [],
    });
    const view = render(<OntologyDesigner route={{ page: 'designer' }} />);
    expect(screen.getByText('No catalogue context')).toBeInTheDocument();
    view.unmount();
    render(<OntologyDesigner route={{ page: 'designer' }} />);
    expect(screen.getByText('No catalogue context')).toBeInTheDocument();
    expect(useAppStore.getState().currentCatalogueEntry).toBe(externalEntry);
  });

  it('leaves a catalogue deep link when evidence is loaded and still allows a new catalogue selection', async () => {
    let finishCatalogue!: (value: Awaited<ReturnType<typeof loadCatalogueEntry>>) => void;
    vi.mocked(loadCatalogueEntry).mockReturnValue(new Promise((resolve) => { finishCatalogue = resolve; }));
    const oldEntry = {
      ...externalEntry, ontology, bindings: [],
      sourceArtifactUrl: undefined, sourceArtifactHash: undefined,
      sourceArtifactByteLength: undefined, sourceArtifactMediaType: undefined,
    };
    const view = render(<OntologyDesigner route={{ page: 'designer', ontologyId: externalEntry.id }} />);
    await userEvent.setup().click(screen.getByText('Load evidence fixture'));
    expect(navigate).toHaveBeenCalledWith({ page: 'designer' });
    view.rerender(<OntologyDesigner route={{ page: 'designer' }} />);
    await act(async () => finishCatalogue(oldEntry));
    expect(useDesignerStore.getState().ontology.name).toBe('Evidence draft');
    act(() => useDesignerStore.getState().setOntologyDescription('Unsent evidence edit'));
    view.unmount();
    const returned = render(<OntologyDesigner route={{ page: 'designer' }} />);
    expect(useDesignerStore.getState().ontology.description).toBe('Unsent evidence edit');
    expect(useDesignerStore.getState().evidenceBinding?.revision).toBe('evidence-1');
    expect(screen.getByText('No catalogue context')).toBeInTheDocument();

    vi.mocked(loadCatalogueEntry).mockResolvedValue({
      ...oldEntry, id: 'official/new', ontology: { ...ontology, name: 'New catalogue selection' },
    });
    returned.rerender(<OntologyDesigner route={{ page: 'designer', ontologyId: 'official/new' }} />);
    await waitFor(() => expect(useDesignerStore.getState().ontology.name).toBe('New catalogue selection'));
    expect(useDesignerStore.getState().evidenceBinding).toBeNull();
  });

  it('does not offer templates over an empty source-backed RDF document', async () => {
    const parsed = await createImportedRdfDocument(
      new TextEncoder().encode(`<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:ex="https://example.com/ns#">
  <rdf:Description rdf:about="https://example.com/resource">
    <ex:value>Preserve this statement</ex:value>
  </rdf:Description>
</rdf:RDF>`),
      { name: 'source-only.rdf' },
    );
    useDesignerStore.getState().loadDraft(
      parsed.ontology,
      parsed.document,
    );

    render(<OntologyDesigner route={{ page: 'designer' }} />);

    expect(screen.queryByText('Start from a template')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Complete RDF mode',
    );
    expect(useDesignerStore.getState().rdfDocument).toBe(
      parsed.document,
    );
  });

  it('does not replace a newer draft when a deep-link load finishes late', async () => {
    let resolveEntry: ((entry: CatalogueEntry & {
      ontology: Ontology;
      bindings: [];
    }) => void) | undefined;
    vi.mocked(loadCatalogueEntry).mockReturnValue(new Promise((resolve) => {
      resolveEntry = resolve;
    }));
    const lateOntology: Ontology = {
      name: 'Late Catalogue Ontology',
      description: '',
      entityTypes: [],
      relationships: [],
    };
    const user = userEvent.setup();
    render(<OntologyDesigner route={{
      page: 'designer',
      ontologyId: 'external/late',
    }} />);

    await user.click(screen.getByText('Replace draft'));
    resolveEntry?.({
      ...externalEntry,
      id: 'external/late',
      name: lateOntology.name,
      ontology: lateOntology,
      bindings: [],
      sourceArtifactUrl: undefined,
      sourceArtifactHash: undefined,
      sourceArtifactByteLength: undefined,
      sourceArtifactMediaType: undefined,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(useDesignerStore.getState().ontology.name).toBe('Replacement');
    expect(screen.getByText('No catalogue context')).toBeTruthy();
  });
});
