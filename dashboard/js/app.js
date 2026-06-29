// ==========================================
// MAIN CONTROLLER (app.js)
// Otak utama yang bertugas sebagai Koordinator Tarikan Polling
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Inisialisasi kanvas Chart.js di awal mula pemuatan
    DashboardChart.init();

    // 2. Fungsi Tarikan Data (Polling)
    async function pollStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            const dot = document.getElementById('sim-status-dot');
            const text = document.getElementById('sim-status-text');

            if (res.ok && !data.error) {
                // Teruskan data berharga ini ke modul penampil Stok
                StockDisplay.updateStatus(data);
                
                // Nyalakan lampu status terkoneksi
                dot.classList.add('active');
                text.textContent = 'Terhubung ke Gateway API';
            } else {
                // Matikan lampu hijau jika Gateway mengembalikan pesan error
                dot.classList.remove('active');
                text.textContent = data.error || 'Order Gateway Terputus';
            }
        } catch (err) {
            console.error('[App] Kegagalan Jaringan saat Poll Status:', err);
            const dot = document.getElementById('sim-status-dot');
            dot.classList.remove('active');
            document.getElementById('sim-status-text').textContent = 'Server Dashboard Terputus';
        }
    }

    async function pollMetrics() {
        try {
            const res = await fetch('/api/metrics');
            const data = await res.json();
            
            if (res.ok) {
                // Jika metrik valid (ada isinya), sebar luaskan datanya ke Panel dan Grafik
                MetricsPanel.updateMetrics(data);
                DashboardChart.updateChart(data);
            }
        } catch (err) {
            console.error('[App] Kegagalan Jaringan saat Poll Metrics:', err);
        }
    }

    // 3. Sentakan Pertama (Immediate Execution)
    // Agar layar tidak kosong menunggu 2 detik pertama
    pollStatus();
    pollMetrics();

    // 4. Denyut Nadi Aplikasi (Polling Loop 2 Detik)
    setInterval(() => {
        pollStatus();
        pollMetrics();
    }, 2000);
});
