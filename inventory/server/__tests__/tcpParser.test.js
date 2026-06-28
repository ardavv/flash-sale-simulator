'use strict';

const EventEmitter = require('events');
const fc = require('fast-check');
const TcpServer = require('../tcpServer');

// Mock socket that emits data and handles writes
class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.remotePort = 12345;
    this.destroyed = false;
    this.writable = true;
    this.writtenData = [];
  }
  
  write(data) {
    this.writtenData.push(data);
  }
  
  destroy() {
    this.destroyed = true;
    this.writable = false;
  }
}

describe('TcpServer - Feature: flash-sale-simulator, Property 6: Round-Trip Parsing TCP', () => {
  let server;
  let mockSocket;
  
  beforeEach(() => {
    // We only need the port for instantiation; we won't call start()
    server = new TcpServer(4000);
    mockSocket = new MockSocket();
    
    // Silence logger for clean test output
    server.logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
  });

  test('menggabungkan fragmen pesan acak menjadi JSON yang valid secara berurutan', () => {
    // We want to test that arbitrary JSON objects can be sent in arbitrary chunks
    // and correctly parsed by the server.
    
    return fc.assert(
      fc.property(
        // Generate an array of valid JSON objects (stripped of undefined, etc.)
        fc.array(fc.object().map(obj => JSON.parse(JSON.stringify(obj)))),
        // Generate an array of integers which we will use to chunk the payload randomly
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1 }),
        (jsonObjects, chunkSizes) => {
          // Fresh socket per fast-check iteration
          const iterationSocket = new MockSocket();
          
          // Build the full string to send (newline separated)
          const fullPayload = jsonObjects.map(obj => JSON.stringify(obj)).join('\n') + (jsonObjects.length > 0 ? '\n' : '');
          
          let receivedObjects = [];
          server.on('message', (obj) => {
            receivedObjects.push(obj);
          });
          
          // Pass our fresh mock socket to handleConnection
          server.handleConnection(iterationSocket);
          
          // Split fullPayload into fragments based on chunkSizes and emit them
          let currentIdx = 0;
          let chunkIdx = 0;
          while (currentIdx < fullPayload.length) {
            const size = chunkSizes[chunkIdx % chunkSizes.length];
            const chunk = fullPayload.slice(currentIdx, currentIdx + size);
            iterationSocket.emit('data', Buffer.from(chunk));
            currentIdx += size;
            chunkIdx++;
          }
          
          // Assert that received objects equal exactly what we sent
          expect(receivedObjects).toEqual(jsonObjects);
          
          // Cleanup the listener to avoid memory leaks across fast-check runs
          server.removeAllListeners('message');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('menangani JSON tidak valid tanpa crash dan mengirimkan pesan error', () => {
    server.handleConnection(mockSocket);
    
    // Kirim JSON yang rusak (missing closing brace)
    mockSocket.emit('data', Buffer.from('{"broken": "json"\n'));
    
    // Seharusnya menghasilkan respons error ke gateway
    expect(mockSocket.writtenData.length).toBe(1);
    
    const response = JSON.parse(mockSocket.writtenData[0]);
    expect(response).toEqual({
      requestId: null,
      status: "error",
      reason: "invalid_json"
    });
    
    // Server logger harus mencatat error tersebut
    expect(server.logger.error).toHaveBeenCalled();
  });
});
