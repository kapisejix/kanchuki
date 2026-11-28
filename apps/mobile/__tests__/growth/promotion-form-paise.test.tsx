import React from 'react';
import { TextInput } from 'react-native';
import renderer, { act } from 'react-test-renderer';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// RC-200 — FIXED promo discount_value is paise on the wire (schema.prisma, API
// applyPromotionDiscount, web PromotionBanner, mobile promotions list). The form
// takes rupees, so it must ×100 on save and ÷100 when loading an existing promo.
const m = vi.hoisted(() => ({
  createPromotion: vi.fn(),
  updatePromotion: vi.fn(),
  params: {} as { id?: string },
  existing: undefined as unknown,
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn() }),
  useLocalSearchParams: () => m.params,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: m.existing, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../src/lib/api/growth', () => ({
  growthApi: { createPromotion: m.createPromotion, updatePromotion: m.updatePromotion },
}));
vi.mock('../../src/lib/errors', () => ({ showError: vi.fn() }));
vi.mock('../../src/lib/safe-area', () => ({
  useScreenInsets: () => ({ headerPaddingTop: 0, screenPaddingBottom: 0 }),
}));
vi.mock('../../src/components/KeyboardScreen', () => ({
  KeyboardScreen: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../../src/components/AnimatedPressable', () => ({
  AnimatedPressable: (p: { children: React.ReactNode }) =>
    React.createElement('chip', p, p.children),
}));
vi.mock('../../src/components/GradientButton', () => ({
  GradientButton: (p: { label: string }) => React.createElement('save', p, p.label),
}));

// react-test-renderer ships no types here; minimal shape for what the test touches.
type Node = {
  type: unknown;
  props: Record<string, any>;
  findAll: (pred: (n: Node) => boolean) => Node[];
  findByType: (t: unknown) => Node;
};
type Tree = { root: Node };

async function renderForm() {
  const Screen = (await import('../../app/growth/promotion-form')).default;
  let tree!: Tree;
  await act(async () => {
    tree = renderer.create(React.createElement(Screen)) as unknown as Tree;
  });
  return tree;
}

const input = (t: Tree, placeholder: string) =>
  t.root.findAll((n: Node) => n.type === TextInput && n.props.placeholder === placeholder)[0];

async function save(t: Tree) {
  await act(async () => {
    t.root.findByType('save').props.onPress();
  });
}

describe('promotion-form FIXED discount paise (RC-200)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.params = {};
    m.existing = undefined;
  });

  it('sends ₹500 FIXED as 50000 paise', async () => {
    const t = await renderForm();
    await act(async () => {
      input(t, 'e.g. DIWALI10').props.onChangeText('FLAT500');
      t.root
        .findAll((n: Node) => n.type === 'chip')
        .find((n: Node) => n.findAll((c: Node) => c.props.children === 'Flat ₹').length > 0)
        ?.props.onPress();
    });
    await act(async () => {
      input(t, '500').props.onChangeText('500');
    });
    await save(t);
    expect(m.createPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ discount_type: 'FIXED', discount_value: 50000 }),
    );
  });

  it('sends PERCENT unchanged', async () => {
    const t = await renderForm();
    await act(async () => {
      input(t, 'e.g. DIWALI10').props.onChangeText('TEN');
      input(t, '10').props.onChangeText('10');
    });
    await save(t);
    expect(m.createPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ discount_type: 'PERCENT', discount_value: 10 }),
    );
  });

  it('edit of a 50000-paise FIXED promo shows ₹500 and re-saves 50000', async () => {
    m.params = { id: 'p1' };
    m.existing = {
      id: 'p1',
      code: 'FLAT500',
      discount_type: 'FIXED',
      discount_value: 50000,
      min_order_paise: null,
      is_active: true,
    };
    const t = await renderForm();
    expect(input(t, '500').props.value).toBe('500');
    await save(t);
    expect(m.updatePromotion).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ discount_value: 50000 }),
    );
  });
});
