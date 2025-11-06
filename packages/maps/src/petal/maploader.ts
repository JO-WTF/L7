/* eslint-disable */
if (typeof window === 'undefined') {
  throw Error('Petal Maps JS SDK can only be used in Browser.');
}

enum LoadStatus {
  NotLoaded = 'notload',
  Loading = 'loading',
  Loaded = 'loaded',
  Failed = 'failed',
}

const DEFAULT_SCRIPT_URL = 'https://mapapi.cloud.huawei.com/mapjs/v1/mapkit.js';
const MAX_READY_CHECK_ATTEMPTS = 40;
const READY_CHECK_INTERVAL = 50;

type LoaderCallback = {
  resolve: (sdk: any) => void;
  reject: (reason?: any) => void;
};

let status = LoadStatus.NotLoaded;
const callbacks: LoaderCallback[] = [];

const getSDK = () => {
  const sdk = (window as any).HWMapJsSDK;
  if (sdk && typeof sdk.HWMap === 'function') {
    return sdk;
  }
  return null;
};

const flushSuccess = (sdk: any) => {
  while (callbacks.length) {
    callbacks.shift()?.resolve(sdk);
  }
};

const flushFailure = (error: Error) => {
  while (callbacks.length) {
    callbacks.shift()?.reject(error);
  }
};

export interface IPetalLoaderOptions {
  /**
   * Custom Petal Maps SDK url.
   * Defaults to https://mapapi.cloud.huawei.com/mapjs/v1/mapkit.js
   */
  url?: string;
}

const waitForSDKReady = (attempt = 0) => {
  const sdk = getSDK();
  if (sdk) {
    status = LoadStatus.Loaded;
    flushSuccess(sdk);
    return;
  }
  if (attempt >= MAX_READY_CHECK_ATTEMPTS) {
    status = LoadStatus.Failed;
    flushFailure(
      new Error(
        'Petal Maps SDK script loaded but HWMap constructor is missing. Please ensure the SDK URL is correct and the API has not changed.',
      ),
    );
    return;
  }
  window.setTimeout(() => waitForSDKReady(attempt + 1), READY_CHECK_INTERVAL);
};

const load = (options: IPetalLoaderOptions = {}) => {
  const { url = DEFAULT_SCRIPT_URL } = options;

  return new Promise((resolve, reject) => {
    const sdk = getSDK();
    if (sdk) {
      status = LoadStatus.Loaded;
      resolve(sdk);
      return;
    }

    if (status === LoadStatus.Failed) {
      reject(new Error('Petal Maps SDK failed to load previously.'));
      return;
    }

    callbacks.push({ resolve, reject });

    if (status === LoadStatus.Loading) {
      return;
    }

    status = LoadStatus.Loading;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      waitForSDKReady();
    };

    script.onerror = (e) => {
      status = LoadStatus.Failed;
      flushFailure(
        e instanceof Error
          ? e
          : new Error('Failed to load Petal Maps SDK script. Please check network connectivity.'),
      );
    };

    const parent = document.body || document.head;
    parent.appendChild(script);
  });
};

const reset = () => {
  const scripts = Array.from(document.getElementsByTagName('script'));
  scripts
    .filter((script) => script.src.includes('mapapi.cloud.huawei.com/mapjs'))
    .forEach((script) => script.parentNode?.removeChild(script));

  // @ts-ignore
  delete window.HWMapJsSDK;
  status = LoadStatus.NotLoaded;
  callbacks.splice(0, callbacks.length);
};

export default {
  load,
  reset,
};
