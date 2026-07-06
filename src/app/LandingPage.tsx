// Landing hub — full implementation in T-040. Decision IDs: ADR-0006.
// Cards are grouped by OSCAL layer; priority features (component-definitions, SSPs)
// live in the implementation layer.

interface FeatureCard {
  title: string;
  path: string;
  priority?: boolean;
}

interface FeatureGroup {
  layer: string;
  features: FeatureCard[];
}

const GROUPS: FeatureGroup[] = [
  {
    layer: 'Data',
    features: [{ title: 'BSI Library', path: '/library' }],
  },
  {
    layer: 'Control',
    features: [
      { title: 'Catalogs', path: '/catalogs' },
      { title: 'Profiles', path: '/profiles' },
    ],
  },
  {
    layer: 'Implementation',
    features: [
      { title: 'Component-Definitions', path: '/component-definitions', priority: true },
      { title: 'System Security Plans', path: '/ssps', priority: true },
    ],
  },
  {
    layer: 'Assessment',
    features: [
      { title: 'Assessment Plans', path: '/assessment-plans' },
      { title: 'Assessment Results', path: '/assessment-results' },
      { title: 'Plan of Action & Milestones', path: '/poams' },
    ],
  },
];

export function LandingPage() {
  return (
    <main>
      <h1>TALOS</h1>
      <p>Trust and Assessment Lifecycle for Organizational Security</p>
      {GROUPS.map((group) => (
        <section key={group.layer}>
          <h2>{group.layer} Layer</h2>
          <ul>
            {group.features.map((f) => (
              <li key={f.path}>
                <a href={`#${f.path}`}>
                  {f.title}
                  {f.priority ? ' ★' : ''}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
