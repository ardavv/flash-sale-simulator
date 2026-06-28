'use strict';

const fc = require('fast-check');
const validatePayload = require('../validatePayload');

describe('validatePayload middleware - Feature: flash-sale-simulator, Property 5: Validasi Payload Komprehensif', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    // Inisialisasi mock objek Express
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  test('menerima payload yang sepenuhnya valid dan memanggil next()', () => {
    return fc.assert(
      fc.property(
        // productId: string yang panjangnya minimal 1, dan setelah di-trim bukan string kosong
        fc.string({ minLength: 1 }).filter(s => s.trim() !== ''),
        // quantity: integer positif lebih dari 0
        fc.integer({ min: 1, max: 1000000 }),
        (productId, quantity) => {
          // Reset state dari jest mock
          mockNext.mockClear();
          mockRes.status.mockClear();
          mockRes.json.mockClear();

          mockReq.body = { productId, quantity };
          
          validatePayload(mockReq, mockRes, mockNext);
          
          expect(mockNext).toHaveBeenCalledTimes(1);
          expect(mockRes.status).not.toHaveBeenCalled();
          expect(mockRes.json).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('menolak payload dengan productId yang tidak valid dan merespons HTTP 400', () => {
    return fc.assert(
      fc.property(
        // Kumpulan productId tidak valid: kosong murni, whitespace saja, angka, null, dsb.
        fc.oneof(
          fc.constant(''),
          fc.constant('   '),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.object()
        ),
        // quantity dipastikan valid
        fc.integer({ min: 1, max: 10000 }),
        (invalidProductId, validQuantity) => {
          mockNext.mockClear();
          mockRes.status.mockClear();
          mockRes.json.mockClear();

          mockReq.body = { productId: invalidProductId, quantity: validQuantity };
          
          validatePayload(mockReq, mockRes, mockNext);
          
          expect(mockNext).not.toHaveBeenCalled();
          expect(mockRes.status).toHaveBeenCalledWith(400);
          expect(mockRes.json).toHaveBeenCalled();
        }
      )
    );
  });

  test('menolak payload dengan quantity yang tidak valid dan merespons HTTP 400', () => {
    return fc.assert(
      fc.property(
        // productId dipastikan valid
        fc.string({ minLength: 1 }).filter(s => s.trim() !== ''), 
        // Kumpulan quantity tidak valid: angka <= 0, desimal/float, string, null, dsb.
        fc.oneof(
          fc.integer({ max: 0 }),
          // Buat desimal, pastikan bukan integer utuh
          fc.float().filter(f => !Number.isInteger(f)),
          fc.string(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.object()
        ),
        (validProductId, invalidQuantity) => {
          mockNext.mockClear();
          mockRes.status.mockClear();
          mockRes.json.mockClear();

          mockReq.body = { productId: validProductId, quantity: invalidQuantity };
          
          validatePayload(mockReq, mockRes, mockNext);
          
          expect(mockNext).not.toHaveBeenCalled();
          expect(mockRes.status).toHaveBeenCalledWith(400);
          expect(mockRes.json).toHaveBeenCalled();
        }
      )
    );
  });

  test('menolak jika body kosong atau formatnya sama sekali bukan objek', () => {
    return fc.assert(
      fc.property(
        // Body tidak valid sama sekali
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.string(), fc.integer()),
        (invalidBody) => {
          mockNext.mockClear();
          mockRes.status.mockClear();
          mockRes.json.mockClear();

          mockReq.body = invalidBody;
          
          validatePayload(mockReq, mockRes, mockNext);
          
          expect(mockNext).not.toHaveBeenCalled();
          expect(mockRes.status).toHaveBeenCalledWith(400);
          expect(mockRes.json).toHaveBeenCalled();
        }
      )
    );
  });
});
