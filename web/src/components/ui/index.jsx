import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './ui.css';

export const Container = ({ children, className = '' }) => (
  <div className={`container ${className}`}>{children}</div>
);

export const Section = ({ children, altBg, className = '' }) => (
  <section className={`section ${altBg ? 'section-alt' : ''} ${className}`}>
    {children}
  </section>
);

export const Button = ({ variant = 'primary', className = '', children, ...props }) => {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Card = ({ children, className = '', ...props }) => (
  <div className={`card ${className}`} {...props}>{children}</div>
);

export const Badge = ({ children, variant = 'neutral', className = '' }) => (
  <span className={`badge badge-${variant} ${className}`}>{children}</span>
);

export const Skeleton = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} />
);

export const Accordion = ({ items = [] }) => {
  const [openIndex, setOpenIndex] = useState(null);
  
  return (
    <div className="accordion">
      {items.map((item, i) => (
        <div key={i} className={`accordion-item ${openIndex === i ? 'open' : ''}`}>
          <button 
            className="accordion-header"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span>{item.title}</span>
            <ChevronDown className={`accordion-icon ${openIndex === i ? 'rotate' : ''}`} size={20} strokeWidth={1.75} />
          </button>
          <div className="accordion-content-wrapper" style={{ height: openIndex === i ? 'auto' : 0 }}>
            <div className="accordion-content">
              {item.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const Reveal = ({ children, delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref} 
      className={`reveal ${isVisible ? 'visible' : ''}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

