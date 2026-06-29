// ==========================================
// MODUL: METRICS PANEL (metricsPanel.js)
// Mengelola tampilan nilai metrik secara Head-to-Head dan kalkulasi Speedup
// ==========================================
const MetricsPanel = (function() {
    
    // Tarik memori yang tersisa saat halaman dimuat (agar tahan Refresh)
    function loadFromStorage() {
        const seqTime = sessionStorage.getItem('seqTime');
        const seqRps = sessionStorage.getItem('seqRps');
        const parTime = sessionStorage.getItem('parTime');
        const parRps = sessionStorage.getItem('parRps');

        if (seqTime) document.getElementById('seq-exec-time').textContent = Number(seqTime).toFixed(2);
        if (seqRps) document.getElementById('seq-throughput').textContent = Number(seqRps).toFixed(2);
        
        if (parTime) document.getElementById('par-exec-time').textContent = Number(parTime).toFixed(2);
        if (parRps) document.getElementById('par-throughput').textContent = Number(parRps).toFixed(2);

        calculateSpeedup();
    }

    // Hitung Speedup dari data yang ada di sessionStorage
    function calculateSpeedup() {
        const seqTime = sessionStorage.getItem('seqTime');
        const parTime = sessionStorage.getItem('parTime');
        
        if (seqTime && parTime) {
            const speedup = parseFloat(seqTime) / parseFloat(parTime);
            document.getElementById('metric-speedup').textContent = speedup.toFixed(2);
        }
    }

    // Fungsi pembaruan DOM setiap kali Polling menerima data terbaru
    function updateMetrics(metrics) {
        if (!metrics || metrics.status === 'waiting') return;

        // Jika mode saat ini adalah Sequential
        if (metrics.mode === 'sequential') {
            // Simpan jejaknya ke Brankas Browser
            sessionStorage.setItem('seqTime', metrics.executionTimeMs);
            sessionStorage.setItem('seqRps', metrics.throughputRps);
            
            // Perbarui visualisasi DOM
            document.getElementById('seq-exec-time').textContent = Number(metrics.executionTimeMs).toFixed(2);
            document.getElementById('seq-throughput').textContent = Number(metrics.throughputRps).toFixed(2);
        } 
        // Jika mode saat ini adalah Parallel
        else if (metrics.mode === 'parallel') {
            sessionStorage.setItem('parTime', metrics.executionTimeMs);
            sessionStorage.setItem('parRps', metrics.throughputRps);
            
            document.getElementById('par-exec-time').textContent = Number(metrics.executionTimeMs).toFixed(2);
            document.getElementById('par-throughput').textContent = Number(metrics.throughputRps).toFixed(2);
        }

        // Jalankan kalkulasi rasio matematika dari kedua sisi
        calculateSpeedup();
    }

    // Daftarkan aksi otomatis pemuatan saat DOM siap
    window.addEventListener('DOMContentLoaded', loadFromStorage);

    return { updateMetrics };
})();
