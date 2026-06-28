'use strict';

const config = require('./config');
const { createLogger } = require('./utils/logger');
const MasterDB = require('./db/masterDB');
const SlaveDB = require('./db/slaveDB');
const ReplicationManager = require('./core/replicationManager');
const Mutex = require('./core/mutex').Mutex;
const InventoryService = require('./core/inventoryService');
const TcpServer = require('./server/tcpServer');

const logger = createLogger('INVENTORY_INDEX');

// Requirement 9.2: Register process.on('uncaughtException', ...) untuk logging tanpa crash
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

async function bootstrap() {
  logger.info('Initializing Inventory Coordinator...');

  // Initialize Data Layer
  const masterDB = new MasterDB(config.initialStock);
  const slaveDB = new SlaveDB();
  
  // Replication Layer
  const replicationManager = new ReplicationManager(masterDB, slaveDB, { replicationDelayMs: 0 });
  replicationManager.start();

  // Business Logic Layer
  const mutex = new Mutex(config.mutexTimeoutMs);
  const inventoryService = new InventoryService(masterDB, slaveDB, mutex);

  // Network Layer
  const tcpServer = new TcpServer(config.tcpPort);

  // Requirement: Handle pesan TCP tipe order, status, reset, dan init dengan memanggil metode yang sesuai di InventoryService
  tcpServer.on('message', async (parsedJson, reply) => {
    const { type, requestId, productId, quantity } = parsedJson;
    
    if (!type) {
      reply({ requestId: requestId || null, status: 'error', reason: 'missing_type' });
      return;
    }

    try {
      switch (type) {
        case 'order':
          // { requestId, productId, quantity, type: "order" }
          if (!productId || typeof quantity !== 'number') {
            reply({ requestId, status: 'error', reason: 'invalid_payload' });
            return;
          }
          const orderResult = await inventoryService.processOrder(productId, quantity, requestId);
          reply(orderResult);
          break;

        case 'status':
          // { requestId, type: "status" }
          const statusResult = inventoryService.getStatus(productId || config.productId);
          reply({ requestId, status: 'success', ...statusResult });
          break;

        case 'reset':
        case 'init':
          // { requestId, productId, type: "reset" | "init" }
          await inventoryService.reset(productId || config.productId);
          reply({ requestId, status: 'success' });
          break;

        default:
          reply({ requestId, status: 'error', reason: 'unknown_type' });
      }
    } catch (err) {
      logger.error(`Error processing message type ${type}`, { error: err.message, requestId });
      reply({ requestId, status: 'error', reason: 'internal_error' });
    }
  });

  // Start the TCP server
  await tcpServer.start();
  logger.info(`Inventory Coordinator started successfully.`);
  logger.info(`- TCP Port      : ${config.tcpPort}`);
  logger.info(`- Initial Stock : ${config.initialStock}`);
  logger.info(`- Product ID    : ${config.productId}`);
}

// Jalankan sistem
bootstrap().catch(err => {
  logger.error(`Failed to bootstrap Inventory Coordinator: ${err.message}`);
  process.exit(1);
});
