import React from 'react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Clock, FileSpreadsheet } from 'lucide-react';

interface PlaceholderViewProps {
  moduleName: string;
  targetPhase: string;
  description: string;
  plannedFeatures: string[];
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  moduleName,
  targetPhase,
  description,
  plannedFeatures,
}) => {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900">{moduleName}</h1>
            <Badge variant="warning">{targetPhase}</Badge>
          </div>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>

      <Card>
        <div className="text-center py-12 px-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-2">
            Module Scheduled for {targetPhase}
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto mb-6 leading-relaxed">
            Per the system specification, business modules are built strictly sequentially on top of the verified Phase 1 foundation. No mock data or placeholder test values are fabricated.
          </p>

          <div className="max-w-md mx-auto text-left bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Planned Architectural Deliverables
            </h4>
            <ul className="space-y-2">
              {plannedFeatures.map((feat, idx) => (
                <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

