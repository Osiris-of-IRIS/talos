// Component-definition detail (read view). Decision IDs: ADR-0003, ADR-0009, ADR-0008 (IMPL-001).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArtifactRepository } from '@/data/artifactRepository';
import { downloadArtifact } from '@/data/fileIo';
import { Markup } from '@/shared/Markup';
import { ControlDisplay } from '@/features/shared/ControlDisplay';
import { useCatalogIndex } from '@/features/shared/useCatalogIndex';
import { resolveControl } from '@/data/catalogResolution';
import { viewerHref } from '@/config';
import type { StoredArtifact } from '@/data/db';
import type { ComponentDefinition } from '@/models/componentDefinition';

export function ComponentDefinitionDetailPage() {
  const { uuid = '' } = useParams();
  const catalogIndex = useCatalogIndex();
  const [record, setRecord] = useState<StoredArtifact<ComponentDefinition> | null | undefined>(undefined);
  const [exportError, setExportError] = useState<string | null>(null);

  function onDownload(r: StoredArtifact<ComponentDefinition>) {
    try {
      setExportError(null);
      downloadArtifact(r);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let active = true;
    void ArtifactRepository.forType<ComponentDefinition>('componentDefinition')
      .get(uuid)
      .then((r) => {
        if (active) setRecord(r ?? null);
      });
    return () => {
      active = false;
    };
  }, [uuid]);

  if (record === undefined) return <main>Loading…</main>;
  if (record === null) {
    return (
      <main>
        <p>
          <Link to="/component-definitions">← Component-Definitions</Link>
        </p>
        <p role="alert" data-testid="compdef-not-found">Component-definition not found.</p>
      </main>
    );
  }

  const cd = record.artifact;
  return (
    <main data-testid="compdef-detail">
      <p>
        <Link to="/component-definitions">← Component-Definitions</Link>
      </p>
      <h1>
        🧩 <Markup value={cd.metadata.title} />
      </h1>
      <p>
        <small>
          uuid {record.uuid} · v{cd.metadata.version} · OSCAL {cd.metadata.oscalVersion} · {record.origin}
        </small>
      </p>
      {record.origin !== 'library' && (
        <Link to={`/component-definitions/${record.uuid}/edit`} data-testid="compdef-edit">
          ✎ Edit
        </Link>
      )}{' '}
      <button type="button" onClick={() => onDownload(record)}>
        ⭳ Download OSCAL
      </button>
      {exportError && (
        <p role="alert" data-testid="compdef-export-error" style={{ color: 'var(--color-error, #cf222e)' }}>
          ⚠️ {exportError}
        </p>
      )}

      <h2>Components ({cd.components?.length ?? 0})</h2>
      {cd.components?.map((c) => (
        <section key={c.uuid} data-testid="compdef-component">
          <h3>
            <Markup value={c.title} /> <small>[{c.type}]</small>
          </h3>
          <Markup value={c.description} multiline />
          {c.controlImplementations?.map((ci) => (
            <div key={ci.uuid}>
              <h4>Control implementation</h4>
              <Markup value={ci.description} multiline />
              <ul>
                {ci.implementedRequirements.map((ir) => (
                  <li key={ir.uuid} data-testid="compdef-requirement">
                    {(() => {
                      const resolved = catalogIndex ? resolveControl(catalogIndex, ir.controlId) : undefined;
                      return resolved ? (
                        <ControlDisplay
                          control={resolved.control}
                          setParameters={ir.setParameters}
                          viewerUrl={viewerHref(resolved.catalogLibraryPath)}
                        />
                      ) : (
                        <code data-testid="compdef-requirement-unresolved">{ir.controlId}</code>
                      );
                    })()}
                    {ir.description ? (
                      <>
                        {' — '}
                        <Markup value={ir.description} />
                      </>
                    ) : null}
                    {ir.setParameters && ir.setParameters.length > 0 && (
                      <ul data-testid="compdef-set-parameters">
                        {ir.setParameters.map((sp) => (
                          <li key={sp.paramId}>
                            λ <code>{sp.paramId}</code> = {(sp.values ?? []).join(', ') || '—'}
                          </li>
                        ))}
                      </ul>
                    )}
                    {ir.remarks ? (
                      <div data-testid="compdef-requirement-remarks">
                        <small>📝 <Markup value={ir.remarks} /></small>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
