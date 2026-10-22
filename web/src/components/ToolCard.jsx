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
          {Icon && <Icon size={24} strokeWidth={1.75} />}
        </div>
        {tool.badge && (
          <span className="tool-badge-new">{tool.badge}</span>
        )}
      </div>
      <div className="tool-card-body">
        <div className="tool-card-title-row">
          <h3 className="tool-card-title">{tool.name}</h3>
          <ArrowRight size={16} className="tool-card-arrow" aria-hidden="true" />
        </div>
        <p className="tool-card-line">{tool.line}</p>
      </div>
    </Link>
  );
}

export default ToolCard;

