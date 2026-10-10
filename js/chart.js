// Chart.js terminal osiloskop grafik motoru, veri doğrulama ve eksen biçimlendirme
let chartInstance = null;

export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const canvas = document.getElementById('coin-chart');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function validateAndCleanPoints(points) {
  if (!Array.isArray(points)) return [];

  return points.filter(p => {
    if (!Array.isArray(p) || p.length < 2) return false;
    const time = p[0];
    const val = p[1];
    return typeof time === 'number' && !isNaN(time) && time > 0 &&
           typeof val === 'number' && !isNaN(val) && isFinite(val);
  });
}

export function downsamplePoints(points, maxPoints = 300) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  const lastPoint = points[points.length - 1];
  if (result[result.length - 1] !== lastPoint) {
    result.push(lastPoint);
  }
  return result;
}

function formatXDate(timestamp, days) {
  const d = new Date(timestamp);
  if (days <= 1) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } else if (days <= 30) {
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  } else {
    const month = d.toLocaleDateString('tr-TR', { month: '2-digit' });
    const year = String(d.getFullYear()).slice(-2);
    return `${month}.${year}`;
  }
}

export function renderPriceChart(canvasEl, rawPoints, currency = 'usd', days = 1, isPositive = true) {
  destroyChart();

  const cleaned = validateAndCleanPoints(rawPoints);
  if (cleaned.length < 2) {
    return false;
  }

  const finalPoints = downsamplePoints(cleaned, 300);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  const tickColor = isLight ? '#1E293B' : '#94A3B8';
  const tooltipBg = isLight ? '#FFFFFF' : '#0E1217';
  const tooltipText = isLight ? '#0F172A' : '#F1F5F9';
  const tooltipBorder = isLight ? '#CBD5E1' : '#2D3748';
  const strokeColor = isPositive ? '#10B981' : '#EF4444';
  const hoverPointBorder = isLight ? '#F0F3F6' : '#090B0E';

  const timestamps = finalPoints.map(p => p[0]);
  const values = finalPoints.map(p => p[1]);

  const currencyFormatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });

  const compactFormatter = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    notation: 'compact',
    compactDisplay: 'short'
  });

  const ctx = canvasEl.getContext('2d');

  chartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: timestamps,
      datasets: [{
        data: values,
        borderColor: strokeColor,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: strokeColor,
        pointHoverBorderColor: hoverPointBorder,
        pointHoverBorderWidth: 2,
        tension: 0.08,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: {
        intersect: false,
        mode: 'index'
      },
      layout: {
        padding: {
          top: 8,
          bottom: 12,
          left: 10,
          right: 20
        }
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
            title: (items) => {
              if (!items.length) return '';
              const ts = items[0].label;
              const d = new Date(parseInt(ts, 10));
              return d.toLocaleString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            },
            label: (context) => {
              const val = context.parsed.y;
              return currencyFormatter.format(val);
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
            maxRotation: 0,
            autoSkip: true,
            callback: function(val) {
              const ts = this.getLabelForValue(val);
              return formatXDate(parseInt(ts, 10), days);
            }
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
            callback: (val) => compactFormatter.format(val)
          }
        }
      }
    }
  });

  return true;
}
