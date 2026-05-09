// Manual mock for react-native-purchases (jest node environment)

export enum INTRO_ELIGIBILITY_STATUS {
  INTRO_ELIGIBILITY_STATUS_UNKNOWN = 0,
  INTRO_ELIGIBILITY_STATUS_INELIGIBLE = 1,
  INTRO_ELIGIBILITY_STATUS_ELIGIBLE = 2,
  INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS = 3,
}

export enum LOG_LEVEL {
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

const Purchases = {
  INTRO_ELIGIBILITY_STATUS,
  LOG_LEVEL,

  configure: jest.fn(),
  setLogLevel: jest.fn().mockResolvedValue(undefined),
  logIn: jest.fn().mockResolvedValue({ customerInfo: {}, created: false }),
  logOut: jest.fn().mockResolvedValue({ customerInfo: {} }),
  getAppUserID: jest.fn().mockResolvedValue('mock-user-id'),

  getOfferings: jest.fn().mockResolvedValue({
    current: {
      availablePackages: [
        {
          identifier: '$rc_monthly',
          product: { identifier: 'com.studytimelapse.monthly' },
        },
      ],
    },
    all: {},
  }),

  purchasePackage: jest.fn().mockResolvedValue({
    productIdentifier: 'com.studytimelapse.monthly',
    customerInfo: {
      originalAppUserId: 'mock-user-id',
      entitlements: {
        active: {
          pro_access: {
            productIdentifier: 'com.studytimelapse.monthly',
            isActive: true,
          },
        },
      },
    },
    transaction: {
      transactionIdentifier: 'mock-transaction-id',
      productIdentifier: 'com.studytimelapse.monthly',
      purchaseDate: new Date().toISOString(),
      purchaseToken: null,
    },
  }),

  checkTrialOrIntroductoryPriceEligibility: jest.fn().mockResolvedValue({
    'com.studytimelapse.monthly': {
      status: INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
      description: 'Eligible',
    },
  }),
};

export default Purchases;
