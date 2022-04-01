import { IContractProvider, onEventCallBack, Clients, IContractCacheProvider } from '../../../types';
import {WebsocketClient as TendermintWebsocketClient} from "@cosmjs/tendermint-rpc/build/rpcclients/websocketclient";
import { TransactionBroker } from "../../../brokers/src/TransactionBroker";

export type QuestPayload = {
  nonce: string;
  transactionHash: string;
}

export interface IQuestCacheProvider extends IContractCacheProvider<QuestPayload> {

}

export interface QuestClients extends Clients {
  readonly tendermintWsClient?: TendermintWebsocketClient;
  readonly questCacheProvider?: IQuestCacheProvider;
  readonly transactionsBroker?: TransactionBroker;
}

export {
  onEventCallBack,
  IContractProvider,
}


