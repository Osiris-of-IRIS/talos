// SSP Bootstrap Assistant: generate/update SSPs from an uploaded asset list. Decision IDs: ADR-0026, ADR-0006.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { useAssetsStore } from '@/features/assets/store';
import { useCatalogsStore } from '@/features/catalogs/store';
import { loadTargetObjectCategories } from '@/data/targetObjectCategoryLoader';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import { generateNist } from './generateNist';
import { generateBsi } from './generateBsi';
import { applyBootstrapPlans, type ApplyResult } from './applyPlans';

const ISMS_SYSTEM_NAME = 'ISMS';

type Methodology = 'nist' | 'bsi';

export function BootstrapAssistantPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const { assets, assetTypes, loading: assetsLoading, load: loadAssets } = useAssetsStore();
  const { items: catalogs, loading: catalogsLoading, load: loadCatalogs } = useCatalogsStore();
  const [categoryRows, setCategoryRows] = useState<TargetObjectCategory[]>([]);
  const [catalogUuid, setCatalogUuid] = useState('');
  const [methodology, setMethodology] = useState<Methodology>('nist');
  const [generating, setGenerating] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    void loadAssets();
    void loadCatalogs();
    void loadTargetObjectCategories()
      .then((loaded) => {
        setCategoryRows(loaded.rows);
        if (loaded.warning) showToast(loaded.warning, 'warning');
      })
      .catch((e) => showToast(e instanceof Error ? e.message : String(e), 'error'));
  }, [loadAssets, loadCatalogs, showToast]);

  async function onGenerate() {
    setResult(null);
    const catalogRecord = catalogs.find((c) => c.uuid === catalogUuid);
    if (!catalogRecord) return;

    setGenerating(true);
    try {
      const { plans, warnings: genWarnings } =
        methodology === 'nist'
          ? generateNist({ assets, assetTypes, categoryRows, catalog: catalogRecord.artifact })
          : generateBsi({
              assets,
              assetTypes,
              categoryRows,
              catalog: catalogRecord.artifact,
              ismsSystemName: ISMS_SYSTEM_NAME,
            });
      setWarnings(genWarnings);
      const applied = await applyBootstrapPlans(plans);
      setResult(applied);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setGenerating(false);
    }
  }

  const loading = assetsLoading || catalogsLoading;
  const hasAssets = assets.length > 0;
  const hasCatalogs = catalogs.length > 0;

  return (
    <main data-testid="bootstrap-page">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>🧭 {t('bootstrap_page_heading')}</h1>
      <p>
        <small>{t('bootstrap_intro')}</small>
      </p>

      {loading && <p>{t('common_loading')}</p>}

      {!loading && !hasAssets && (
        <p data-testid="bootstrap-no-assets" role="alert">
          ⚠️ {t('bootstrap_no_assets_hint_pre')} <Link to="/assets">{t('landing_feature_assets')}</Link>
          {t('bootstrap_no_assets_hint_mid')}
        </p>
      )}

      {!loading && hasAssets && !hasCatalogs && (
        <p data-testid="bootstrap-no-catalogs" role="alert">
          ⚠️ {t('bootstrap_no_catalogs_hint_pre')} <Link to="/catalogs">{t('landing_feature_catalogs')}</Link>
          {t('bootstrap_no_catalogs_hint_mid')} <Link to="/library">{t('landing_feature_library')}</Link>.
        </p>
      )}

      {!loading && hasAssets && hasCatalogs && (
        <>
          <fieldset>
            <legend>{t('bootstrap_step_catalog_heading')}</legend>
            <label>
              {t('bootstrap_catalog_label')}
              <select
                data-testid="bootstrap-catalog-select"
                value={catalogUuid}
                onChange={(e) => setCatalogUuid(e.target.value)}
              >
                <option value="">{t('bootstrap_catalog_placeholder')}</option>
                {catalogs.map((c) => (
                  <option key={c.uuid} value={c.uuid}>
                    {c.artifact.metadata.title}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <small>{t('bootstrap_profile_note')}</small>
            </p>
          </fieldset>

          <fieldset>
            <legend>{t('bootstrap_step_methodology_heading')}</legend>
            <label>
              <input
                type="radio"
                name="methodology"
                value="nist"
                checked={methodology === 'nist'}
                onChange={() => setMethodology('nist')}
                data-testid="bootstrap-methodology-nist"
              />{' '}
              {t('bootstrap_methodology_nist_label')}
            </label>
            <p>
              <small>{t('bootstrap_methodology_nist_hint')}</small>
            </p>
            <label>
              <input
                type="radio"
                name="methodology"
                value="bsi"
                checked={methodology === 'bsi'}
                onChange={() => setMethodology('bsi')}
                data-testid="bootstrap-methodology-bsi"
              />{' '}
              {t('bootstrap_methodology_bsi_label')}
            </label>
            <p>
              <small>{t('bootstrap_methodology_bsi_hint')}</small>
            </p>
          </fieldset>

          <button
            type="button"
            disabled={!catalogUuid || generating}
            onClick={() => void onGenerate()}
            data-testid="bootstrap-generate"
          >
            {generating ? t('bootstrap_generating') : t('bootstrap_generate_button')}
          </button>

          {warnings.length > 0 && (
            <div data-testid="bootstrap-warnings">
              <strong>{t('bootstrap_warnings_heading')}</strong>
              <ul>
                {warnings.map((w) => (
                  <li key={w}>⚠️ {w}</li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <p data-testid="bootstrap-result">
              ✅ {t('bootstrap_result_summary', { created: String(result.created), updated: String(result.updated) })}{' '}
              <Link to="/ssps">{t('bootstrap_result_view_link')}</Link>
            </p>
          )}
        </>
      )}
    </main>
  );
}
