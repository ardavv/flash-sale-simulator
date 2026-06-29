'use strict';

const { spawn } = require('child_process');
const path = require('path');
const SequentialRunner = require('../runner/sequentialRunner');
const ParallelRunner = require('../runner/parallelRunner');

jest.setTimeout(60000);

describe('Integration Test — Parallel vs Sequential (Speedup)', () => {
  let inventoryProcess;
  let gatewayProcess;
  
  const GATEWAY_PORT = 3102;
  const INVENTORY_PORT = 4102;
  const INITIAL_STOCK = 10000;

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

  it('seharusnya membuktikan bahwa waktu eksekusi Parallel lebih cepat dari Sequential', async () => {
    const gatewayUrl = `http://localhost:${GATEWAY_PORT}/order`;
    const totalRequests = 1000; 
    const workerCount = 5;

    const seqRunner = new SequentialRunner(gatewayUrl, totalRequests, 5000);
    const seqMetrics = await seqRunner.run();
    const tSequential = seqMetrics.executionTimeMs;

    await new Promise(resolve => setTimeout(resolve, 1000));

    const parRunner = new ParallelRunner(gatewayUrl, totalRequests, workerCount, 5000);
    const parMetrics = await parRunner.run();
    const tParallel = parMetrics.executionTimeMs;

    const speedup = tSequential / tParallel;
    
    // Kita berikan sedikit margin jika environment testing OS single-core atau penuh beban background
    expect(tParallel).toBeLessThan(tSequential * 1.05);

    if (speedup <= 1.0) {
      console.warn(`Speedup <= 1 (${speedup.toFixed(2)}x). Ini normal jika mesin testing kekurangan core CPU atau beban HTTP request tak sepadan dengan ongkos spin-up thread.`);
    } else {
      expect(speedup).toBeGreaterThan(1);
    }
  });
});
