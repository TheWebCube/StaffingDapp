import BigNumber from "bignumber.js";
import {ReferralEvent} from './types';
import {EventData} from 'web3-eth-contract';
import {Web3Provider} from "../providers/types";
import {ReferralMessageBroker} from "./BrokerController";
import {
  Wallet,
  RewardStatus,
  ReferralStatus,
  BlockchainNetworks,
  ReferralProgramParseBlock,
  ReferralProgramReferral,
  ReferralProgramAffiliate,
  ReferralProgramEventPaidReferral,
  ReferralProgramEventRewardClaimed,
  ReferralProgramEventRegisteredAffiliate,
} from '@workquest/database-models/lib/models';

export class ReferralController {
  constructor(
    private readonly web3Provider: Web3Provider,
    private readonly network: BlockchainNetworks,
  ) {
    this.web3Provider.subscribeOnEvents(async (eventData) => {
      await this.onEvent(eventData);
    });
  }

  private async onEvent(eventsData: EventData) {
    if (eventsData.event === ReferralEvent.PaidReferral) {
      await this.paidReferralEventHandler(eventsData);
      ReferralMessageBroker.sendReferralNotification({
        recipients: [eventsData.returnValues.affiliat.toLowerCase()],
        action: eventsData.event,
        data: eventsData
      });
    } else if (eventsData.event === ReferralEvent.RegisteredAffiliate) {
      await this.registeredAffiliateEventHandler(eventsData);
      ReferralMessageBroker.sendReferralNotification({
        recipients: [eventsData.returnValues.referral.toLowerCase()],
        action: eventsData.event,
        data: eventsData
      });
    } else if (eventsData.event === ReferralEvent.RewardClaimed) {
      await this.rewardClaimedEventHandler(eventsData);
      ReferralMessageBroker.sendReferralNotification({
        recipients: [eventsData.returnValues.affiliat.toLowerCase()],
        action: eventsData.event,
        data: eventsData
      });
    }
  }

  protected async registeredAffiliateEventHandler(eventsData: EventData) {
    const referralAddress = eventsData.returnValues.referral.toLowerCase();
    const affiliateAddress = eventsData.returnValues.affiliat.toLowerCase();

    const block = await this.web3Provider.web3.eth.getBlock(eventsData.blockNumber);

    const [_, isCreated] = await ReferralProgramEventRegisteredAffiliate.findOrCreate({
      where: {transactionHash: eventsData.transactionHash},
      defaults: {
        referral: referralAddress,
        affiliate: affiliateAddress,
        timestamp: block.timestamp,
        blockNumber: eventsData.blockNumber,
        transactionHash: eventsData.transactionHash.toLowerCase(),
        network: this.network,
      },
    });

    if (!isCreated) {
      return;
    }

    const [referralWallet, ] = await Promise.all([
      Wallet.findOne({
        where: { address: referralAddress }
      }),
      ReferralProgramParseBlock.update(
        { lastParsedBlock: eventsData.blockNumber },
        { where: { network: this.network } },
      ),
    ]);

    await ReferralProgramReferral.update(
      { referralStatus: ReferralStatus.Registered },
      { where: { referralUserId: referralWallet.userId } },
    );
  }

  protected async paidReferralEventHandler(eventsData: EventData) {
    const referralAddress = eventsData.returnValues.referral.toLowerCase();
    const affiliateAddress = eventsData.returnValues.affiliat.toLowerCase();

    const block = await this.web3Provider.web3.eth.getBlock(eventsData.blockNumber);

    const [_, isCreated] = await ReferralProgramEventPaidReferral.findOrCreate({
      where: {transactionHash: eventsData.transactionHash},
      defaults: {
        referral: referralAddress,
        affiliate: affiliateAddress,
        timestamp: block.timestamp,
        blockNumber: eventsData.blockNumber,
        amount: eventsData.returnValues.amount,
        transactionHash: eventsData.transactionHash.toLowerCase(),
        network: this.network,
      },
    });

    if (!isCreated) {
      return;
    }

    const [referralWallet, ] = await Promise.all([
      Wallet.findOne({
        where: { address: referralAddress }
      }),
      ReferralProgramParseBlock.update(
        { lastParsedBlock: eventsData.blockNumber },
        { where: { network: this.network } },
      ),
    ]);

    await ReferralProgramReferral.update(
      { referralStatus: RewardStatus.Paid },
      { where: { referralUserId: referralWallet.userId } },
    );
  }

  protected async rewardClaimedEventHandler(eventsData: EventData) {
    const affiliateAddress = eventsData.returnValues.affiliat.toLowerCase();

    const block = await this.web3Provider.web3.eth.getBlock(eventsData.blockNumber);

    const [_, isCreated] = await ReferralProgramEventRewardClaimed.findOrCreate({
      where: {transactionHash: eventsData.transactionHash},
      defaults: {
        timestamp: block.timestamp,
        affiliate: affiliateAddress,
        blockNumber: eventsData.blockNumber,
        amount: eventsData.returnValues.amount,
        transactionHash: eventsData.transactionHash.toLowerCase(),
        network: this.network,
      },
    });

    if (!isCreated) {
      return;
    }

    const [affiliateWallet, ] = await Promise.all([
      Wallet.findOne({
        where: { address: affiliateAddress }
      }),
      ReferralProgramParseBlock.update(
        { lastParsedBlock: eventsData.blockNumber },
        { where: { network: this.network } },
      ),
    ]);

    await ReferralProgramAffiliate.update(
      { status: RewardStatus.Claimed },
      { where: { affiliateUserId: affiliateWallet.userId } }
    );
  }

  public async collectAllUncollectedEvents(fromBlockNumber: number) {
    const {collectedEvents, isGotAllEvents, lastBlockNumber} = await this.web3Provider.getAllEvents(fromBlockNumber);

    for (const event of collectedEvents) {
      try {
        await this.onEvent(event);
      } catch (e) {
        console.error('Failed to process all events. Last processed block: ' + event.blockNumber);
        throw e;
      }
    }

    await ReferralProgramParseBlock.update(
      {lastParsedBlock: lastBlockNumber},
      {
        where: {network: this.network},
      },
    );

    if (!isGotAllEvents) {
      throw new Error('Failed to process all events. Last processed block: ' + collectedEvents[collectedEvents.length - 1]);
    }
  }
}
