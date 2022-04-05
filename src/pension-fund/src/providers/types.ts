import Web3 from 'web3';
import {Contract, EventData} from 'web3-eth-contract';
import {WebsocketClient as TendermintWebsocketClient} from "@cosmjs/tendermint-rpc/build/rpcclients/websocketclient";
import { TransactionBroker } from "../../../brokers/src/TransactionBroker";

export type onEventCallBack = {
  (eventData): void;
};

export interface Clients {
  readonly web3: Web3;
  readonly tendermintWsClient?: TendermintWebsocketClient;
  readonly transactionsBroker?: TransactionBroker;
}

export interface IContractProvider {
  readonly clients: Clients;
  readonly contract: Contract;

  startListener();
  subscribeOnEvents(onEventCallBack: onEventCallBack): void;
  getAllEvents(fromBlockNumber: number): Promise<{ collectedEvents: EventData[]; isGotAllEvents: boolean, lastBlockNumber: number }>;
}
