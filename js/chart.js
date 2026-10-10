// Temaya duyarlı, Chart.js tabanlı osiloskop/çizgi grafik yöneticisi
let chartInstance = null;

export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

export function renderPriceChart(canvasEl, pricePoints, currency = 'usd', isPositive = true) {
  destroyChart();

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  
  const gridColor = isLight ? '#D1D9E0' : '#1E2633';
  const tickColor = isLight ? '#57606A' : '#64748B';
  const tooltipBg = isLight ? '#F0F3F6' : '#0E1217';
  const tooltipText = isLight ? '#1F2328' : '#F1F5F9';
  const tooltipBorder = isLight ? '#C0CAD5' : '#1E2633';
  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const hoverPointBorder = isLight ? '#EAEEF2' : '#090B0E';

  const labels = pricePoints.map(p => {
    const d = new Date(p[0]);
    return d.toLocaleDateString('tr-TR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });

  const values = pricePoints.map(p => p[1]);
  const ctx = canvasEl.getContext('2d');

  chartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: strokeColor,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: strokeColor,
        pointHoverBorderColor: hoverPointBorder,
        pointHoverBorderWidth: 2,
        tension: 0.1,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: tooltipBg,
          titleColor: tickColor,
          bodyColor: tooltipText,
          borderColor: tooltipBorder,
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          titleFont: { family: 'JetBrains Mono', size: 10 },
          bodyFont: { family: 'JetBrains Mono', size: 12, weight: '500' },
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              return `${currency.toUpperCase()} ${val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: gridColor,
            drawBorder: false,
            lineWidth: 0.5
          },
          ticks: {
            color: tickColor,
            font: { family: 'JetBrains Mono', size: 9 },
            maxTicksLimit: 6,
            maxRotation: 0
          }
        },
        y: {
          display: true,
          position: 'right',
          grid: {
            color: gridColor,
            drawBorder: false,
            lineWidth: 0.5
          },
          ticks: {
            color: tickColor,
            font: { family: 'JetBrains Mono', size: 9 },
            maxTicksLimit: 5,
            callback: (val) => val.toLocaleString('tr-TR', { notation: 'compact' })
          }
        }
      }
    }
  });
}
