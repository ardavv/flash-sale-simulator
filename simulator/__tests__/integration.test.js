'use strict';

const { spawn } = require('child_process');
const path = require('path');
const ParallelRunner = require('../runner/parallelRunner');

jest.setTimeout(45000);

describe('Integration Test — Anti-Overselling', () => {
  let inventoryProcess;
  let gatewayProcess;
  
  const GATEWAY_PORT = 3101;
  const INVENTORY_PORT = 4101;
  const INITIAL_STOCK = 1000;

  beforeAll(async () => {
    const inventoryPath = path.resolve(__dirname, '../../inventory/index.js');
    const gatewayPath = path.resolve(__dirname, '../../gateway/index.js');

    inventoryProcess = spawn('node', [inventoryPath], {
      env: { ...process.env, TCP_PORT: INVENTORY_PORT, INITIAL_STOCK: INITIAL_STOCK },
      stdio: 'ignore'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    gatewayProcess = spawn('node', [gatewayPath], {
      env: { ...process.env, PORT: GATEWAY_PORT, INVENTORY_TCP_PORT: INVENTORY_PORT },
      stdio: 'ignore'
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (gatewayProcess) gatewayProcess.kill();
    if (inventoryProcess) inventoryProcess.kill();
  });

  it('seharusnya menahan beban ribuan request serentak tanpa menyebabkan stok bernilai negatif', async () => {
    const gatewayUrl = `http://localhost:${GATEWAY_PORT}/order`;
    const totalRequests = 2000; 
    const workerCount = 20;

    const runner = new ParallelRunner(gatewayUrl, totalRequests, workerCount, 5000);
    const metrics = await runner.run();

    expect(metrics.totalRequests).toBe(totalRequests);

    // Beri jeda 2 detik agar event loop stabil (menghindari timeout saat TCP socket sibuk)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await fetch(`http://localhost:${GATEWAY_PORT}/status`);
    const statusText = await response.text();
    let statusData;
    try {
      statusData = JSON.parse(statusText);
    } catch (e) {
      throw new Error(`Failed to parse status response: ${statusText}`);
    }
    
    if (statusData.masterStock === undefined) {
      throw new Error(`Status response invalid. HTTP: ${response.status}. Body: ${statusText}`);
    }

    expect(statusData.masterStock).toBeGreaterThanOrEqual(0);
    expect(statusData.masterStock).toBeGreaterThanOrEqual(0);
    expect(statusData.slaveStock).toBeGreaterThanOrEqual(0);
    
    expect(statusData.masterStock).toBe(0);
  });
});
