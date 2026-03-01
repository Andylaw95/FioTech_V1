import React, { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { clsx } from 'clsx';

const WIDGET_DND_TYPE = 'DASHBOARD_WIDGET';

interface DragItem {
  id: string;
  index: number;
}

interface DraggableWidgetProps {
  id: string;
  index: number;
  moveWidget: (dragIndex: number, hoverIndex: number) => void;
  onDropEnd: () => void;
  children: React.ReactNode;
}

export function DraggableWidget({ id, index, moveWidget, onDropEnd, children }: DraggableWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: WIDGET_DND_TYPE,
    item: (): DragItem => ({ id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      onDropEnd();
    },
  });

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: WIDGET_DND_TYPE,
    hover(item, monitor) {
      if (!ref.current) return;

      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) return;

      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;

      moveWidget(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  preview(drop(ref));

  return (
    <div
      ref={ref}
      className={clsx(
        'relative group/drag transition-all duration-200',
        isDragging && 'opacity-40 scale-[0.98]',
        isOver && canDrop && !isDragging && 'ring-2 ring-blue-400 ring-offset-2 rounded-2xl',
      )}
    >
      {/* Drag Handle — elegant pill at top center */}
      <div
        ref={drag}
        className={clsx(
          'absolute left-1/2 -translate-x-1/2 top-0 -translate-y-1/2 z-10',
          'flex items-center justify-center gap-[3px] px-4 py-1.5 rounded-full',
          'cursor-grab active:cursor-grabbing active:scale-95',
          'opacity-0 group-hover/drag:opacity-100 transition-all duration-300 ease-out',
          'bg-gradient-to-b from-white to-slate-50',
          'border border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
          'hover:shadow-[0_4px_12px_rgba(59,130,246,0.15)] hover:border-blue-300/60',
          'hover:from-blue-50 hover:to-white',
        )}
        title="Drag to reorder"
      >
        {/* Six-dot drag indicator */}
        <div className="grid grid-cols-3 gap-[3px]">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-[3px] w-[3px] rounded-full bg-slate-300 group-hover/drag:bg-blue-400 transition-colors duration-300"
            />
          ))}
        </div>
      </div>

      {/* Drop indicator line */}
      {isOver && canDrop && !isDragging && (
        <div className="absolute -top-2 left-4 right-4 z-20 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
          <div className="flex-1 h-[2px] bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 rounded-full" />
          <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
        </div>
      )}

      {children}
    </div>
  );
}