import {
  pointerWithin,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { GateKind } from '../circuit/gates';
import type { Translate } from '../i18n/i18n';

export type DragData =
  | { source: 'palette'; kind: GateKind }
  | { source: 'circuit'; kind: GateKind; column: number; index: number; qubit: number };

export interface DropData {
  column: number;
  qubit: number;
}

export const cellId = (column: number, qubit: number) => `cell:${column}:${qubit}`;

/** Keyboard drags have no pointer, so the dragged gate's center stands in for it. */
export const collisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return pointerWithin(args);
  const { left, top, width, height } = args.collisionRect;
  return pointerWithin({ ...args, pointerCoordinates: { x: left + width / 2, y: top + height / 2 } });
};

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/**
 * Arrow keys jump the dragged gate to the next circuit cell in that direction instead of moving it
 * by pixels. A gate that isn't over the circuit yet (just picked up from the palette) goes to the
 * top-left cell first.
 */
export const gridKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = DIRECTIONS[event.code];
  const { collisionRect, droppableRects, droppableContainers, over } = context;
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();

  const [dx, dy] = direction;
  const from = { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 };
  let best: { x: number; y: number; score: number } | null = null;

  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    let score: number;
    if (over) {
      const along = (x - from.x) * dx + (y - from.y) * dy;
      if (along < 1) continue;
      const across = Math.abs((x - from.x) * dy) + Math.abs((y - from.y) * dx);
      score = along + across * 4;
    } else {
      score = rect.top * 1e4 + rect.left;
    }
    if (!best || score < best.score) best = { x, y, score };
  }

  if (!best) return undefined;
  return { x: best.x - collisionRect.width / 2, y: best.y - collisionRect.height / 2 };
};

export function announcements(t: Translate, describeCell: (cell: DropData) => string): Announcements {
  const gate = (data: unknown) => t(`gate.${(data as DragData).kind}.name`);
  const cell = (data: unknown) => describeCell(data as DropData);
  return {
    onDragStart: ({ active }) => t('dnd.pickedUp', { gate: gate(active.data.current) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('dnd.over', { gate: gate(active.data.current), cell: cell(over.data.current) })
        : t('dnd.notOver', { gate: gate(active.data.current) }),
    onDragEnd: ({ active, over }) =>
      over
        ? t('dnd.dropped', { gate: gate(active.data.current), cell: cell(over.data.current) })
        : t('dnd.cancelled', { gate: gate(active.data.current) }),
    onDragCancel: ({ active }) => t('dnd.cancelled', { gate: gate(active.data.current) }),
  };
}
