import Web3 from "web3";
import {run} from 'graphile-worker';
import {Logger} from "./logger/pino";
import {SupervisorContract} from "../supervisor";
import configDatabase from ".//config/config.common";
import configSwapUsdt from "./config/config.swapUsdt";
import {SwapUsdtEthClients} from "./src/providers/types";
import {SwapUsdtProvider} from "./src/providers/SwapUsdtProvider";
import {NotificationBroker} from "../brokers/src/NotificationBroker";
import {SwapUsdtController} from "./src/controllers/SwapUsdtController";
import {OraclePricesProvider} from "./src/providers/OraclePricesProvider";
import {
  initDatabase,
  BlockchainNetworks,
} from "@workquest/database-models/lib/models";
import {
  Store,
  Networks,
  BnbNetworkContracts,
  EthNetworkContracts,
  PolygonScanContracts,
} from "@workquest/contract-data-pools";

export async function init() {
  const contractEthData = Store[Networks.Eth][EthNetworkContracts.BridgeUSDT];
  const contractBnbData = Store[Networks.Bnb][BnbNetworkContracts.BridgeUSDT];
  const contractPolygonScanData = Store[Networks.PolygonScan][PolygonScanContracts.BridgeUSDT];

  await initDatabase(configDatabase.database.link, false, false);

  await run({
    connectionString: configDatabase.database.link,
    concurrency: 1,
    pollInterval: 60000,
    schema: 'worker_token_swap_txs',
    taskDirectory: `${__dirname}/jobs`, // Папка с исполняемыми тасками.
  });

  Logger.debug('Ethereum network "%s"', configSwapUsdt.ethereumNetwork);
  Logger.debug('Polygon network "%s"', configSwapUsdt.polygonscanNetwork);
  Logger.debug('Binance smart chain network "%s"', configSwapUsdt.bscNetwork);

  const wqDefaultConfig = configSwapUsdt.defaultWqConfigNetwork();
  const bscDefaultConfig = configSwapUsdt.defaultBscConfigNetwork();
  const ethDefaultConfig = configSwapUsdt.defaultEthConfigNetwork();
  const polygonDefaultConfig = configSwapUsdt.defaultPolygonConfigNetwork();

  Logger.debug('WorkQuest network: link Rpc provider "%s"', wqDefaultConfig.linkRpcProvider);

  const bscWsProvider = new Web3.providers.WebsocketProvider(bscDefaultConfig.linkWsProvider, {
    clientConfig: {
      keepalive: true,
      keepaliveInterval: 60000, // ms
    },
    reconnect: {
      auto: true,
      delay: 1000, // ms
      maxAttempts: 1,
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
      maxAttempts: 1,
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
      maxAttempts: 1,
      onTimeout: false,
    },
  });

  const web3Bsc = new Web3(bscWsProvider);
  const web3Eth = new Web3(ethWsProvider);
  const web3Polygon = new Web3(polygonWsProvider);

  const notificationsBroker = new NotificationBroker(configDatabase.notificationMessageBroker.link, 'SwapUsdt');

  const SwapUsdtBscContract = new web3Bsc.eth.Contract(contractBnbData.getAbi(), contractBnbData.address);
  const SwapUsdtEthContract = new web3Eth.eth.Contract(contractEthData.getAbi(), contractEthData.address);
  const SwapUsdtPolygonContract = new web3Polygon.eth.Contract(contractPolygonScanData.getAbi(), contractPolygonScanData.address);

  Logger.debug('Binance smart chain contract address: "%s"', contractBnbData.address);
  Logger.debug('Ethereum network contract address: "%s"', contractEthData.address);
  Logger.debug('Polygon network contract address: "%s"', contractPolygonScanData.address);

  const bscClients: SwapUsdtEthClients = { web3: web3Bsc, webSocketProvider: bscWsProvider, notificationsBroker };
  const ethClients: SwapUsdtEthClients = { web3: web3Eth, webSocketProvider: ethWsProvider, notificationsBroker };
  const polygonClients: SwapUsdtEthClients = { web3: web3Polygon, webSocketProvider: polygonWsProvider, notificationsBroker };

  const oracleProvider = new OraclePricesProvider(configSwapUsdt.oracleLink);

  const bscSwapUsdtProvider = new SwapUsdtProvider(
    contractBnbData.address,
    contractBnbData.deploymentHeight,
    SwapUsdtBscContract,
    bscClients,
  );
  const ethSwapUsdtProvider = new SwapUsdtProvider(
    contractEthData.address,
    contractEthData.deploymentHeight,
    SwapUsdtEthContract,
    ethClients,
  );
  const polygonSwapUsdtProvider = new SwapUsdtProvider(
    contractPolygonScanData.address,
    contractPolygonScanData.deploymentHeight,
    SwapUsdtPolygonContract,
    polygonClients,
  );

  const bscBridgeController = new SwapUsdtController(
    bscClients,
    configSwapUsdt.bscNetwork as BlockchainNetworks,
    bscSwapUsdtProvider,
    oracleProvider,
  );
  const ethBridgeController = new SwapUsdtController(
    ethClients,
    configSwapUsdt.ethereumNetwork as BlockchainNetworks,
    ethSwapUsdtProvider,
    oracleProvider,
  );
  const polygonBridgeController = new SwapUsdtController(
    polygonClients,
    configSwapUsdt.polygonscanNetwork as BlockchainNetworks,
    polygonSwapUsdtProvider,
    oracleProvider,
  );

  await new SupervisorContract(
    Logger,
    bscBridgeController,
    bscSwapUsdtProvider,
  )
  .startTasks()

  await new SupervisorContract(
    Logger,
    ethBridgeController,
    ethSwapUsdtProvider,
  )
  .startTasks()

  await new SupervisorContract(
    Logger,
    polygonBridgeController,
    polygonSwapUsdtProvider,
  )
  .startTasks()
}

init().catch(e => {
  Logger.error(e, 'Worker "SwapUsdt" is stopped with error');
  process.exit(-1);
});
