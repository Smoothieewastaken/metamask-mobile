import React from 'react';
import TransactionReview from './';
import configureMockStore from 'redux-mock-store';
import { shallow } from 'enzyme';
import { Provider } from 'react-redux';
// eslint-disable-next-line import/no-namespace
import * as TransactionUtils from '../../../util/transactions';
// eslint-disable-next-line import/no-namespace
import * as BlockaidUtils from '../../../util/blockaid';
import analyticsV2 from '../../../util/analyticsV2';
import renderWithProvider from '../../../util/test/renderWithProvider';
import initialBackgroundState from '../../../util/test/initial-background-state.json';
import { fireEvent } from '@testing-library/react-native';
import { TESTID_ACCORDION_CONTENT } from '../../../component-library/components/Accordions/Accordion/Accordion.constants';
import { FALSE_POSITIVE_REPOST_LINE_TEST_ID } from '../BlockaidBanner/BlockaidBanner.constants';

jest.mock('../../../util/transactions', () => ({
  ...jest.requireActual('../../../util/transactions'),
  getTransactionReviewActionKey: jest.fn(),
}));

jest.mock('../../../util/ENSUtils', () => ({
  ...jest.requireActual('../../../util/ENSUtils'),
  doENSReverseLookup: jest.fn(),
}));

jest.mock('../../../util/address', () => ({
  ...jest.requireActual('../../../util/address'),
  renderAccountName: jest.fn(),
  isQRHardwareAccount: jest.fn(),
}));

jest.mock('react-native-keyboard-aware-scroll-view', () => {
  const KeyboardAwareScrollView = jest.requireActual('react-native').ScrollView;
  return { KeyboardAwareScrollView };
});

jest.mock('../QRHardware/withQRHardwareAwareness', () => (obj: any) => obj);

jest.mock('@react-navigation/compat', () => {
  const actualNav = jest.requireActual('@react-navigation/compat');
  return {
    actualNav,
    withNavigation: (obj: any) => obj,
  };
});

const mockState = {
  engine: {
    backgroundState: {
      ...initialBackgroundState,
      AccountTrackerController: {
        accounts: {
          '0x0': {
            balance: '0x2',
          },
        },
      },
      PreferencesController: {
        selectedAddress: '0x2',
        identities: {
          '0x0': { name: 'Account 1' },
          '0x1': { name: 'Account 2' },
          '0x2': { name: 'Account 3' },
        },
      },
      NetworkController: {
        providerConfig: {
          chainId: '0xaa36a7',
          type: 'sepolia',
          nickname: 'Sepolia',
        },
      },
    },
  },
  settings: {
    showHexData: true,
    primaryCurrency: 'ETH',
  },
  transaction: {
    transaction: { from: '0x0', to: '0x1' },
    transactionTo: '0x1',
    selectedAsset: { isETH: true, address: '0x0', symbol: 'ETH', decimals: 8 },
    transactionToName: 'Account 2',
    transactionFromName: 'Account 1',
  },
  fiatOrders: {
    networks: [
      {
        chainId: '0xaa36a7',
        type: 'sepolia',
        nickname: 'Sepolia',
      },
    ],
  },
  alert: { isVisible: false },
};

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: (fn: any) => fn(mockState),
}));

const generateTransform = jest.fn();

