import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, CalendarDays, Database, Gamepad2, Globe2, HardDrive, MessageSquareText, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import './styles.css';

function App() {
  const [steam, setSteam] = useState(null);
  const [steamError, setSteamError] = useState(null);

  useEffect(() => {
    fetch('/api/v1/steam/metadata')
      .then((response) => {
        if (!response.ok) throw new Error(`Steam metadata request failed (${response.status})`);
        return response.json();
      })
      .then(setSteam)
      .catch((error) => setSteamError(error.message));
  }, []);

  const nav = [
    ['Overview', Activity],
    ['Server', Gamepad2],
    ['Schedule', CalendarDays],
    ['Webhooks', MessageSquareText],
    ['Wiki', Globe2],
    ['Backups', HardDrive],
    ['Settings', Settings2]
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <strong>King's</strong>
            <span>Palworld Manager</span>
          </div>
        </div>

        <nav>
          {nav.map(([label, Icon], index) => (
            <button key={label} className={index === 0 ? 'nav-item active' : 'nav-item'}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="security-card">
          <ShieldCheck size={18} />
          <div>
            <strong>Local management</strong>
            <span>Bound to loopback by default</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">SELF-HOSTED CONTROL PLANE</p>
            <h1>Server overview</h1>
          </div>
          <div className="status-pill"><span className="dot" /> Foundation online</div>
        </header>

        <section className="hero-card">
          {steam?.headerImage && <img src={steam.headerImage} alt="Palworld" className="hero-image" />}
          <div className="hero-overlay" />
          <div className="hero-content">
            <span className="chip">Steam App {steam?.appId ?? '1623730'}</span>
            <h2>{steam?.name ?? 'Palworld'}</h2>
            <p>{steam?.shortDescription ?? steamError ?? 'Loading live Steam metadata…'}</p>
            <div className="tag-row">
              {(steam?.genres ?? ['Survival', 'Open World']).slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}
            </div>
          </div>
        </section>

        <section className="metric-grid">
          <Metric title="Server state" value="Foundation" note="Runtime controls next" icon={Gamepad2} />
          <Metric title="Players" value="— / —" note="REST adapter pending" icon={Activity} />
          <Metric title="Scheduled jobs" value="0" note="Durable scheduler planned" icon={CalendarDays} />
          <Metric title="Data layer" value="PostgreSQL" note="Private network only" icon={Database} />
        </section>

        <section className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">OPERATIONS</p>
                <h3>Deployment readiness</h3>
              </div>
              <span className="badge">V1 foundation</span>
            </div>
            <div className="check-list">
              <Check text="Management UI defaults to 127.0.0.1" />
              <Check text="Palworld REST traffic isolated inside Docker" />
              <Check text="Database has no host-published port" />
              <Check text="Frontend dependencies are version pinned" />
              <Check text="Steam metadata normalized server-side" />
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">COMING NEXT</p>
                <h3>Core modules</h3>
              </div>
            </div>
            <div className="module-list">
              <Module name="Server control adapter" state="Next" />
              <Module name="Configuration validation" state="Next" />
              <Module name="Calendar scheduler" state="Queued" />
              <Module name="Wiki + webhook renderer" state="Queued" />
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function Metric({ title, value, note, icon: Icon }) {
  return <article className="metric"><div className="metric-icon"><Icon size={18} /></div><span>{title}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Check({ text }) {
  return <div className="check"><span>✓</span>{text}</div>;
}

function Module({ name, state }) {
  return <div className="module"><span>{name}</span><strong>{state}</strong></div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
