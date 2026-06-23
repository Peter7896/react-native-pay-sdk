const PAYMENT_DETAILS = {
  intentId: 'pi_test_123',
  customerSecret: 'secret_test_123',
  isProduction: true,
  darkTheme: true,
  showBranding: false,
};

const EXPECTED_RESULT_CODES = {
  successful: 0,
  authorizing: 3,
  referred: 4,
  declined: 5,
  duplicateTransaction: 20,
  failed: 30,
  expired: 40,
  waitingPreExecute: 99,
  invalidRequest: 400,
  issueWithAccessToken: 401,
  noAccessTokenSupplied: 404,
  internalServerError: 500,
  sdkInternalError: 7770,
  userClosedWithoutPaying: 7780,
};

type NativeModule = {
  startPaymentFlow: jest.Mock;
  startSetupFlow: jest.Mock;
};

type LoadSdkOptions = {
  nativeModule?: NativeModule;
  isTurboModuleEnabled?: boolean;
};

const ARCHITECTURES = [
  { name: 'Legacy Bridge', isTurboModuleEnabled: false },
  { name: 'TurboModule', isTurboModuleEnabled: true },
] as const;

function loadSdk({
  nativeModule,
  isTurboModuleEnabled = false,
}: LoadSdkOptions = {}) {
  jest.resetModules();
  // @ts-expect-error test-only override
  global.__turboModuleProxy = isTurboModuleEnabled ? {} : null;

  jest.doMock('react-native', () => ({
    NativeModules: nativeModule ? { DojoReactNativePaySdk: nativeModule } : {},
    Platform: {
      select: (options: Record<string, string>) =>
        options.ios ?? options.default ?? '',
    },
    TurboModuleRegistry: {
      getEnforcing: jest.fn(() => nativeModule),
    },
  }));

  return require('../index') as typeof import('../index');
}

describe.each(ARCHITECTURES)('public SDK contract ($name)', (architecture) => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.dontMock('react-native');
    // @ts-expect-error test-only cleanup
    delete global.__turboModuleProxy;
  });

  it('exposes the full ResultCode enum without missing values', () => {
    const { ResultCode } = loadSdk({
      nativeModule: {
        startPaymentFlow: jest.fn(),
        startSetupFlow: jest.fn(),
      },
      isTurboModuleEnabled: architecture.isTurboModuleEnabled,
    });

    const actualEntries = Object.entries(ResultCode).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    );

    expect(Object.fromEntries(actualEntries)).toEqual(EXPECTED_RESULT_CODES);
    expect(actualEntries).toHaveLength(14);
  });

  it('forwards payment details to startPaymentFlow and resolves with the native result code', async () => {
    const nativeModule = {
      startPaymentFlow: jest.fn().mockResolvedValue(3),
      startSetupFlow: jest.fn(),
    };
    const { startPaymentFlow, ResultCode } = loadSdk({
      nativeModule,
      isTurboModuleEnabled: architecture.isTurboModuleEnabled,
    });

    await expect(startPaymentFlow(PAYMENT_DETAILS)).resolves.toBe(
      ResultCode.authorizing
    );
    expect(nativeModule.startPaymentFlow).toHaveBeenCalledWith(PAYMENT_DETAILS);
  });

  it('forwards payment details to startSetupFlow and resolves with the native result code', async () => {
    const nativeModule = {
      startPaymentFlow: jest.fn(),
      startSetupFlow: jest.fn().mockResolvedValue(0),
    };
    const { startSetupFlow, ResultCode } = loadSdk({
      nativeModule,
      isTurboModuleEnabled: architecture.isTurboModuleEnabled,
    });

    await expect(startSetupFlow(PAYMENT_DETAILS)).resolves.toBe(
      ResultCode.successful
    );
    expect(nativeModule.startSetupFlow).toHaveBeenCalledWith(PAYMENT_DETAILS);
  });

  it('throws the linking error when startPaymentFlow is unavailable', () => {
    const { startPaymentFlow } = loadSdk({
      isTurboModuleEnabled: architecture.isTurboModuleEnabled,
    });

    expect(() => startPaymentFlow(PAYMENT_DETAILS)).toThrow(
      "@dojo-engineering/react-native-pay-sdk' doesn't seem to be linked"
    );
    expect(() => startPaymentFlow(PAYMENT_DETAILS)).toThrow(
      "You have run 'pod install'"
    );
  });

  it('throws the linking error when startSetupFlow is unavailable', () => {
    const { startSetupFlow } = loadSdk({
      isTurboModuleEnabled: architecture.isTurboModuleEnabled,
    });

    expect(() => startSetupFlow(PAYMENT_DETAILS)).toThrow(
      "@dojo-engineering/react-native-pay-sdk' doesn't seem to be linked"
    );
    expect(() => startSetupFlow(PAYMENT_DETAILS)).toThrow(
      'You rebuilt the app after installing the package'
    );
  });
});
