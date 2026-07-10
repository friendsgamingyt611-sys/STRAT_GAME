/**
 * TacticChart.js — Shoot Or Shield
 * Handles radar chart canvas drawing for playstyle analysis.
 */

// Hex theme colors to resolve CSS variables in HTML5 Canvas
const COLORS = {
  shoot: '#d95f5f',
  shield: '#4a8cc4',
  idle: '#7a7a7a',
  accent: '#c8a96e',
  text: '#e0e0e0',
  surface: '#181818'
};

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

    // Dynamically calculate canvas display dimensions based on container width
    const container = canvas.parentElement;
    const displayWidth = container ? Math.floor(container.clientWidth) : 340;
    
    // Choose height based on screen orientation/width to keep a nice proportion
    let displayHeight = 200;
    if (displayWidth > 500) {
      displayHeight = Math.min(Math.floor(displayWidth * 0.35), 280);
    } else {
      displayHeight = Math.floor(displayWidth * 0.6);
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const w = displayWidth;
    const h = displayHeight;

    // Center of the canvas
    const cx = w / 2;
    const cy = h / 2 + 10;

    // Calculate maximum radius r dynamically to fit labels and vertices without clipping
    const maxR_top = cy - 25;
    const maxR_right = (w - cx - 115) / 0.866;
    const maxR_left = (cx - 97) / 0.866;
    let r = Math.min(maxR_top, maxR_right, maxR_left);
    r = Math.max(50, Math.floor(r)); // Ensure a minimum size of 50px

    // Dynamic font size based on radius size
    const fontSize = Math.min(12, Math.max(9, Math.floor(r / 7.5)));

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
    ctx.font = `${fontSize}px "Share Tech Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textOffset = Math.floor(fontSize * 1.3);

    // Top: Slayer (Shoot)
    ctx.fillText('SLAYER (SHOOT)', vertices[0].x, vertices[0].y - textOffset);
    // Bottom Right: Guardian (Shield)
    ctx.textAlign = 'left';
    ctx.fillText('GUARDIAN (SHIELD)', vertices[1].x + 5, vertices[1].y + 5);
    // Bottom Left: Hoarder (Idle)
    ctx.textAlign = 'right';
    ctx.fillText('HOARDER (IDLE)', vertices[2].x - 5, vertices[2].y + 5);

    // Calculate rates and plot player playstyle state on the spider web
    if (total >= 3 && freq) {
      const sRate = (freq.shoot ?? 0) / total;
      const shRate = (freq.shield ?? 0) / total;
      const iRate = (freq.idle ?? 0) / total;

      // Plot area connecting points on the 3 axes
      ctx.fillStyle = 'rgba(200, 169, 110, 0.15)';
      ctx.strokeStyle = COLORS.accent;
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

      // Draw normal dot markers at each axis value (white with dark gray border)
      const rates = [sRate, shRate, iRate];
      rates.forEach((rate, idx) => {
        ctx.beginPath();
        const dx = cx + r * rate * Math.cos(angles[idx]);
        const dy = cy + r * rate * Math.sin(angles[idx]);
        ctx.arc(dx, dy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#484848';
        ctx.lineWidth = 1.5;
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
