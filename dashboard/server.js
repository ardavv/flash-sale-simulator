'use strict';

const express = require('express');
const path = require('path');

const app = express();

// Middleware wajib untuk mem-parsing body JSON pada request POST
app.use(express.json());

// Mengaktifkan sajian file statis secara langsung dari direktori 'dashboard'
// Nantinya, file index.html, css/style.css, js/app.js akan di-serve dari sini (Task 10.2 & 10.3)
app.use(express.static(__dirname));

// ==========================================
// MEMORI: Penyimpanan Data In-Memory
// ==========================================
// Menyimpan laporan terakhir dari MetricsReporter (Client Simulator)
let latestMetrics = null;

// Mengatur mekanisme Caching untuk Status Gateway (TTL: 2 Detik)
let cachedStatus = null;
let lastStatusFetchTime = 0;
const CACHE_TTL_MS = 2000;

// ==========================================
// ENDPOINT: /health
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==========================================
// ENDPOINT: POST /api/metrics
// (Webhook/Receiver untuk Client Simulator)
// ==========================================
app.post('/api/metrics', (req, res) => {
  latestMetrics = req.body;
  res.status(200).json({ message: 'Laporan metrik simulasi berhasil diterima.' });
});

// ==========================================
// ENDPOINT: GET /api/metrics
// (Endpoint yang akan di-polling oleh Frontend secara berkala)
// ==========================================
app.get('/api/metrics', (req, res) => {
  if (!latestMetrics) {
    return res.status(200).json({ 
      status: 'waiting', 
      message: 'Menunggu simulasi dijalankan...' 
    });
  }
  res.status(200).json(latestMetrics);
});

// ==========================================
// ENDPOINT: GET /api/status
// (Proxy ke Order Gateway dengan lapis Cache 2 Detik)
// ==========================================
app.get('/api/status', async (req, res) => {
  const now = Date.now();
  
  // Jika cache masih segar (berumur kurang dari 2 detik), kembalikan seketika tanpa network call
  if (cachedStatus && (now - lastStatusFetchTime < CACHE_TTL_MS)) {
    return res.status(200).json({ ...cachedStatus, _cached: true });
  }

  try {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
    
    // Tembak request ke peladen Order Gateway menggunakan fetch bawaan Node 18+
    const response = await fetch(`${gatewayUrl}/status`);
    
    if (!response.ok) {
      throw new Error(`Order Gateway membalas dengan status HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Perbarui brankas cache
    cachedStatus = data;
    lastStatusFetchTime = now;
    
    // Kirim respons mentah ke klien Frontend
    return res.status(200).json({ ...data, _cached: false });
  } catch (error) {
    console.error('[Dashboard Server] Gagal menarik data status:', error.message);
    
    // Fallback: Jika gateway mendadak down, tetapi kita masih punya sisa cache lama,
    // kita masih bisa menampilkannya (dengan flag _stale) agar UI tidak seketika hancur.
    if (cachedStatus) {
      return res.status(200).json({ ...cachedStatus, _cached: true, _stale: true });
    }
    
    // Kematian total: Gateway mati dan tak ada cache
    res.status(503).json({ error: 'Order Gateway is currently unreachable.' });
  }
});

// ==========================================
// MENYALAKAN SERVER (BOOTSTRAP)
// ==========================================
const PORT = process.env.DASHBOARD_PORT || 8080;

app.listen(PORT, () => {
  console.log(`\n=============================================`);
  console.log(`📊 DASHBOARD SERVER AKTIF 📊`);
  console.log(`=============================================`);
  console.log(`-> Akses UI Visual : http://localhost:${PORT}`);
  console.log(`-> Target Gateway  : ${process.env.GATEWAY_URL || 'http://localhost:3000'}`);
  console.log(`=============================================\n`);
});
