import fs from "fs";
import Web3 from "web3";
import path from "path";
import { Logger } from "./logger/pino";
import configDatabase from ".//config/config.common";
import configSwapUsdt from "./config/config.SwapUsdt";
import { SwapUsdtProvider } from "./src/providers/SwapUsdtProvider";
import { TransactionBroker } from "../brokers/src/TransactionBroker";
import { NotificationBroker } from "../brokers/src/NotificationBroker";
import { SwapUsdtController } from "./src/controllers/SwapUsdtController";
import { OraclePricesProvider } from "./src/providers/OraclePricesProvider";
import { SwapUsdtWorkNetProvider } from "./src/providers/SwapUsdtWorkNetProvider";
import { SwapUsdtEthClients, SwapUsdtWorkNetClients } from "./src/providers/types";
import {
  initDatabase,
  BlockchainNetworks,
  SwapUsdtParserBlockInfo,
} from "@workquest/database-models/lib/models";

const abiFilePath = path.join(__dirname, '../../src/swapUsdt/abi/SwapUsdt.json');
const abi: any[] = JSON.parse(fs.readFileSync(abiFilePath).toString()).abi;

export async function init() {
  await initDatabase(configDatabase.database.link, false, true);

  const networks = [
    configSwapUsdt.bscNetwork,
    configSwapUsdt.ethereumNetwork,
    configSwapUsdt.workQuestNetwork,
    configSwapUsdt.polygonscanNetwork
  ];

  Logger.debug('Binance smart chain network "%s"', configSwapUsdt.bscNetwork);
  Logger.debug('Ethereum network "%s"', configSwapUsdt.ethereumNetwork);
  Logger.debug('WorkQuest network "%s"', configSwapUsdt.workQuestNetwork);
  Logger.debug('Polygon network "%s"', configSwapUsdt.polygonscanNetwork);

  const wqDefaultConfig = configSwapUsdt.defaultWqConfigNetwork();
  const bscDefaultConfig = configSwapUsdt.defaultBscConfigNetwork();
  const ethDefaultConfig = configSwapUsdt.defaultEthConfigNetwork();
  const polygonDefaultConfig = configSwapUsdt.defaultPolygonConfigNetwork();

  Logger.debug('WorkQuest network: link Rpc provider "%s"', wqDefaultConfig.linkRpcProvider);

  const wqRpcProvider = new Web3.providers.HttpProvider(wqDefaultConfig.linkRpcProvider);

  const bscWsProvider = new Web3.providers.WebsocketProvider(bscDefaultConfig.linkWsProvider, {
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 60000, // ms
    },
    reconnect: {
      auto: true,
      delay: 1000, // ms
      onTimeout: false,
    },
  });

  const ethWsProvider = new Web3.providers.WebsocketProvider(ethDefaultConfig.linkWsProvider, {
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 60000, // ms
    },
    reconnect: {
      auto: true,
      delay: 1000, // ms
      onTimeout: false,
    },
  });

  const polygonWsProvider = new Web3.providers.WebsocketProvider(polygonDefaultConfig.linkWsProvider, {
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 60000, // ms
    },
    reconnect: {
      auto: true,
      delay: 1000, // ms
      onTimeout: false,
    },
  })

  const web3Wq = new Web3(wqRpcProvider);
  const web3Bsc = new Web3(bscWsProvider);
  const web3Eth = new Web3(ethWsProvider);
  const web3Polygon = new Web3(polygonWsProvider);

  const transactionsBroker = new TransactionBroker(configDatabase.mqLink, 'SwapUsdt');
  await transactionsBroker.init();

  const notificationsBroker = new NotificationBroker(configDatabase.notificationMessageBroker.link, 'SwapUsdt');
  // await notificationsBroker.init();

  const SwapUsdtWqContract = new web3Wq.eth.Contract(abi, wqDefaultConfig.contractAddress);
  const SwapUsdtBscContract = new web3Bsc.eth.Contract(abi, bscDefaultConfig.contractAddress);
  const SwapUsdtEthContract = new web3Eth.eth.Contract(abi, ethDefaultConfig.contractAddress);
  const SwapUsdtPolygonContract = new web3Polygon.eth.Contract(abi, polygonDefaultConfig.contractAddress);

  Logger.debug('WorkQuest network contract address: "%s"', wqDefaultConfig.contractAddress);
  Logger.debug('Binance smart chain contract address: "%s"', bscDefaultConfig.contractAddress);
  Logger.debug('Ethereum network contract address: "%s"', ethDefaultConfig.contractAddress);
  Logger.debug('Polygon network contract address: "%s"', polygonDefaultConfig.contractAddress);

  const wqClients: SwapUsdtWorkNetClients = { web3: web3Wq, transactionsBroker, notificationsBroker };
  const bscClients: SwapUsdtEthClients = { web3: web3Bsc, webSocketProvider: bscWsProvider, notificationsBroker };
  const ethClients: SwapUsdtEthClients = { web3: web3Eth, webSocketProvider: ethWsProvider, notificationsBroker };
  const polygonClients: SwapUsdtEthClients = { web3: web3Polygon, webSocketProvider: polygonWsProvider, notificationsBroker };

  const wqSwapUsdtProvider = new SwapUsdtWorkNetProvider(wqClients, SwapUsdtWqContract);
  const bscSwapUsdtProvider = new SwapUsdtProvider(bscClients, SwapUsdtBscContract);
  const ethSwapUsdtProvider = new SwapUsdtProvider(ethClients, SwapUsdtEthContract);
  const polygonSwapUsdtProvider = new SwapUsdtProvider(polygonClients, SwapUsdtPolygonContract);

  const wqBridgeController = new SwapUsdtController(
    wqClients,
    configSwapUsdt.workQuestNetwork as BlockchainNetworks,
    wqSwapUsdtProvider,
    new OraclePricesProvider(configSwapUsdt.oracleLink),
  );
  const bscBridgeController = new SwapUsdtController(
    bscClients,
    configSwapUsdt.bscNetwork as BlockchainNetworks,
    bscSwapUsdtProvider,
    new OraclePricesProvider(configSwapUsdt.oracleLink),
  );
  const ethBridgeController = new SwapUsdtController(
    ethClients,
    configSwapUsdt.ethereumNetwork as BlockchainNetworks,
    ethSwapUsdtProvider,
    new OraclePricesProvider(configSwapUsdt.oracleLink),
  );
  const polygonBridgeController = new SwapUsdtController(
    polygonClients,
    configSwapUsdt.polygonscanNetwork as BlockchainNetworks,
    polygonSwapUsdtProvider,
    new OraclePricesProvider(configSwapUsdt.oracleLink),
  );

  const blockInfos = new Map<string, number>();

  for (const network of networks) {
    const [swapUsdtBlockInfo] = await SwapUsdtParserBlockInfo.findOrCreate({
      where: { network },
      defaults: { network, lastParsedBlock: configSwapUsdt[network].parseEventsFromHeight }
    });

    if (swapUsdtBlockInfo.lastParsedBlock < configSwapUsdt[network].parseEventsFromHeight) {
      await swapUsdtBlockInfo.update({
        lastParsedBlock: configSwapUsdt[network].parseEventsFromHeight,
      });
    }

    blockInfos.set(network, swapUsdtBlockInfo.lastParsedBlock);
  }

  await Promise.all([
    wqBridgeController.collectAllUncollectedEvents(blockInfos.get(configSwapUsdt.workQuestNetwork)),
    bscBridgeController.collectAllUncollectedEvents(blockInfos.get(configSwapUsdt.bscNetwork)),
    ethBridgeController.collectAllUncollectedEvents(blockInfos.get(configSwapUsdt.ethereumNetwork)),
    polygonBridgeController.collectAllUncollectedEvents(blockInfos.get(configSwapUsdt.polygonscanNetwork)),
  ]);

  await wqSwapUsdtProvider.startListener();
  bscSwapUsdtProvider.startListener();
  ethSwapUsdtProvider.startListener();
  polygonSwapUsdtProvider.startListener();
}

init().catch(e => {
  Logger.error(e, 'Worker "SwapUsdt" is stopped with error');
  process.exit(-1);
});
