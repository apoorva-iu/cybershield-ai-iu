import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function ToolCard({ tool, isUpcoming = false }) {
  const Icon = tool.Icon;

  if (isUpcoming) {
    return (
      <div className="tool-card tool-card-upcoming" role="region" aria-label={tool.name}>
        <div className="tool-card-top">
          <div className="tool-icon-square" aria-hidden="true">
            {Icon && <Icon size={24} strokeWidth={1.75} />}
          </div>
          <span className="tool-badge-upcoming">Coming soon</span>
        </div>
        <div className="tool-card-body">
          <h3 className="tool-card-title">{tool.name}</h3>
          <p className="tool-card-line">{tool.line}</p>
        </div>
      </div>
    );
  }

  return (
    <Link to={tool.href} className="tool-card tool-card-link" aria-label={`${tool.name}: ${tool.line}`}>
      <div className="tool-card-top">
        <div className="tool-icon-square" aria-hidden="true">
          {Icon && <Icon size={26} strokeWidth={1.75} />}
        </div>
      </div>
      <div className="tool-card-body">
        <h3 className="tool-card-title">{tool.name}</h3>
        <p className="tool-card-line">{tool.line}</p>
      </div>
      <div className="tool-card-action" aria-hidden="true">
        <span className="tool-card-action-text">Start screening</span>
        <span className="tool-card-action-pill">
          <ArrowRight size={15} className="tool-card-arrow" />
        </span>
      </div>
    </Link>
  );
}

export default ToolCard;

