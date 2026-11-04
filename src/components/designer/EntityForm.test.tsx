import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EntityForm } from './EntityForm';
import { useDesignerStore } from '../../store/designerStore';

beforeEach(() => {
  useDesignerStore.getState().loadDraft({
    name: 'Dictionary', description: '', relationships: [],
    entityTypes: [{ id: 'dataset', name: 'Dataset', description: 'A dataset', icon: 'D', color: '#0078D4',
      properties: [{ name: 'title', type: 'string', description: 'Original title definition' }] }],
  });
});
afterEach(cleanup);

describe('EntityForm property descriptions', () => {
  it('loads and edits a bound description without changing its name or type', () => {
    render(<EntityForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    const input = screen.getByRole('textbox', { name: 'title description' });
    expect(input).toHaveValue('Original title definition');
    fireEvent.change(input, { target: { value: '사람이 읽을 수 있는 데이터셋 제목' } });
    expect(useDesignerStore.getState().ontology.entityTypes[0].properties[0]).toEqual({
      name: 'title', type: 'string', description: '사람이 읽을 수 있는 데이터셋 제목',
    });
  });
});
