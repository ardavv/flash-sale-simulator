'use strict';

const net = require('net');
const EventEmitter = require('events');

/**
 * TcpClient menangani koneksi persisten *(persistent connection)* dari Order Gateway
 * ke Inventory Coordinator. Termasuk logika auto-reconnect dan penanganan
 * fragmentasi buffer melalui parser baris baru (newline delimiter).
 */
class TcpClient extends EventEmitter {
  /**
   * @param {string} host - Hostname atau IP dari Inventory Server
   * @param {number} port - Port dari Inventory Server
   * @param {import('./requestCorrelator')} correlator - Instance dari RequestCorrelator
   * @param {Object} options - Konfigurasi opsional (maxRetries, retryIntervalMs)
   */
  constructor(host, port, correlator, options = {}) {
    super();
    this.host = host;
    this.port = port;
    this.correlator = correlator;
    
    this.options = {
      maxRetries: 5,
      retryIntervalMs: 1000,
      ...options
    };
    
    this.client = null;
    this.connected = false;
    this.retryCount = 0;
    this.reconnectTimer = null;
    this._isDestroyed = false; // Flag untuk mencegah reconnect jika dihancurkan secara sengaja
    
    try {
      this.logger = require('../utils/logger').createLogger('TCP_CLIENT');
    } catch (e) {
      this.logger = console;
    }
  }

  /**
   * Menghubungkan client ke server TCP.
   * @returns {Promise<void>} Resolves saat terkoneksi
   */
  async connect() {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        return resolve();
      }

      this.client = new net.Socket();
      let buffer = '';

      const onConnect = () => {
        this.connected = true;
        this.retryCount = 0; // Reset counter saat berhasil terhubung
        this.logger.info(`Connected to Inventory Server at ${this.host}:${this.port}`);
        
        // Hapus listener error awal yang digunakan untuk inisialisasi Promise
        this.client.removeListener('error', initialError);
        
        // Pasang listener error reguler agar aplikasi tidak crash
        this.client.on('error', this._handleError.bind(this));
        
        resolve();
      };

      const initialError = (err) => {
        if (this.client) {
          this.client.destroy();
          this.client = null;
        }
        reject(err);
      };

      // Listener error sekali-pakai (once) khusus saat awal proses connect
      this.client.once('error', initialError);
      
      // Listener untuk menerima data masuk
      this.client.on('data', (data) => {
        // Menangani fragmentasi: tambahkan chunk ke dalam buffer
        buffer += data.toString('utf-8');

        let newlineIndex;
        // Parsing selama ditemukan karakter newline
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (messageStr.trim().length === 0) continue;

          try {
            const parsedJson = JSON.parse(messageStr);
            
            // Injeksi: Memanggil resolve pada correlator jika ada requestId
            if (parsedJson && parsedJson.requestId) {
              this.correlator.resolve(parsedJson.requestId, parsedJson);
            } else {
               this.logger.warn('Received response without requestId', parsedJson);
            }
          } catch (e) {
            this.logger.error(`Failed to parse incoming response: ${messageStr}`, { error: e.message });
          }
        }
      });

      // Listener untuk koneksi yang terputus
      this.client.on('close', () => {
        this._handleDisconnect();
      });

      this.logger.info(`Connecting to Inventory Server at ${this.host}:${this.port}...`);
      this.client.connect(this.port, this.host, onConnect);
    });
  }

  _handleError(err) {
    this.logger.error(`TCP Client Error: ${err.message}`);
    // Socket akan otomatis emit 'close' setelah error,
    // maka auto-reconnect akan ditangani oleh _handleDisconnect()
  }

  _handleDisconnect() {
    if (this._isDestroyed) return; // Jangan lakukan reconnect jika dihancurkan secara sengaja

    this.connected = false;
    this.client = null;
    
    // Tolak semua promise yang masih pending karena koneksi terputus secara tiba-tiba
    const error = new Error('TCP connection to Inventory Server lost');
    error.code = 'ECONNRESET';
    if (this.correlator && typeof this.correlator.rejectAll === 'function') {
      this.correlator.rejectAll(error);
    }

    this.emit('disconnect');

    // Logika Auto-Reconnect
    if (this.retryCount < this.options.maxRetries) {
      this.retryCount++;
      this.logger.warn(`Connection lost. Reconnecting in ${this.options.retryIntervalMs}ms (Attempt ${this.retryCount}/${this.options.maxRetries})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect().catch((err) => {
          this.logger.error(`Reconnect attempt ${this.retryCount} failed: ${err.message}`);
          // Panggil kembali _handleDisconnect untuk memicu looping hingga maxRetries tercapai
          this._handleDisconnect(); 
        });
      }, this.options.retryIntervalMs);
    } else {
      this.logger.error(`Failed to reconnect after ${this.options.maxRetries} attempts. Giving up.`);
      this.emit('exhausted');
    }
  }

  /**
   * Mengecek apakah client sedang terhubung ke server.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Mendaftarkan callback untuk event disconnect
   * @param {Function} callback 
   */
  onDisconnect(callback) {
    this.on('disconnect', callback);
  }

  /**
   * Mengirim pesan ke Inventory Coordinator.
   * Mengonversi objek menjadi JSON dan memastikan ada karakter newline di bagian akhir.
   * 
   * @param {Object} messageObj - Objek JSON yang akan dikirim
   * @returns {Promise<void>} 
   */
  send(messageObj) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.client) {
        return reject(new Error('Cannot send message: TCP Client is not connected'));
      }

      try {
        // Serialisasi dan tambahan absolute newline '\n'
        const payload = JSON.stringify(messageObj) + '\n';
        
        this.client.write(payload, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Menghancurkan client dan menonaktifkan auto-reconnect.
   */
  destroy() {
    this._isDestroyed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    
    this.connected = false;
    this.removeAllListeners();
  }
}

module.exports = TcpClient;
