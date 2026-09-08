import {
  Activity,
  CalendarDays,
  DatabaseBackup,
  Gamepad2,
  Settings,
  Users,
  Webhook
} from "lucide-react";

const navigation = [
  ["Overview", Activity],
  ["Server", Gamepad2],
  ["Players", Users],
  ["Calendar", CalendarDays],
  ["Webhooks", Webhook],
  ["Backups & Saves", DatabaseBackup],
  ["Settings", Settings]
] as const;

export default function App() {
  return (
    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand">
          <div className="brand-mark">K</div>

          <div>
            <strong>King's</strong>
            <span>Palworld Manager</span>
          </div>
        </div>

        <nav>
          {navigation.map(([label, Icon], index) => (
            <button
              className={index === 0 ? "nav-item active" : "nav-item"}
              key={label}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

      </aside>

      <main className="content">

        <header className="page-header">
          <div>
            <p className="eyebrow">SERVER OVERVIEW</p>
            <h1>Palworld Server</h1>
            <p className="subtitle">
              Control, monitor and maintain your world from one place.
            </p>
          </div>

          <div className="status">
            <span className="status-dot" />
            Development
          </div>
        </header>

        <section className="hero-card">

          <div>
            <p className="eyebrow">KING'S PALWORLD MANAGER</p>

            <h2>
              Your server.
              <br />
              Your world.
            </h2>

            <p>
              V1 foundation is ready for Palworld control,
              scheduling, backups, save migration, webhooks,
              wiki content and Steam integration.
            </p>
          </div>

        </section>

        <section className="stats">

          <article>
            <span>Server</span>
            <strong>Not configured</strong>
          </article>

          <article>
            <span>Players</span>
            <strong>— / —</strong>
          </article>

          <article>
            <span>Backups</span>
            <strong>Not configured</strong>
          </article>

          <article>
            <span>Next event</span>
            <strong>None scheduled</strong>
          </article>

        </section>

      </main>

    </div>
  );
}
