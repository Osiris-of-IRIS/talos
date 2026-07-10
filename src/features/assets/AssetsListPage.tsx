// Asset-list upload + overview — the SSP-bootstrap assistant's input data. Decision IDs: ADR-0026, ADR-0027, ADR-0031.
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAssetsStore } from './store';
import { useI18n } from '@/shared/i18n';
import { useToast } from '@/shared/toast';
import { downloadAssetsAsCsv, downloadAssetWorkspaceJson } from '@/data/bulkExport';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

export function AssetsListPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const {
    assets,
    assetTypes,
    loading,
    error,
    warnings,
    selected,
    load,
    importCsvTrio,
    importJson,
    clear,
    toggleSelected,
    selectAll,
    removeMany,
  } = useAssetsStore();
  const typesInput = useRef<HTMLInputElement>(null);
  const assetsInput = useRef<HTMLInputElement>(null);
  const mappingsInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Cross-page deep link (ADR-0031): an SSP detail page's inventory-item links here with
  // ?asset=<id> to jump straight to that one asset instead of re-searching the whole list.
  const assetFilter = searchParams.get('asset');

  useEffect(() => {
    void load();
  }, [load]);

  // Reacts to the store's own error/warnings state (not just this component's own upload calls)
  // so a warning/error set by any caller — including a test driving the store directly — still
  // surfaces. Both fields are freshly-created values whenever the store sets them (a new array,
  // or reset to null/[] first), so this never misses a repeated identical result.
  useEffect(() => {
    if (error) showToast(error, 'error');
  }, [error, showToast]);

  useEffect(() => {
    if (warnings.length > 0) showToast(warnings.join(' '), 'warning');
  }, [warnings, showToast]);

  async function onUpload() {
    const typesFile = typesInput.current?.files?.[0];
    const assetsFile = assetsInput.current?.files?.[0];
    const mappingsFile = mappingsInput.current?.files?.[0];
    if (!typesFile || !assetsFile || !mappingsFile) {
      showToast(t('assets_upload_missing_files'), 'error');
      return;
    }
    try {
      const [typesText, assetsText, mappingsText] = await Promise.all([
        typesFile.text(),
        assetsFile.text(),
        mappingsFile.text(),
      ]);
      await importCsvTrio(typesText, assetsText, mappingsText);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      if (typesInput.current) typesInput.current.value = '';
      if (assetsInput.current) assetsInput.current.value = '';
      if (mappingsInput.current) mappingsInput.current.value = '';
    }
  }

  async function onUploadJson() {
    const file = jsonInput.current?.files?.[0];
    if (!file) {
      showToast(t('assets_upload_missing_files'), 'error');
      return;
    }
    try {
      await importJson(await file.text());
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      if (jsonInput.current) jsonInput.current.value = '';
    }
  }

  function onClear() {
    if (globalThis.confirm(t('assets_clear_confirm'))) {
      void clear();
    }
  }

  function onDownloadSelected() {
    downloadAssetsAsCsv(
      assets.filter((a) => selected.has(a.assetId)),
      `assets-export-${Date.now()}.csv`,
    );
  }

  function onDownloadJson() {
    downloadAssetWorkspaceJson(assetTypes, assets, `asset-workspace-${Date.now()}.json`);
  }

  async function onDeleteSelected() {
    if (!globalThis.confirm(t('bulk_delete_confirm', { count: String(selected.size) }))) return;
    await removeMany([...selected]);
  }

  function showAllAssets() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('asset');
      return next;
    });
  }

  const typesByUuid = new Map(assetTypes.map((at) => [at.uuid, at]));
  const visibleAssets = assetFilter ? assets.filter((a) => a.assetId === assetFilter) : assets;
  const allSelected = visibleAssets.length > 0 && visibleAssets.every((a) => selected.has(a.assetId));

  return (
    <main data-testid="assets-page">
      <p>
        <Link to="/">← {t('app_title')}</Link>
      </p>
      <h1>🗃️ {t('assets_page_heading')}</h1>
      <p>
        <small>{t('assets_upload_hint')}</small>
      </p>

      <fieldset>
        <legend>{t('assets_upload_button')}</legend>
        <p>
          <label>
            {t('assets_upload_types_label')}
            <input ref={typesInput} type="file" accept=".csv,text/csv" data-testid="assets-upload-types" />
          </label>
        </p>
        <p>
          <label>
            {t('assets_upload_assets_label')}
            <input ref={assetsInput} type="file" accept=".csv,text/csv" data-testid="assets-upload-assets" />
          </label>
        </p>
        <p>
          <label>
            {t('assets_upload_mappings_label')}
            <input ref={mappingsInput} type="file" accept=".csv,text/csv" data-testid="assets-upload-mappings" />
          </label>
        </p>
        <button type="button" onClick={() => void onUpload()} data-testid="assets-upload-submit">
          ⭱ {t('assets_upload_button')}
        </button>
      </fieldset>

      <fieldset>
        <legend>{t('assets_upload_json_button')}</legend>
        <p>
          <small>{t('assets_upload_json_hint')}</small>
        </p>
        <p>
          <label>
            {t('assets_upload_json_label')}
            <input ref={jsonInput} type="file" accept=".json,application/json" data-testid="assets-upload-json" />
          </label>
        </p>
        <button type="button" onClick={() => void onUploadJson()} data-testid="assets-upload-json-submit">
          ⭱ {t('assets_upload_json_button')}
        </button>
      </fieldset>

      {loading && <p>{t('common_loading')}</p>}

      {!loading && assets.length === 0 && <p data-testid="assets-empty">📂 {t('assets_empty')}</p>}

      {assets.length > 0 && (
        <>
          <p data-testid="assets-count">
            {t('assets_count', { count: String(assets.length), typeCount: String(assetTypes.length) })}
          </p>
          <button type="button" onClick={onClear} data-testid="assets-clear">
            🗑️ {t('assets_clear_button')}
          </button>{' '}
          <button type="button" onClick={onDownloadJson} data-testid="assets-download-json">
            ⭳ {t('assets_download_json_button')}
          </button>

          {assetFilter && (
            <p role="status" data-testid="assets-filter-banner">
              🔍 {t('assets_filter_showing', { assetId: assetFilter })}{' '}
              <button type="button" onClick={showAllAssets} data-testid="assets-filter-clear">
                {t('assets_filter_show_all')}
              </button>
            </p>
          )}

          <BulkActionsBar
            count={selected.size}
            downloadLabelKey="bulk_download_selected_csv"
            onDownload={onDownloadSelected}
            onDelete={() => void onDeleteSelected()}
            testIdPrefix="assets"
          />

          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => selectAll(visibleAssets.map((a) => a.assetId))}
                    aria-label={t('bulk_select_all')}
                    data-testid="assets-select-all"
                  />
                </th>
                <th>{t('assets_table_col_name')}</th>
                <th>{t('assets_table_col_type')}</th>
                <th>{t('assets_table_col_sensitivity')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((a) => (
                <tr key={a.assetId} data-testid="assets-row">
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(a.assetId)}
                      onChange={() => toggleSelected(a.assetId)}
                      aria-label={t('bulk_select_item', { title: a.name })}
                      data-testid="assets-select-item"
                    />
                  </td>
                  <td>{a.name}</td>
                  <td>{typesByUuid.get(a.assetType)?.title ?? a.assetType}</td>
                  <td>{a.securitySensitivityLevel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
