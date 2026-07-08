// SSP editor (create + edit). Decision IDs: ADR-0003, ADR-0017, ADR-0019, ADR-0023 (feature IMPL-002, T-111).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { BackMatterEditor } from '@/features/shared/BackMatterEditor';
import { CollapsibleSection } from '@/shared/CollapsibleSection';
import { useExpandedSet } from '@/shared/useExpandedSet';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { useWorkspaceComponentDefinitions } from './useWorkspaceComponentDefinitions';
import { SystemCharacteristicsEditor } from './SystemCharacteristicsEditor';
import { SystemImplementationEditor } from './SystemImplementationEditor';
import { SspControlImplementationEditor } from './SspControlImplementationEditor';
import { createBlankSsp } from './blank';
import { useI18n } from '@/shared/i18n';
import type { SystemSecurityPlan } from '@/models/ssp';

const repo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');

const SECTION_IDS = ['characteristics', 'implementation', 'control-impl'] as const;

export function SspEditorPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const catalogIndex = useCatalogIndex();
  const workspaceComponentDefs = useWorkspaceComponentDefinitions();
  const isNew = !uuid;
  const [draft, setDraft] = useState<SystemSecurityPlan | null>(isNew ? createBlankSsp() : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  // SSPs can be large (supervisor note): sections default-collapsed for an existing/loaded SSP,
  // but auto-expanded for a brand-new one so authoring can start immediately.
  const sections = useExpandedSet(isNew ? SECTION_IDS : []);

  useEffect(() => {
    if (isNew || !uuid) return;
    let active = true;
    void repo()
      .get(uuid)
      .then((r) => {
        if (!active) return;
        if (r) setDraft(r.artifact);
        else setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [uuid, isNew]);

  if (notFound) {
    return (
      <main>
        <p>
          <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
        </p>
        <p role="alert">{t('ssp_not_found')}</p>
      </main>
    );
  }
  if (!draft) return <main>{t('common_loading')}</main>;

  function update(next: SystemSecurityPlan) {
    setDraft(next);
  }

  function removeByComponentsReferencing(componentUuid: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      for (const ir of next.controlImplementation.implementedRequirements) {
        ir.byComponents = (ir.byComponents ?? []).filter((bc) => bc.componentUuid !== componentUuid);
      }
      return next;
    });
  }

  async function save() {
    const current = draft;
    if (!current || !current.metadata.title.trim()) return;
    setSaving(true);
    try {
      const toSave = structuredClone(current);
      toSave.metadata.lastModified = new Date().toISOString();
      if (isNew) {
        await repo().create({
          uuid: toSave.uuid,
          type: 'systemSecurityPlan',
          origin: 'user',
          artifact: toSave,
        });
      } else {
        await repo().update(toSave.uuid, toSave);
      }
      navigate(`/ssps/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main data-testid="ssp-editor">
      <p>
        <Link to="/ssps">← {t('landing_feature_ssps')}</Link>
      </p>
      <h1>{isNew ? `➕ ${t('ssp_new')}` : `✎ ${t('ssp_edit_heading')}`}</h1>

      <MetadataEditor artifact={draft} onChange={update} />

      <CollapsibleSection
        testId="ssp-section-characteristics"
        isOpen={sections.isExpanded('characteristics')}
        onToggle={() => sections.toggle('characteristics')}
        summary={t('ssp_system_characteristics_heading')}
      >
        <SystemCharacteristicsEditor
          value={draft.systemCharacteristics}
          onChange={(sc) => update({ ...draft, systemCharacteristics: sc })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-implementation"
        isOpen={sections.isExpanded('implementation')}
        onToggle={() => sections.toggle('implementation')}
        summary={t('ssp_system_implementation_heading')}
      >
        <SystemImplementationEditor
          value={draft.systemImplementation}
          onChange={(si) => update({ ...draft, systemImplementation: si })}
          onComponentRemoved={removeByComponentsReferencing}
          workspaceComponentDefs={workspaceComponentDefs}
        />
      </CollapsibleSection>

      <CollapsibleSection
        testId="ssp-section-control-impl"
        isOpen={sections.isExpanded('control-impl')}
        onToggle={() => sections.toggle('control-impl')}
        summary={t('ci_heading_ssp', { count: draft.controlImplementation.implementedRequirements.length })}
      >
        <SspControlImplementationEditor
          value={draft.controlImplementation}
          onChange={(ci) => update({ ...draft, controlImplementation: ci })}
          systemComponents={draft.systemImplementation.components}
          catalogIndex={catalogIndex}
        />
      </CollapsibleSection>

      <BackMatterEditor artifact={draft} onChange={update} />

      <div>
        <button type="button" data-testid="save-ssp" onClick={() => void save()} disabled={saving}>
          💾 {t('common_save')}
        </button>{' '}
        {!draft.metadata.title.trim() && <small>{t('cdef_title_required')}</small>}
      </div>
    </main>
  );
}
