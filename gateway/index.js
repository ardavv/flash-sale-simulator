'use strict';

const express = require('express');
const RequestCorrelator = require('./tcp/requestCorrelator');
const TcpClient = require('./tcp/tcpClient');
const createOrderRoutes = require('./routes/orderRoutes');

let logger;
try {
  logger = require('./utils/logger').createLogger('GATEWAY_INDEX');
} catch (e) {
  logger = console;
}

// Menangkap unhandled error agar server Express tidak crash
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

async function bootstrap() {
  logger.info('Initializing Order Gateway...');

  // Nilai Konfigurasi (fallback dari env vars)
  const HTTP_PORT = process.env.PORT || 3000;
  const INVENTORY_HOST = process.env.INVENTORY_HOST || '127.0.0.1';
  const INVENTORY_PORT = parseInt(process.env.INVENTORY_TCP_PORT, 10) || 4000;

  // 1. Inisialisasi Correlator dan TCP Client
  const correlator = new RequestCorrelator();
  const tcpClient = new TcpClient(INVENTORY_HOST, INVENTORY_PORT, correlator);

  // 2. Hubungkan TCP Client ke Inventory Server
  tcpClient.connect().catch(err => {
    logger.warn(`Initial TCP connection failed: ${err.message}. Retrying in background...`);
    // Panggil logika auto-reconnect dari TcpClient secara internal jika server Inventory belum hidup
    if (typeof tcpClient._handleDisconnect === 'function') {
      tcpClient._handleDisconnect();
    }
  });

  // 3. Inisialisasi Aplikasi Express
  const app = express();

  // 4. Pasang middleware wajib untuk melakukan parsing body berformat JSON
  app.use(express.json());

  // 5. Mount (pasang) rute yang baru saja dibuat dari orderRoutes.js
  const orderRoutes = createOrderRoutes(tcpClient, correlator);
  app.use('/', orderRoutes);

  // 6. Jalankan peladen HTTP
  app.listen(HTTP_PORT, () => {
    logger.info(`Order Gateway HTTP Server started successfully.`);
    logger.info(`- HTTP Port          : ${HTTP_PORT}`);
    logger.info(`- Target TCP Server  : ${INVENTORY_HOST}:${INVENTORY_PORT}`);
  });
}

// Nyalakan sistem
bootstrap().catch(err => {
  logger.error(`Failed to bootstrap Order Gateway: ${err.message}`);
  process.exit(1);
});
