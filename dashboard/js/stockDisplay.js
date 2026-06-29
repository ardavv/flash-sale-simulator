// ==========================================
// MODUL: STOCK DISPLAY (stockDisplay.js)
// Mengawasi divergensi dan lag antara Master dan Slave DB
// ==========================================
const StockDisplay = (function() {
    
    function updateStatus(statusData) {
        if (!statusData || statusData.error) return;

        const masterStock = statusData.masterStock;
        const slaveStock = statusData.slaveStock;
        const isSynced = statusData.isSynced;
        const lag = statusData.replicationLag || 0;

        // Perbarui angka di papan panel
        document.getElementById('master-stock').textContent = masterStock;
        document.getElementById('slave-stock').textContent = slaveStock;

        // Tangkap elemen-elemen UI yang warnanya akan berubah
        const banner = document.getElementById('sync-indicator-banner');
        const slaveNode = document.getElementById('slave-node-container');
        const syncText = document.getElementById('sync-text');
        const lagText = document.getElementById('lag-text');

        lagText.textContent = `Lag: ${lag}ms`;

        // LOGIKA VISUAL: Tersinkronisasi vs Divergent
        // Sistem dikategorikan Sinkron HANYA jika flag isSynced true DAN angkanya identik.
        if (isSynced && masterStock === slaveStock) {
            banner.classList.remove('divergent');
            banner.classList.add('synced');
            
            slaveNode.classList.remove('divergent');
            slaveNode.classList.add('synced');
            
            syncText.textContent = 'Sistem Tersinkronisasi';
        } else {
            banner.classList.remove('synced');
            banner.classList.add('divergent');
            
            slaveNode.classList.remove('synced');
            slaveNode.classList.add('divergent');
            
            syncText.textContent = 'Sinkronisasi Tertinggal (Divergent)';
        }
    }

    return { updateStatus };
})();
