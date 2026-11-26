import type { TKey } from '@/lib/i18n';

/** 8 màu cố định cho Area (4 màu đầu lấy từ token Dark của spec 4.5). */
export const AREA_COLORS: readonly { hex: string; name: TKey }[] = [
  { hex: '#A08BDF', name: 'areas.color.violet' },
  { hex: '#63BB91', name: 'areas.color.green' },
  { hex: '#EAB75C', name: 'areas.color.amber' },
  { hex: '#E57373', name: 'areas.color.red' },
  { hex: '#5B9BD5', name: 'areas.color.blue' },
  { hex: '#4DB6AC', name: 'areas.color.teal' },
  { hex: '#E57BB0', name: 'areas.color.pink' },
  { hex: '#9598A5', name: 'areas.color.gray' },
];
