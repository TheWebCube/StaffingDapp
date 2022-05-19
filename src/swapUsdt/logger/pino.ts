import pino from 'pino';
import configBridge from "../config/config.swapUsdt";

export const Logger = pino({
  level: configBridge.logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      ignore: 'workerName,hostName',
      messageFormat: '{workerName}: {msg}',
      translateTime: "dd-mm-yyyy HH:MM:ss",
    },
  },
}).child({ workerName: 'SwapUsdt' });
