// Management Dashboard (ADR-0034, mission §C). Control Coverage is live; Risk Coverage and
// Assessment State render as disabled "coming soon" placeholders until T-400/T-402 land — same
// treatment T-040 gave not-yet-built landing features.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useI18n } from '@/shared/i18n';
import { useSspsStore } from '@/features/ssps/store';
import { computeControlCoverage, COVERAGE_BUCKETS, type CoverageBucket } from './controlCoverage';

const BUCKET_LABEL_KEY: Record<CoverageBucket, string> = {
  unspecified: 'dashboard_status_unspecified',
  planned: 'implementation_status_planned',
  alternative: 'implementation_status_alternative',
  partial: 'implementation_status_partial',
  implemented: 'implementation_status_implemented',
  'not-applicable': 'implementation_status_not-applicable',
};

// Reuses existing ADR-0010 tokens rather than introducing new raw colors (ADR-0034): implemented
// = ok, partial = warning, alternative = the muted implementation-domain accent (a compensating
// measure, not the literal control), planned = neutral bronze (acknowledged, not yet protecting),
// not-applicable = neutral muted text (excluded, neither good nor bad), unspecified = error (a
// real data gap worth flagging).
const BUCKET_COLOR: Record<CoverageBucket, string> = {
  implemented: 'var(--color-ok)',
  partial: 'var(--color-warning)',
  alternative: 'var(--color-impl-muted)',
  planned: 'var(--color-accent-bronze)',
  'not-applicable': 'var(--color-text-muted)',
  unspecified: 'var(--color-error)',
};

function ComingSoonTile({ testId, title }: { testId: string; title: string }) {
  return (
    <div className="dashboard-placeholder" data-testid={testId} aria-disabled="true" title={title}>
      {title}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const { items, loading, load } = useSspsStore();

  useEffect(() => {
    void load();
  }, [load]);

  const comingSoon = t('landing_coming_soon_title');
  const coverage = computeControlCoverage(items);
  const totalsChartData = COVERAGE_BUCKETS.map((bucket) => ({
    bucket,
    label: t(BUCKET_LABEL_KEY[bucket]),
    value: coverage.workspaceTotals[bucket],
  }));

  return (
    <main data-testid="dashboard-page">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>📊 {t('dashboard_heading')}</h1>
      <p>{t('dashboard_intro')}</p>

      <section>
        <h2>{t('dashboard_risk_heading')}</h2>
        <p>{t('dashboard_risk_desc')}</p>
        <ComingSoonTile testId="dashboard-risk-empty" title={comingSoon} />
      </section>

      <section>
        <h2>{t('dashboard_control_heading')}</h2>
        <p>{t('dashboard_control_desc')}</p>

        {loading && <p>{t('common_loading')}</p>}

        {!loading && items.length === 0 && <p data-testid="dashboard-control-empty">📂 {t('ssp_empty')}</p>}

        {!loading && items.length > 0 && (
          <>
            <h3>{t('dashboard_control_totals_heading')}</h3>
            <div
              role="img"
              aria-label={t('dashboard_chart_totals_aria')}
              style={{ width: '100%', height: 220 }}
              data-testid="dashboard-totals-chart"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={180}>
                <BarChart data={totalsChartData} layout="vertical" margin={{ left: 24 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {totalsChartData.map((d) => (
                      <Cell key={d.bucket} fill={BUCKET_COLOR[d.bucket]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <dl data-testid="dashboard-totals-summary">
              {totalsChartData.map((d) => (
                <div key={d.bucket}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>

            <h3>{t('dashboard_control_by_ssp_heading')}</h3>
            <table data-testid="dashboard-control-table">
              <thead>
                <tr>
                  <th>{t('dashboard_table_col_ssp')}</th>
                  {COVERAGE_BUCKETS.map((bucket) => (
                    <th key={bucket}>{t(BUCKET_LABEL_KEY[bucket])}</th>
                  ))}
                  <th>{t('dashboard_table_col_total')}</th>
                </tr>
              </thead>
              <tbody>
                {coverage.bySsp.map((row) => (
                  <tr key={row.uuid} data-testid={`dashboard-control-row-${row.uuid}`}>
                    <td>{row.title}</td>
                    {COVERAGE_BUCKETS.map((bucket) => (
                      <td key={bucket}>{row.counts[bucket]}</td>
                    ))}
                    <td>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h2>{t('dashboard_assessment_heading')}</h2>
        <p>{t('dashboard_assessment_desc')}</p>
        <ComingSoonTile testId="dashboard-assessment-empty" title={comingSoon} />
      </section>
    </main>
  );
}
