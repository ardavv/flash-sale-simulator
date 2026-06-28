const { spawn } = require('child_process');

// Menjalankan kedua server sebagai child processes
const inventory = spawn('node', ['inventory/index.js']);
const gateway = spawn('node', ['gateway/index.js']);

// Meneruskan output log mereka ke console script ini
inventory.stdout.on('data', data => process.stdout.write(`[INVENTORY] ${data}`));
inventory.stderr.on('data', data => process.stderr.write(`[INVENTORY ERR] ${data}`));

gateway.stdout.on('data', data => process.stdout.write(`[GATEWAY] ${data}`));
gateway.stderr.on('data', data => process.stderr.write(`[GATEWAY ERR] ${data}`));

// Menunggu 3 detik agar kedua server benar-benar menyala (terutama TCP connection)
setTimeout(async () => {
  try {
    console.log('\n====================================');
    console.log('TEST 1: Mengirim Pesanan (POST /order)');
    console.log('====================================');
    const orderRes = await fetch('http://localhost:3000/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'FLASH-ITEM-001', quantity: 5 })
    });
    const orderData = await orderRes.json();
    console.log(`Status HTTP: ${orderRes.status}`);
    console.log('Respons Data:', orderData);

    console.log('\n====================================');
    console.log('TEST 2: Mengecek Status (GET /status)');
    console.log('====================================');
    const statusRes = await fetch('http://localhost:3000/status');
    const statusData = await statusRes.json();
    console.log(`Status HTTP: ${statusRes.status}`);
    console.log('Respons Data:', statusData);
    
  } catch (err) {
    console.error('Integration test failed:', err);
  } finally {
    console.log('\nMematikan kedua server...');
    inventory.kill();
    gateway.kill();
    process.exit(0);
  }
}, 3000);
