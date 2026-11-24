import { Alert } from 'react-native';
import { act } from 'react-test-renderer';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../src/test/__mocks__/testing-library';

// F-025 single scan (app/product/scan.tsx): SKU -> productApi.list -> open the
// product. F-047 T5 moved the camera/manual block into SkuScanner; this pins
// that the screen behaves the same.
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__DEV__ = true;
});

const m = vi.hoisted(() => ({
  list: vi.fn(),
  showError: vi.fn(),
  cameraProps: {} as Record<string, any>,
}));

vi.mock('expo-camera', () => ({
  CameraView: (props: Record<string, any>) => {
    m.cameraProps = props;
    return null;
  },
  useCameraPermissions: () => [{ granted: true }, vi.fn()],
}));
vi.mock('../../src/lib/api', () => ({ productApi: { list: m.list } }));
vi.mock('../../src/lib/errors', () => ({ showError: m.showError }));

import { router } from 'expo-router';
import ScanScreen from '../../app/product/scan';

const scan = (data: string) => m.cameraProps.onBarcodeScanned({ data });

describe('ScanScreen (F-025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.cameraProps = {};
    vi.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('opens the product for a known SKU', async () => {
    m.list.mockResolvedValue({ data: [{ id: 'p1' }] });
    render(<ScanScreen />);
    await act(async () => scan('LS0042'));
    expect(m.list).toHaveBeenCalledWith({ sku: 'LS0042', limit: 1 });
    expect(router.replace).toHaveBeenCalledWith('/product/p1');
  });

  it('alerts Not Found, pauses the camera, and resumes on Scan again', async () => {
    m.list.mockResolvedValue({ data: [] });
    render(<ScanScreen />);
    await act(async () => scan('ls0099'));
    expect(router.replace).not.toHaveBeenCalled();
    const [title, body, buttons] = (Alert.alert as any).mock.calls[0];
    expect(title).toBe('Not Found');
    expect(body).toContain('LS0099');
    expect(m.cameraProps.active).toBe(false);
    await act(async () => buttons[0].onPress());
    expect(m.cameraProps.active).toBe(true);
  });

  it('shows the error and resumes scanning when the lookup fails', async () => {
    m.list.mockRejectedValue(new Error('net'));
    render(<ScanScreen />);
    await act(async () => scan('LS0042'));
    expect(m.showError).toHaveBeenCalled();
    expect(m.cameraProps.active).toBe(true);
  });
});
