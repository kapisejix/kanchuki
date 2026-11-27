import { standardInchRows } from '@kanchuki/shared';
import { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  SizeChartEditor,
  sizeChartPayload,
} from '../../src/components/product-detail/SizeChartEditor';
import { render } from '../../src/test/__mocks__/testing-library';

// Phase 4: optional retailer size chart, "fits up to" inches per ticked size.
const mount = (sizes: string[], rows = {}, error: string | null = null, onChange = vi.fn()) => ({
  onChange,
  tree: render(<SizeChartEditor sizes={sizes} rows={rows} onChange={onChange} error={error} />),
});
const text = (t: any) => JSON.stringify(t.toJSON());
const press = (t: any, id: string) => act(() => t.getByTestId(id).props.onPress());

describe('SizeChartEditor', () => {
  it('renders nothing until a size is ticked', () => {
    expect(mount([]).tree.toJSON()).toBeNull();
  });

  it('starts collapsed with the nudge, then shows a row per ticked size', () => {
    const { tree } = mount(['S', 'M']);
    expect(text(tree)).toContain(
      "Shoppers who saved their measurements see 'Your size' on this item.",
    );
    expect(tree.queryByTestId('size-chart-M-bust')).toBeNull();
    press(tree, 'size-chart-toggle');
    for (const s of ['S', 'M'])
      for (const d of ['bust', 'waist', 'hip'])
        expect(tree.queryByTestId(`size-chart-${s}-${d}`)).not.toBeNull();
    expect(tree.queryByTestId('size-chart-L-bust')).toBeNull();
  });

  it('fills the standard chart for the ticked sizes', () => {
    const { tree, onChange } = mount(['S', 'M']);
    press(tree, 'size-chart-toggle');
    press(tree, 'size-chart-standard');
    expect(onChange).toHaveBeenCalledWith(standardInchRows(['S', 'M']));
  });

  it('typing sets a value, clearing removes it', () => {
    const { tree, onChange } = mount(['M'], { M: { bust: 36, hip: 40 } });
    press(tree, 'size-chart-toggle');
    act(() => (tree.getByTestId('size-chart-M-waist') as any).props.onChangeText('30'));
    expect(onChange).toHaveBeenLastCalledWith({ M: { bust: 36, hip: 40, waist: 30 } });
    act(() => (tree.getByTestId('size-chart-M-bust') as any).props.onChangeText(''));
    expect(onChange).toHaveBeenLastCalledWith({ M: { hip: 40 } });
  });

  it('shows the error', () => {
    const { tree } = mount(['M'], {}, 'Each size must be bigger than the one before');
    expect(text(tree)).toContain('Each size must be bigger than the one before');
  });
});

describe('sizeChartPayload', () => {
  it('blocks a chart that does not rise', () => {
    expect(sizeChartPayload({ S: { bust: 36 }, M: { bust: 34 } })).toEqual({
      error: 'Each size must be bigger than the one before',
    });
  });
  it('clears with null when blank', () => {
    expect(sizeChartPayload({})).toEqual({ size_chart: null });
  });
  it('sends cm ranges', () => {
    expect(sizeChartPayload({ S: { bust: 34 } })).toEqual({
      size_chart: { S: { bust: [81, 86] } },
    });
  });
});