describe('TransactionReview', () => {
  it('should render correctly', () => {
    const mockStore = configureMockStore();
    const store = mockStore(mockState);
    const wrapper = shallow(
      <Provider store={store}>
        <TransactionReview generateTransform={generateTransform as any} />
      </Provider>,
    );
    expect(wrapper).toMatchSnapshot();
  });

  it('should match snapshot', () => {
    const container = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
      />,
      { state: mockState },
    );
    expect(container).toMatchSnapshot();
  });

  it('should display blockaid banner', async () => {
    const securityAlertResponse = {
      result_type: 'Malicious',
      reason: 'blur_farming',
      providerRequestsCount: {},
    };
    const trackEventSypy = jest
      .spyOn(analyticsV2, 'trackEvent')
      .mockImplementation((name, params) => {
        expect(name).toBeDefined();
        expect(params).toBeDefined();
      });

    const blockaidMetricsParamsSpy = jest
      .spyOn(BlockaidUtils, 'getBlockaidMetricsParams')
      .mockImplementation(({ result_type, reason, providerRequestsCount }) => ({
        security_alert_response: result_type,
        security_alert_reason: reason,
        security_alert_provider_requests_count: providerRequestsCount,
      }));
    const { queryByText, queryByTestId, getByText } = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
      />,
      {
        state: {
          ...mockState,
          transaction: {
            ...mockState.transaction,
            securityAlertResponse,
          },
        },
      },
    );
    expect(await queryByText('See details')).toBeDefined();
    expect(
      await queryByText(
        'If you approve this request, someone can steal your assets listed on Blur.',
      ),
    ).toBeDefined();

    fireEvent.press(await getByText('See details'));

    expect(await queryByTestId(TESTID_ACCORDION_CONTENT)).toBeDefined();
    expect(
      await queryByTestId(FALSE_POSITIVE_REPOST_LINE_TEST_ID),
    ).toBeDefined();
    expect(await queryByText('Something doesn’t look right?')).toBeDefined();
    expect(await queryByText('Contact Us')).toBeDefined();

    fireEvent.press(await getByText('Contact Us'));

    expect(trackEventSypy).toHaveBeenCalledTimes(1);
    expect(blockaidMetricsParamsSpy).toHaveBeenCalledTimes(2);
    expect(blockaidMetricsParamsSpy).toHaveBeenCalledWith(
      securityAlertResponse,
    );
  });

  it('should have enabled confirm button if from account has balance', async () => {
    jest
      .spyOn(TransactionUtils, 'getTransactionReviewActionKey')
      .mockReturnValue(Promise.resolve(undefined));
    const { queryByRole } = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
      />,
      { state: mockState },
    );
    const confirmButton = await queryByRole('button', { name: 'Confirm' });
    expect(confirmButton.props.disabled).not.toBe(true);
  });

  it('should not have confirm button disabled if from account has no balance and also if there is no error', async () => {
    const mockNewState = {
      ...mockState,
      engine: {
        ...mockState.engine,
        backgroundState: {
          ...mockState.engine.backgroundState,
          AccountTrackerController: {
            ...mockState.engine.backgroundState.AccountTrackerController,
            accounts: {
              '0x0': {
                balance: '0x0',
              },
            },
          },
        },
      },
    };
    jest.mock('react-redux', () => ({
      ...jest.requireActual('react-redux'),
      useSelector: (fn: any) => fn(mockNewState),
    }));
    const { getByRole } = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
      />,
      { state: mockState },
    );
    const confirmButton = getByRole('button', { name: 'Confirm' });
    expect(confirmButton.props.disabled).toBe(false);
  });

  it('should have confirm button disabled if error is defined', async () => {
    jest.mock('react-redux', () => ({
      ...jest.requireActual('react-redux'),
      useSelector: (fn: any) => fn(mockState),
    }));
    const { getByRole } = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
        error="You need 1 more ETH to complete the transaction"
      />,
      { state: mockState },
    );
    const confirmButton = getByRole('button', { name: 'Confirm' });
    expect(confirmButton.props.disabled).toBe(true);
  });

  it('should have confirm button disabled if error is defined', async () => {
    jest.mock('react-redux', () => ({
      ...jest.requireActual('react-redux'),
      useSelector: (fn: any) => fn(mockState),
    }));
    const { getByRole } = renderWithProvider(
      <TransactionReview
        EIP1559GasData={{}}
        generateTransform={generateTransform}
        error="You need 1 more ETH to complete the transaction"
      />,
      { state: mockState },
    );
    const confirmButton = getByRole('button', { name: 'Confirm' });
    expect(confirmButton.props.disabled).toBe(true);
  });
});
