// ==========================================
// MODUL: CHART JS INTEGRATION (charts.js)
// Melukis komparasi grafik arsitektur (Sequential vs Parallel)
// ==========================================
const DashboardChart = (function() {
    let performanceChart = null;

    function init() {
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        // Mewariskan pengaturan tipografi tema ke dalam Chart.js
        Chart.defaults.color = '#94a3b8'; // Abu-abu terang
        Chart.defaults.font.family = "'Outfit', sans-serif";

        performanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Sequential', 'Parallel'],
                datasets: [
                    {
                        label: 'Execution Time (ms) - Lebih Rendah Lebih Baik',
                        data: [0, 0],
                        // Warna dasar kaca kemerahan untuk Execution Time
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: 'rgba(239, 68, 68, 1)',
                        borderWidth: 1,
                        yAxisID: 'y' // Terikat ke sumbu Y kiri
                    },
                    {
                        label: 'Throughput (RPS) - Lebih Tinggi Lebih Baik',
                        data: [0, 0],
                        // Warna zamrud hijau untuk Throughput
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        yAxisID: 'y1' // Terikat ke sumbu Y kanan
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    // Sumbu Y Kiri (Execution Time)
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Execution Time (Milidetik)', color: '#f8fafc' }
                    },
                    // Sumbu Y Kanan (Throughput)
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Throughput (Request/Detik)', color: '#f8fafc' },
                        grid: { drawOnChartArea: false } // Mencegah garis panggangan saling tabrak
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#f8fafc' }
                    }
                }
            }
        });
    }

    function updateChart(metrics) {
        if (!metrics || !performanceChart) return;

        // Pemetaan indeks batang (0 = Sequential, 1 = Parallel)
        if (metrics.mode === 'sequential') {
            performanceChart.data.datasets[0].data[0] = metrics.executionTimeMs;
            performanceChart.data.datasets[1].data[0] = metrics.throughputRps;
        } else if (metrics.mode === 'parallel') {
            performanceChart.data.datasets[0].data[1] = metrics.executionTimeMs;
            performanceChart.data.datasets[1].data[1] = metrics.throughputRps;
        }

        // Gambar ulang kanvas secara halus
        performanceChart.update();
    }

    return { init, updateChart };
})();
