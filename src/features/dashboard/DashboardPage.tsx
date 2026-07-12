// Management Dashboard (ADR-0034, ADR-0035, mission §C). Control Coverage + Risk Coverage are
// live; Assessment State renders as a disabled "coming soon" placeholder until T-402 lands —
// same treatment T-040 gave not-yet-built landing features.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, PieChart, Pie, Legend } from 'recharts';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { useSspsStore } from '@/features/ssps/store';
import { useCatalogsStore } from '@/features/catalogs/store';
import { CollapsibleSection } from '@/shared/CollapsibleSection';
import { loadThreatCatalog } from '@/data/threatCatalogLoader';
import type { ThreatCatalogEntry } from '@/models/threatCatalog';
import { computeControlCoverage, COVERAGE_BUCKETS, type CoverageBucket } from './controlCoverage';
import { computeRiskCoverage, RISK_BUCKETS, type RiskBucket } from './riskCoverage';

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

const RISK_BUCKET_LABEL_KEY: Record<RiskBucket, string> = {
  unmapped: 'dashboard_risk_status_unmapped',
  uncovered: 'dashboard_risk_status_uncovered',
  partial: 'dashboard_risk_status_partial',
  baseline: 'dashboard_risk_status_baseline',
  full: 'dashboard_risk_status_full',
};

// Distinct from Control Coverage's palette on purpose (ADR-0035): uncovered is the one true
// "risk exists, nothing addresses it" alarm signal (error/red); unmapped is a data/tooling gap
// ("can't assess this"), not itself a security failure, so it stays neutral muted rather than
// competing with uncovered for the same alarm color.
const RISK_BUCKET_COLOR: Record<RiskBucket, string> = {
  full: 'var(--color-ok)',
  baseline: 'var(--color-catalog)',
  partial: 'var(--color-warning)',
  uncovered: 'var(--color-error)',
  unmapped: 'var(--color-text-muted)',
};

/** Custom Pie label (Recharts' default `label` renderer needs an explicit fill to stay readable
 * in the dark theme, and explicit positioning to keep the value clear of the slice itself —
 * standard "labelled pie slice" geometry: place the text just outside outerRadius, along the
 * slice's midpoint angle. */
function renderPieValueLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  value?: number;
}) {
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const midAngle = props.midAngle ?? 0;
  const outerRadius = props.outerRadius ?? 0;
  const value = props.value ?? 0;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="var(--color-text)" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {value}
    </text>
  );
}

function ComingSoonTile({ testId, title }: { testId: string; title: string }) {
  return (
    <div className="dashboard-placeholder" data-testid={testId} aria-disabled="true" title={title}>
      {title}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { items: ssps, loading: sspsLoading, load: loadSsps } = useSspsStore();
  const { items: catalogs, load: loadCatalogs } = useCatalogsStore();
  const [threats, setThreats] = useState<ThreatCatalogEntry[]>([]);
  const [controlBySspOpen, setControlBySspOpen] = useState(false);
  const [riskBySspOpen, setRiskBySspOpen] = useState(false);

  useEffect(() => {
    void loadSsps();
    void loadCatalogs();
  }, [loadSsps, loadCatalogs]);

  useEffect(() => {
    void loadThreatCatalog().then((loaded) => {
      setThreats(loaded.rows);
      if (loaded.warning) showToast(loaded.warning, 'warning');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const comingSoon = t('landing_coming_soon_title');

  const coverage = computeControlCoverage(ssps);
  const totalsChartData = COVERAGE_BUCKETS.map((bucket) => ({
    bucket,
    label: t(BUCKET_LABEL_KEY[bucket]),
    value: coverage.workspaceTotals[bucket],
  }));

  const riskCoverage = computeRiskCoverage(threats, catalogs, ssps);
  const riskChartData = RISK_BUCKETS.map((bucket) => ({
    bucket,
    label: t(RISK_BUCKET_LABEL_KEY[bucket]),
    value: Math.round(riskCoverage.workspaceAverages[bucket] * 10) / 10,
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

        {sspsLoading && <p>{t('common_loading')}</p>}

        {!sspsLoading && ssps.length === 0 && <p data-testid="dashboard-risk-empty-state">📂 {t('ssp_empty')}</p>}

        {!sspsLoading && ssps.length > 0 && (
          <>
            <h3>{t('dashboard_risk_totals_heading')}</h3>
            <div
              role="img"
              aria-label={t('dashboard_risk_chart_aria')}
              style={{ width: '100%', height: 300 }}
              data-testid="dashboard-risk-chart"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={260}>
                <PieChart margin={{ top: 20, bottom: 20, left: 40, right: 40 }}>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={riskChartData}
                    dataKey="value"
                    nameKey="label"
                    outerRadius="60%"
                    label={renderPieValueLabel}
                    labelLine
                    isAnimationActive={false}
                  >
                    {riskChartData.map((d) => (
                      <Cell key={d.bucket} fill={RISK_BUCKET_COLOR[d.bucket]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <CollapsibleSection
              testId="dashboard-risk-by-ssp"
              isOpen={riskBySspOpen}
              onToggle={() => setRiskBySspOpen((open) => !open)}
              summary={t('dashboard_risk_by_ssp_heading')}
            >
              <table data-testid="dashboard-risk-table">
                <thead>
                  <tr>
                    <th>{t('dashboard_table_col_ssp')}</th>
                    {RISK_BUCKETS.map((bucket) => (
                      <th key={bucket}>{t(RISK_BUCKET_LABEL_KEY[bucket])}</th>
                    ))}
                    <th>{t('dashboard_table_col_total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {riskCoverage.bySsp.map((row) => (
                    <tr key={row.uuid} data-testid={`dashboard-risk-row-${row.uuid}`}>
                      <td>{row.title}</td>
                      {RISK_BUCKETS.map((bucket) => (
                        <td key={bucket}>{row.counts[bucket]}</td>
                      ))}
                      <td>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CollapsibleSection>
          </>
        )}
      </section>

      <section>
        <h2>{t('dashboard_control_heading')}</h2>
        <p>{t('dashboard_control_desc')}</p>

        {sspsLoading && <p>{t('common_loading')}</p>}

        {!sspsLoading && ssps.length === 0 && <p data-testid="dashboard-control-empty">📂 {t('ssp_empty')}</p>}

        {!sspsLoading && ssps.length > 0 && (
          <>
            <h3>{t('dashboard_control_totals_heading')}</h3>
            <div
              role="img"
              aria-label={t('dashboard_chart_totals_aria')}
              style={{ width: '100%', height: 220 }}
              data-testid="dashboard-totals-chart"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={180}>
                <BarChart data={totalsChartData} layout="vertical" margin={{ left: 24, right: 24 }}>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={110} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {totalsChartData.map((d) => (
                      <Cell key={d.bucket} fill={BUCKET_COLOR[d.bucket]} />
                    ))}
                    <LabelList dataKey="value" position="right" fill="var(--color-text)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <CollapsibleSection
              testId="dashboard-control-by-ssp"
              isOpen={controlBySspOpen}
              onToggle={() => setControlBySspOpen((open) => !open)}
              summary={t('dashboard_control_by_ssp_heading')}
            >
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
            </CollapsibleSection>
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
