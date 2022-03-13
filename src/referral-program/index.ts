import Web3 from 'web3';
import * as fs from 'fs';
import * as path from 'path';
import configDatabase from './config/config.database';
import configReferral from './config/config.referral';
import { ReferralProvider } from "./src/providers/ReferralProvider"
import { ReferralController } from "./src/controllers/ReferralController";
import { ReferralMessageBroker } from "./src/controllers/BrokerController";
import { WebsocketClient as TendermintWebsocketClient } from "@cosmjs/tendermint-rpc";
import { BlockchainNetworks, ReferralProgramParseBlock, initDatabase } from '@workquest/database-models/lib/models';
import {Clients} from "./src/providers/types";

const abiFilePath = path.join(__dirname, '/abi/WQReferral.json');
const abi: any[] = JSON.parse(fs.readFileSync(abiFilePath).toString()).abi;

export async function init() {
  ReferralMessageBroker.initMessageBroker();

  await initDatabase(configDatabase.dbLink, true, true);

  const network = configReferral.network as BlockchainNetworks;

  const {
    linkRpcProvider,
    contractAddress,
    parseEventsFromHeight,
    linkTendermintProvider,
  } = configReferral.defaultConfigNetwork();

  const rpcProvider = new Web3.providers.HttpProvider(linkRpcProvider);
  const tendermintWsProvider = new TendermintWebsocketClient(linkTendermintProvider, error => {
    throw error;
  });

  const web3 = new Web3(rpcProvider);
  const referralContract = new web3.eth.Contract(abi, contractAddress);
  const clients: Clients = { tendermintWsClient: tendermintWsProvider, web3 };

  const referralProvider = new ReferralProvider(clients, referralContract);
  const referralController = new ReferralController(clients, referralProvider, network);

  const [referralBlockInfo, _] = await ReferralProgramParseBlock.findOrCreate({
    where: { network },
    defaults: { network, lastParsedBlock: parseEventsFromHeight },
  });

  await referralController.collectAllUncollectedEvents(referralBlockInfo.lastParsedBlock);

  console.log('Start referral-program program listener');

  referralProvider.startListener();
}

init().catch(console.error);
