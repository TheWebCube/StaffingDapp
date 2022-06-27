import { config } from 'dotenv';

config({ path: __dirname + '/../../../.env.savingProduct' });

export default {
  logLevel: 'debug',
  network: process.env.WORK_QUEST_BLOCKCHAIN_NETWORK, // workQuestDevNetwork, workQuestTestNetwork, workQuestMainNetwork
  workQuestDevNetwork: {
    linkRpcProvider: process.env.WORK_QUEST_DEV_NETWORK_RPC_PROVIDER,
  },
  workQuestTestNetwork: {
  },
  workQuestMainNetwork: {
  },
  defaultConfigNetwork: (): { linkRpcProvider: string } => {
    // @ts-ignore
    return this.default[this.default.network];
  },
}