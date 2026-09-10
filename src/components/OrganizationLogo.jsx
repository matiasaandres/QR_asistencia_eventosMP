import React, { useState } from 'react';
import { Building2 } from 'lucide-react';

export default function OrganizationLogo({ organization, className = '', iconClassName = 'h-6 w-6', inverse = false }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = organization?.logoUrl;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden ${inverse ? 'bg-white/95' : 'bg-white'} ${className}`}
      style={{ borderColor: organization?.primaryColor || undefined }}
      aria-label={`Logo de ${organization?.name || 'la escuela'}`}
    >
      {logoUrl && !failed ? (
        <img src={logoUrl} alt={`Logo de ${organization?.name || 'la escuela'}`} className="h-full w-full object-contain p-1" onError={() => setFailed(true)} />
      ) : (
        <Building2 className={iconClassName} style={{ color: organization?.primaryColor || '#0284c7' }} aria-hidden="true" />
      )}
    </div>
  );
}
