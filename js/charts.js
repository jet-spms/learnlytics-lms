/**
 * charts.js — Chart.js wrappers
 *
 * v3 changes:
 *  CHANGE: renderExamBar() updated to accept module-level data (array of moduleStats)
 *          instead of flat exam list. Now renders per-module cleared/failed bar.
 */

const Charts = (() => {
  const chartInstances = {};

  function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
  }

  function renderRadar(canvasId, student, darkMode = false, context = {}) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const data      = Calc.radarData(student, context);
    const textColor = darkMode ? '#cbd5e1' : '#475569';
    const gridColor = darkMode ? 'rgba(148,163,184,0.15)' : 'rgba(71,85,105,0.1)';
    const fill      = darkMode ? 'rgba(56,189,248,0.15)' : 'rgba(14,165,233,0.15)';
    const stroke    = darkMode ? '#38bdf8' : '#0ea5e9';

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: data.labels,
        datasets: [{
          label: student.name,
          data:  data.values,
          backgroundColor: fill, borderColor: stroke, borderWidth: 2,
          pointBackgroundColor: stroke,
          pointBorderColor:     darkMode ? '#1e293b' : '#fff',
          pointHoverBackgroundColor: darkMode ? '#1e293b' : '#fff',
          pointHoverBorderColor: stroke,
          pointRadius: 4, pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 20, color: textColor, font: { size: 10 }, backdropColor: 'transparent' },
            pointLabels: { color: textColor, font: { size: 12, weight: '500' } },
            grid: { color: gridColor }, angleLines: { color: gridColor }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor: darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:  darkMode ? '#94a3b8' : '#475569',
            borderColor:darkMode ? '#334155' : '#e2e8f0',
            borderWidth: 1, padding: 10,
            callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toFixed(1)}` }
          }
        }
      }
    });
  }

  function renderAcademicBar(canvasId, student, darkMode = false) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const tests = student.weeklyTests || [];
    if (!tests.length) {
      const ctx = canvas.getContext('2d');
      ctx.font = '14px DM Sans'; ctx.fillStyle = darkMode ? '#64748b' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('No test data yet', canvas.width / 2, canvas.height / 2);
      return;
    }

    const labels    = tests.map((t, i) => t.week || `Week ${i + 1}`);
    const scores    = tests.map(t => parseFloat(((t.marks / t.total) * 100).toFixed(1)));
    const barColor  = darkMode ? '#818cf8' : '#6366f1';
    const lineColor = darkMode ? '#f472b6' : '#ec4899';
    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const gridColor = darkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)';

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Score (%)', data: scores, backgroundColor: barColor + '80', borderColor: barColor,
            borderWidth: 2, borderRadius: 6, order: 2 },
          { label: 'Trend', data: scores, type: 'line', borderColor: lineColor, borderWidth: 2,
            pointBackgroundColor: lineColor, pointRadius: 4, fill: false, tension: 0.4, order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          y: { min: 0, max: 100, ticks: { color: textColor, font: { size: 11 }, callback: v => v + '%' }, grid: { color: gridColor } },
          x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
        },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor: darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:  darkMode ? '#94a3b8' : '#475569',
            borderColor:darkMode ? '#334155' : '#e2e8f0', borderWidth: 1
          }
        }
      }
    });
  }

  function renderAttendanceDonut(canvasId, student, darkMode = false) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const sessions  = student.sessions || [];
    const present   = sessions.filter(s => Calc._isPresent(s)).length;
    const absent    = sessions.length - present;
    const textColor = darkMode ? '#94a3b8' : '#64748b';

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent'],
        datasets: [{
          data: [present || 0, absent || 0],
          backgroundColor: ['#22c55e', darkMode ? '#ef4444' : '#f87171'],
          borderColor: darkMode ? '#1e293b' : '#fff',
          borderWidth: 3, hoverOffset: 6
        }]
      },
      options: {
        responsive: true, cutout: '72%',
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, font: { size: 12 }, padding: 16 } },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor: darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:  darkMode ? '#94a3b8' : '#475569',
            borderColor:darkMode ? '#334155' : '#e2e8f0', borderWidth: 1
          }
        }
      }
    });
  }

  /**
   * CHANGE: renderExamBar now accepts moduleStats array.
   * Shows a bar per module showing cleared/not cleared status.
   * For the inner parameter view, a separate simpler chart is used per module.
   */
  function renderExamBar(canvasId, examStats, darkMode = false) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // examStats = array of moduleStats objects from Calc.moduleStats()
    // Each has: { moduleNum, appeared, cleared, params }
    // We render per-module summary bar
    const appeared = examStats.filter(e => e.appeared);
    if (!appeared.length) {
      const ctx = canvas.getContext('2d');
      ctx.font = '14px DM Sans'; ctx.textAlign = 'center';
      ctx.fillStyle = darkMode ? '#64748b' : '#94a3b8';
      ctx.fillText('No exam data', canvas.width / 2, canvas.height / 2);
      return;
    }

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const gridColor = darkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)';

    // For appeared modules, show cleared params / total appeared params
    const labels   = appeared.map(e => `Module ${e.moduleNum}`);
    const cleared  = appeared.map(e => e.clearedCount);
    const total    = appeared.map(e => e.appearedCount);
    const bgColors = appeared.map(e => e.cleared ? '#22c55e99' : '#f97316aa');
    const bdColors = appeared.map(e => e.cleared ? '#16a34a'   : '#ea580c');

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Params Cleared', data: cleared, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 2, borderRadius: 5 },
          { label: 'Params Appeared', data: total, backgroundColor: 'transparent',
            borderColor: darkMode ? '#475569' : '#cbd5e1', borderWidth: 2, borderDash: [4,4],
            type: 'line', pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min: 0, ticks: { stepSize: 1, color: textColor }, grid: { color: gridColor } },
          x: { ticks: { color: textColor } }
        },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor: darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:  darkMode ? '#94a3b8' : '#475569',
            borderColor:darkMode ? '#334155' : '#e2e8f0', borderWidth: 1
          }
        }
      }
    });
  }

  /** Render parameter-level marks bar for one module */
  function renderModuleParamBar(canvasId, paramStats, darkMode = false) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const appeared = paramStats.filter(p => p.appeared && p.marks !== null);
    if (!appeared.length) return;

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const gridColor = darkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)';
    const labels    = appeared.map(p => p.name);
    const scored    = appeared.map(p => p.marks);
    const maxM      = appeared.map(p => p.maxMarks);
    const bgColors  = appeared.map(p => p.cleared ? '#22c55e99' : '#ef444499');
    const bdColors  = appeared.map(p => p.cleared ? '#16a34a'   : '#dc2626');

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Scored', data: scored, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 2, borderRadius: 5, order: 2 },
          { label: 'Max Marks', data: maxM, type: 'line',
            borderColor: darkMode ? '#475569' : '#cbd5e1',
            borderWidth: 1.5, borderDash: [4,4], pointRadius: 0, fill: false, order: 1 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { min: 0, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor } }
        },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor: darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:  darkMode ? '#94a3b8' : '#475569',
            borderColor:darkMode ? '#334155' : '#e2e8f0', borderWidth: 1
          }
        }
      }
    });
  }

  function destroyAll() { Object.keys(chartInstances).forEach(destroyChart); }

  // ─── P4: Cross-Batch Comparison Bar ──────────────────────────────────────

  /**
   * Renders a grouped horizontal bar showing 4 metrics across all batches.
   * datasets: array of { label, data, color } — one per metric.
   * batchLabels: string[] — one per batch.
   */
  function renderCrossBatchBar(canvasId, batchLabels, datasets, darkMode = false, facultyNames = [], batchCodes = [], onBatchClick = null) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const textColor = darkMode ? '#94a3b8' : '#64748b';
    const gridColor = darkMode ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.06)';

    chartInstances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: batchLabels,
        datasets: datasets.map(d => ({
          label:           d.label,
          data:            d.data,
          backgroundColor: d.color + 'bb',
          borderColor:     d.color,
          borderWidth:     2,
          borderRadius:    5
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Drill-down: fire callback with batch index when a bar is clicked
        onClick: onBatchClick ? (evt, elements) => {
          if (!elements.length) return;
          onBatchClick(elements[0].index);
        } : undefined,
        // Show pointer cursor only when click handler is wired and hovering a bar
        onHover: onBatchClick ? (evt, elements) => {
          const c = evt.native?.target;
          if (c) c.style.cursor = elements.length ? 'pointer' : 'default';
        } : undefined,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { size: 11 }, padding: 14 }
          },
          tooltip: {
            backgroundColor: darkMode ? '#1e293b' : '#fff',
            titleColor:  darkMode ? '#f1f5f9' : '#0f172a',
            bodyColor:   darkMode ? '#94a3b8' : '#475569',
            borderColor: darkMode ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            callbacks: {
              // Title: full batch code (not the number shown on X-axis)
              title: items => batchCodes[items[0]?.dataIndex] || items[0]?.label || '',
              // After title: faculty name, shown before the metric lines
              afterTitle: items => {
                const faculty = facultyNames[items[0]?.dataIndex];
                return faculty ? `Faculty: ${faculty}` : '';
              },
              // Each metric line
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(1)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 11 }, maxRotation: 30 },
            grid:  { color: gridColor }
          },
          y: {
            min: 0, max: 100,
            ticks: { color: textColor, font: { size: 11 }, callback: v => v + '%' },
            grid:  { color: gridColor }
          }
        }
      }
    });
  }

  return {
    renderRadar, renderAcademicBar, renderAttendanceDonut,
    renderExamBar, renderModuleParamBar,
    renderCrossBatchBar,
    destroyAll, destroyChart
  };
})();
