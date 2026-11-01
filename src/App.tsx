import { useEffect, useState } from 'react';
import { DOMAINS, domainFromHash } from './data';
import DomainView from './DomainView';

export default function App() {
  const [domain, setDomain] = useState(() => domainFromHash(location.hash));

  useEffect(() => {
    const onHashChange = () => setDomain(domainFromHash(location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = `Crimson Chef — ${domain.label}`;
  }, [domain]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          🔥 Crimson Chef
          <span className="subtitle">{domain.subtitle}</span>
        </h1>
        <nav className="tabs" aria-label="Sections">
          {DOMAINS.map((d) => (
            <a
              key={d.id}
              href={`#/${d.id}`}
              className={`tab ${d.id === domain.id ? 'active' : ''}`}
              aria-current={d.id === domain.id ? 'page' : undefined}
            >
              {d.icon} {d.label}
            </a>
          ))}
        </nav>
      </header>

      {/* Keyed so each section keeps its own pouch, filters and blueprint state. */}
      <DomainView key={domain.id} domain={domain} />

      <footer className="app-footer">{domain.text.footer}</footer>
    </div>
  );
}
