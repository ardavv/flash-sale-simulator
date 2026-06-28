'use strict';

/**
 * RequestCorrelator memetakan permintaan HTTP asinkron ke respons TCP 
 * yang sesuai dengan menggunakan requestId unik (biasanya UUID).
 */
class RequestCorrelator {
  constructor() {
    /**
     * Menyimpan daftar request yang sedang menunggu respons dari TCP server.
     * Key: requestId (string)
     * Value: { resolve: Function, reject: Function, timeoutHandle: NodeJS.Timeout }
     * @type {Map<string, Object>}
     */
    this._pendingRequests = new Map();
  }

  /**
   * Mendaftarkan request baru ke dalam correlator.
   * Mengembalikan Promise yang akan diselesaikan saat respons TCP masuk.
   *
   * @param {string} requestId - Identifier unik untuk permintaan
   * @param {number} timeoutMs - Batas waktu maksimal menunggu respons (dalam milidetik)
   * @returns {Promise<any>} Resolves dengan data respons dari TCP
   */
  register(requestId, timeoutMs) {
    return new Promise((resolve, reject) => {
      // Menyiapkan mekanisme timeout secara eksplisit
      const timeoutHandle = setTimeout(() => {
        // Hapus dari map karena waktu sudah habis
        this._pendingRequests.delete(requestId);
        
        // Buat error dengan deskripsi yang jelas
        const error = new Error(`TCP response timeout for request ${requestId} after ${timeoutMs}ms`);
        error.code = 'ETIMEDOUT';
        reject(error);
      }, timeoutMs);

      // Menyimpan fungsi penyelesai (resolver) dan rejecter ke dalam Map
      this._pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutHandle
      });
    });
  }

  /**
   * Menyelesaikan promise dari request yang sedang menunggu saat respons tiba.
   *
   * @param {string} requestId - Identifier unik dari respons
   * @param {any} data - Data objek hasil parse dari respons TCP
   */
  resolve(requestId, data) {
    const pending = this._pendingRequests.get(requestId);
    if (pending) {
      // Hentikan timer timeout agar tidak memicu reject di masa depan
      clearTimeout(pending.timeoutHandle);
      
      // Hapus request dari daftar tunggu
      this._pendingRequests.delete(requestId);
      
      // Selesaikan promise dengan data yang masuk
      pending.resolve(data);
    }
  }

  /**
   * Menolak promise secara manual untuk sebuah request.
   *
   * @param {string} requestId 
   * @param {Error} error 
   */
  reject(requestId, error) {
    const pending = this._pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this._pendingRequests.delete(requestId);
      pending.reject(error);
    }
  }

  /**
   * Menolak semua request yang sedang menunggu respons.
   * Sangat berguna ketika koneksi TCP terputus mendadak.
   *
   * @param {Error} error 
   */
  rejectAll(error) {
    for (const [requestId, pending] of this._pendingRequests.entries()) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(error);
    }
    this._pendingRequests.clear();
  }

  /**
   * Mendapatkan jumlah request yang saat ini sedang menunggu respons.
   * Digunakan untuk keperluan pemantauan (monitoring) atau health check.
   *
   * @returns {number} Jumlah request pending
   */
  getPendingCount() {
    return this._pendingRequests.size;
  }
}

module.exports = RequestCorrelator;
