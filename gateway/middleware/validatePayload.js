'use strict';

/**
 * Middleware Express untuk memvalidasi payload HTTP POST pada endpoint pemesanan.
 * Dirancang untuk memenuhi Kriteria Penerimaan 2.2, 2.3, dan 2.4.
 *
 * @param {Object} req - Objek request Express
 * @param {Object} res - Objek response Express
 * @param {Function} next - Fungsi panggilan balik untuk meneruskan eksekusi
 */
function validatePayload(req, res, next) {
  const payload = req.body;

  // Pastikan body terdefinisi dengan benar (antisipasi body-parser belum dipasang atau body kosong)
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: "Format request body tidak valid" });
  }

  const { productId, quantity } = payload;

  // Validasi productId: Wajib ada, harus bertipe string, dan tidak boleh kosong
  if (
    productId === undefined || 
    typeof productId !== 'string' || 
    productId.trim() === ''
  ) {
    return res.status(400).json({ 
      error: "Field 'productId' harus berupa string non-kosong" 
    });
  }

  // Validasi quantity: Wajib ada, angka bulat (integer), dan lebih dari 0
  if (
    quantity === undefined || 
    typeof quantity !== 'number' || 
    !Number.isInteger(quantity) || 
    quantity <= 0
  ) {
    return res.status(400).json({ 
      error: "Field 'quantity' harus berupa integer positif yang lebih dari 0" 
    });
  }

  // Payload sepenuhnya valid, teruskan ke controller utama
  next();
}

module.exports = validatePayload;
