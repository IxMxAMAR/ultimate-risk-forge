import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShortcuts } from './useShortcuts';

function Harness({ onJ, onSearch }: { onJ: () => void; onSearch: () => void }) {
  useShortcuts({ j: onJ, 'ctrl+k': onSearch });
  return <><input aria-label="field" /><textarea aria-label="area" /><select aria-label="pick"><option>a</option></select><div contentEditable suppressContentEditableWarning data-testid="edit" /></>;
}

describe('useShortcuts', () => {
  it('runs the matching handler and ignores unknown keys and modified letters', () => {
    const onJ = vi.fn();
    const onSearch = vi.fn();
    render(<Harness onJ={onJ} onSearch={onSearch} />);
    fireEvent.keyDown(document.body, { key: 'J' });
    fireEvent.keyDown(document.body, { key: 'x' });
    fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true });
    expect(onJ).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('ignores keys typed into inputs, textareas, selects and editable elements, but not Ctrl+K', () => {
    const onJ = vi.fn();
    const onSearch = vi.fn();
    const { getByLabelText, getByTestId } = render(<Harness onJ={onJ} onSearch={onSearch} />);
    for (const el of [getByLabelText('field'), getByLabelText('area'), getByLabelText('pick'), getByTestId('edit')]) {
      el.focus();
      fireEvent.keyDown(el, { key: 'j' });
      fireEvent.keyDown(el, { key: 'k', ctrlKey: true });
    }
    expect(onJ).not.toHaveBeenCalled();
    expect(onSearch).toHaveBeenCalledTimes(4);
  });
});
