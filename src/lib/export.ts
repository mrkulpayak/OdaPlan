import { cmToPx } from './geometry';
import type { Room, FurnitureInstance } from '../types';

interface ExportOptions {
  showDimensions: boolean;
  zoom: number;
  panX: number;
  panY: number;
}

export async function exportToPNG(
  svgEl: SVGSVGElement,
  room: Room | null,
  instances: FurnitureInstance[],
  options: ExportOptions
): Promise<void> {
  if (!room) return;

  // Compute content bounding box in cm
  const allX = room.points.map((p) => p.x);
  const allY = room.points.map((p) => p.y);

  for (const inst of instances) {
    allX.push(inst.position.x, inst.position.x + 300); // rough max
    allY.push(inst.position.y, inst.position.y + 300);
  }

  const minX = Math.min(...allX);
  const minY = Math.min(...allY);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY);

  const pad = (maxX - minX + maxY - minY) * 0.05 + 40;
  const vbX = cmToPx(minX) - pad;
  const vbY = cmToPx(minY) - pad;
  const vbW = cmToPx(maxX - minX) + pad * 2;
  const vbH = cmToPx(maxY - minY) + pad * 2;

  // Clone SVG to manipulate without affecting live DOM
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Remove UI chrome: snap guides, selection handles
  clone.querySelectorAll('#snap-guides').forEach((el) => el.remove());
  clone.querySelectorAll('[data-handle]').forEach((el) => el.remove());

  // Hide dimension labels if needed
  if (!options.showDimensions) {
    clone.querySelectorAll('[data-dimension-label]').forEach((el) => {
      (el as SVGElement).style.display = 'none';
    });
  }

  // Set export viewBox — reset rotation/pan/zoom transforms, show content cropped
  const exportW = Math.round(vbW * 2);
  const exportH = Math.round(vbH * 2);

  clone.setAttribute('width', String(exportW));
  clone.setAttribute('height', String(exportH));
  clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);

  // Reset all group transforms to raw coordinate space
  const rotGroup = clone.querySelector('g[transform^="rotate"]') as SVGGElement | null;
  const panGroup = rotGroup?.querySelector('g[transform^="translate"]') as SVGGElement | null;
  if (rotGroup) rotGroup.removeAttribute('transform');
  if (panGroup) panGroup.removeAttribute('transform');

  // Inline CSS vars for export (SVG doesn't inherit CSS vars in canvas)
  clone.style.background = '#F5F6F8';

  // Inline stroke/fill colors by resolving CSS vars
  const style = getComputedStyle(document.documentElement);
  const resolve = (v: string) => style.getPropertyValue(v).trim() || v;

  const svgString = new XMLSerializer()
    .serializeToString(clone)
    .replace(/var\(--color-room-outline\)/g, resolve('--color-room-outline'))
    .replace(/var\(--color-furniture-fill\)/g, resolve('--color-furniture-fill'))
    .replace(/var\(--color-furniture-border\)/g, resolve('--color-furniture-border'))
    .replace(/var\(--color-primary\)/g, resolve('--color-primary'))
    .replace(/var\(--color-secondary[^)]*\)/g, resolve('--color-secondary'))
    .replace(/var\(--color-accent\)/g, resolve('--color-accent'))
    .replace(/var\(--color-surface\)/g, resolve('--color-surface'))
    .replace(/var\(--color-text\)/g, resolve('--color-text'))
    .replace(/var\(--color-text-muted\)/g, resolve('--color-text-muted'))
    .replace(/var\(--color-background\)/g, resolve('--color-background'))
    .replace(/var\(--font-body\)/g, 'Inter, sans-serif')
    .replace(/var\(--font-mono\)/g, 'JetBrains Mono, monospace');

  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = exportW * dpr;
  canvas.height = exportH * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#F5F6F8';
  ctx.fillRect(0, 0, exportW, exportH);
  ctx.drawImage(img, 0, 0, exportW, exportH);

  URL.revokeObjectURL(url);

  const pngUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = pngUrl;
  a.download = 'odaplan-export.png';
  a.click();
}
