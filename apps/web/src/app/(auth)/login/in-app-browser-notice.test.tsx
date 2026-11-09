import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InAppBrowserNotice, isInAppBrowser } from './in-app-browser-notice';

const UA = {
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.0 (iPhone14,5; iOS 17_5; id_ID; id; scale=3.00; 1170x2532; 512345678)',
  tiktokAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 trill_330104 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/33.1.4 ByteLocale/id ByteFullLocale/id Region/ID BytedanceWebview/d8a21c6',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};

function stubUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const mock = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: mock }, configurable: true });
  return mock;
}

describe('isInAppBrowser', () => {
  it.each([UA.instagramIos, UA.tiktokAndroid])('true for in-app UA %#', (ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each([UA.desktopChrome, UA.iosSafari, UA.androidChrome])('false for browser UA %#', (ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });
});

describe('InAppBrowserNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing in a regular browser', () => {
    stubUserAgent(UA.androidChrome);
    const { container } = render(<InAppBrowserNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers to copy the current link inside Instagram', async () => {
    stubUserAgent(UA.instagramIos);
    const writeText = stubClipboard(() => Promise.resolve());
    render(<InAppBrowserNotice />);

    expect(
      screen.getByRole('heading', { name: 'Buka di browser agar login lancar' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Salin tautan' }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(await screen.findByRole('button', { name: 'Tautan disalin' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Tautan disalin');
  });

  it('shows the link for manual copy when the clipboard is unavailable', async () => {
    stubUserAgent(UA.tiktokAndroid);
    stubClipboard(() => Promise.reject(new Error('denied')));
    render(<InAppBrowserNotice />);

    fireEvent.click(screen.getByRole('button', { name: 'Salin tautan' }));

    expect(await screen.findByRole('textbox', { name: 'Tautan halaman ini' })).toHaveValue(
      window.location.href,
    );
  });
});
