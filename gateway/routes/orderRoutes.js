'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const validatePayload = require('../middleware/validatePayload');

/**
 * Membuat router Express untuk menangani HTTP endpoint pemesanan dan status.
 *
 * @param {import('../tcp/tcpClient')} tcpClient - Klien TCP ke Inventory Server
 * @param {import('../tcp/requestCorrelator')} correlator - Pengendali korelasi request-response
 * @returns {import('express').Router}
 */
function createOrderRoutes(tcpClient, correlator) {
  const router = express.Router();
  
  let logger;
  try {
    logger = require('../utils/logger').createLogger('ROUTES');
  } catch (e) {
    logger = console;
  }

  // ==========================================
  // POST /order
  // Endpoint untuk memproses pemesanan
  // ==========================================
  router.post('/order', validatePayload, async (req, res) => {
    const requestId = uuidv4();
    const { productId, quantity } = req.body;

    try {
      // 1. Daftarkan requestId ke dalam correlator dengan batas tunggu (timeout) 10000ms
      const responsePromise = correlator.register(requestId, 10000);

      // 2. Kirim pesan berformat JSON ke jaringan TCP
      await tcpClient.send({
        type: 'order',
        requestId,
        productId,
        quantity
      });

      // 3. Menunggu promise di-resolve() ketika paket balasan datang dari peladen Inventory
      const tcpResponse = await responsePromise;

      // 4. Balas ke klien web dengan HTTP 200
      return res.status(200).json(tcpResponse);
    } catch (error) {
      logger.error(`Order request failed [${requestId}]: ${error.message}`);
      
      // Jika promise me-reject (dikarenakan timeout atau koneksi tcpClient yang tiba-tiba putus),
      // balas ke klien web dengan status HTTP 503 Service Unavailable
      return res.status(503).json({
        error: "Inventory Server is currently unavailable or timed out",
        details: error.message
      });
    }
  });

  // ==========================================
  // GET /status
  // Endpoint untuk melihat snapshot stok
  // ==========================================
  router.get('/status', async (req, res) => {
    const requestId = uuidv4();
    
    try {
      // Set batas tunggu sedikit lebih singkat untuk cek status (5000ms)
      const responsePromise = correlator.register(requestId, 5000);

      await tcpClient.send({
        type: 'status',
        requestId
      });

      const tcpResponse = await responsePromise;
      return res.status(200).json(tcpResponse);
    } catch (error) {
      logger.error(`Status request failed [${requestId}]: ${error.message}`);
      
      return res.status(503).json({
        error: "Inventory Server is currently unavailable or timed out",
        details: error.message
      });
    }
  });

  return router;
}

module.exports = createOrderRoutes;
