// Component-definition editor (create + edit). Decision IDs: ADR-0003, ADR-0015 (feature IMPL-001, T-101).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { MetadataEditor } from '@/features/shared/MetadataEditor';
import { BackMatterEditor } from '@/features/shared/BackMatterEditor';
import { ControlImplementationsEditor } from './ControlImplementationsEditor';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { createBlankComponentDefinition } from './blank';
import { COMPONENT_TYPES } from '@/models/componentTypes';
import type { ComponentDefinition, DefinedComponent } from '@/models/componentDefinition';

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

export function ComponentDefinitionEditorPage() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const catalogIndex = useCatalogIndex();
  const isNew = !uuid;
  const [draft, setDraft] = useState<ComponentDefinition | null>(isNew ? createBlankComponentDefinition() : null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

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
          <Link to="/component-definitions">← Component-Definitions</Link>
        </p>
        <p role="alert">Component-definition not found.</p>
      </main>
    );
  }
  if (!draft) return <main>Loading…</main>;

  function update(next: ComponentDefinition) {
    setDraft(next);
  }

  function addComponent() {
    const next = structuredClone(draft!);
    const c: DefinedComponent = {
      uuid: globalThis.crypto.randomUUID(),
      type: 'software',
      title: 'New component',
      description: '',
    };
    (next.components ??= []).push(c);
    setDraft(next);
  }

  function patchComponent(idx: number, mutator: (c: DefinedComponent) => void) {
    const next = structuredClone(draft!);
    mutator(next.components![idx]!);
    setDraft(next);
  }

  function removeComponent(idx: number) {
    const next = structuredClone(draft!);
    next.components!.splice(idx, 1);
    setDraft(next);
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
          type: 'componentDefinition',
          origin: 'user',
          artifact: toSave,
        });
      } else {
        await repo().update(toSave.uuid, toSave);
      }
      navigate(`/component-definitions/${toSave.uuid}`);
    } finally {
      setSaving(false);
    }
  }

  const components = draft.components ?? [];

  return (
    <main data-testid="compdef-editor">
      <p>
        <Link to="/component-definitions">← Component-Definitions</Link>
      </p>
      <h1>{isNew ? '➕ New component-definition' : '✎ Edit component-definition'}</h1>

      <MetadataEditor artifact={draft} onChange={update} />
      <BackMatterEditor artifact={draft} onChange={update} />

      <fieldset>
        <legend>Components ({components.length})</legend>
        <datalist id="component-type-options">
          {COMPONENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.description}
            </option>
          ))}
        </datalist>
        {components.map((c, i) => (
          <div key={c.uuid} data-testid="compdef-edit-component">
            <label>
              Title
              <input
                aria-label="Component title"
                data-testid="component-title"
                value={c.title}
                onChange={(e) => patchComponent(i, (cc) => (cc.title = e.target.value))}
              />
            </label>
            <label>
              Type (pick a standard value or type a custom one)
              <input
                aria-label="Component type"
                data-testid="component-type"
                list="component-type-options"
                value={c.type}
                onChange={(e) => patchComponent(i, (cc) => (cc.type = e.target.value))}
              />
            </label>
            <label>
              Description
              <textarea
                aria-label="Component description"
                value={c.description}
                onChange={(e) => patchComponent(i, (cc) => (cc.description = e.target.value))}
              />
            </label>
            <ControlImplementationsEditor
              value={c}
              onChange={(next) => patchComponent(i, (cc) => Object.assign(cc, next))}
              catalogIndex={catalogIndex}
            />
            <button type="button" aria-label={`Remove component ${c.title}`} onClick={() => removeComponent(i)}>
              🗑️ Remove component
            </button>
          </div>
        ))}
        <button type="button" data-testid="add-component" onClick={addComponent}>
          ➕ Add component
        </button>
      </fieldset>

      <div>
        <button type="button" data-testid="save-compdef" onClick={() => void save()} disabled={saving}>
          💾 Save
        </button>{' '}
        {!draft.metadata.title.trim() && <small>Title is required to save.</small>}
      </div>
    </main>
  );
}
