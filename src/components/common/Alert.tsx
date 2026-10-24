import React from 'react';
import { cn } from '../../lib/utils';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  className,
}) => {
  const styles = {
    info: 'bg-sky-50 text-sky-900 border-sky-200 icon-sky',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200 icon-emerald',
    warning: 'bg-amber-50 text-amber-900 border-amber-200 icon-amber',
    error: 'bg-rose-50 text-rose-900 border-rose-200 icon-rose',
  };

  const icons = {
    info: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
  };

  return (
    <div
      className={cn(
        'flex gap-3 p-3.5 rounded-lg border text-sm',
        styles[type],
        className
      )}
    >
      {icons[type]}
      <div className="flex-1">
        {title && <h5 className="font-semibold mb-0.5 leading-tight">{title}</h5>}
        <div className="text-xs leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
};

