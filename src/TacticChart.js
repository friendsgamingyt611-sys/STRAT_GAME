/**
 * TacticChart.js — Shoot Or Shield
 * Handles radar chart canvas drawing for playstyle analysis.
 */

export class TacticChart {
  /**
   * Draw the radar chart onto the canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} freq - Frequencies of moves {shoot, shield, idle}
   * @param {number} total - Total rounds played
   */
  static draw(canvas, freq, total) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 220;
    const displayHeight = 190;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const w = displayWidth;
    const h = displayHeight;

    // Center & radius of radar chart
    const cx = w / 2;
    const cy = h / 2 + 10;
    const r = 60;

    // Angles for the 3 pure tactic vertices
    const angles = [-Math.PI / 2, Math.PI / 6, 5 * Math.PI / 6];
    const vertices = angles.map(a => ({
      x: cx + r * Math.cos(a),
      y: cy + r * Math.sin(a)
    }));

    // Draw background concentric web triangles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let factor = 0.25; factor <= 1; factor += 0.25) {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + r * factor * Math.cos(a);
        const y = cy + r * factor * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }

    // Draw axis lines from center to vertices
    ctx.beginPath();
    vertices.forEach(v => {
      ctx.moveTo(cx, cy);
      ctx.lineTo(v.x, v.y);
    });
    ctx.stroke();

    // Draw label text at vertices
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Top: Slayer (Shoot)
    ctx.fillText('SLAYER (⚡)', vertices[0].x, vertices[0].y - 12);
    // Bottom Right: Guardian (Shield)
    ctx.textAlign = 'left';
    ctx.fillText('GUARDIAN (🛡)', vertices[1].x + 5, vertices[1].y + 5);
    // Bottom Left: Hoarder (Idle)
    ctx.textAlign = 'right';
    ctx.fillText('HOARDER (◎)', vertices[2].x - 5, vertices[2].y + 5);

    // Calculate rates and plot player playstyle state on the spider web
    if (total >= 3 && freq) {
      const sRate = (freq.shoot ?? 0) / total;
      const shRate = (freq.shield ?? 0) / total;
      const iRate = (freq.idle ?? 0) / total;

      // Plot area connecting points on the 3 axes
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.strokeStyle = 'var(--accent)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      // Shoot point
      ctx.moveTo(cx + r * sRate * Math.cos(angles[0]), cy + r * sRate * Math.sin(angles[0]));
      // Shield point
      ctx.lineTo(cx + r * shRate * Math.cos(angles[1]), cy + r * shRate * Math.sin(angles[1]));
      // Idle point
      ctx.lineTo(cx + r * iRate * Math.cos(angles[2]), cy + r * iRate * Math.sin(angles[2]));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw dot markers at each axis value
      const rates = [sRate, shRate, iRate];
      const colors = ['var(--shoot)', 'var(--shield)', 'var(--idle)'];
      rates.forEach((rate, idx) => {
        ctx.beginPath();
        const dx = cx + r * rate * Math.cos(angles[idx]);
        const dy = cy + r * rate * Math.sin(angles[idx]);
        ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
    } else {
      // Draw a default small pulse in the center (uninitialized/analyzing)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
