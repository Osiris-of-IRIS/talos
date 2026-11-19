/**
 * Validate on export (ADR-0040, PO decision backlog #3): a compliant artifact downloads at once; a
 * non-compliant one opens the draft dialog naming every non-compliant field (localized path +
 * reason) and downloads only after "Download as draft"; the ADR-0019 creator rule still blocks.
 * Bulk zip download includes drafts after the same confirmation. Detail and list pages show the
 * compliance status. Every downloaded file carries "$schema".
 * Decision IDs: ADR-0001, ADR-0040, ADR-0019, ADR-0027, ADR-0012.
 * Covers TEST-SCHEMA-07.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { unzipSync, strFromU8 } from 'fflate';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { parseOscalUpload } from '@/data/fileIo';
import { _resetComplianceForTests, getComplianceStats } from '@/data/complianceCheck';
import { ToastProvider } from '@/shared/toast';
import { I18nProvider } from '@/shared/i18n';
import { SspDetailPage } from '@/features/ssps/SspDetailPage';
import { SspListPage } from '@/features/ssps/SspListPage';
import { useSspsStore } from '@/features/ssps/store';
import { createBlankSsp } from '@/features/ssps/blank';
import { OSCAL_SCHEMA_IDS } from '@/models/schemaValidator';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { Metadata } from '@/models/oscalBase';
import sspJson from '../data/ssp-minimal.json';

const repo = () => ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan');

function withCreator(md: Metadata): Metadata {
  return {
    ...md,
    roles: [{ id: 'creator', title: 'Creator' }],
    parties: [
      {
        uuid: '0c0c0c0c-0000-4000-8000-000000000001',
        type: 'person',
        name: 'Erika Mustermann',
        emailAddresses: ['erika@example.org'],
      },
    ],
    responsibleParties: [
      { roleId: 'creator', partyUuids: ['0c0c0c0c-0000-4000-8000-000000000001'] },
    ],
  };
}

async function seedCompliantSsp(): Promise<string> {
  const { record } = parseOscalUpload<SystemSecurityPlan>(JSON.stringify(sspJson));
  record.artifact.metadata = withCreator(record.artifact.metadata);
  await repo().create(record);
  return record.uuid;
}

async function seedDraftSsp(creator = true): Promise<string> {
  const ssp = createBlankSsp();
  ssp.metadata.title = 'Draft SSP';
  if (creator) ssp.metadata = withCreator(ssp.metadata);
  await repo().create({
    uuid: ssp.uuid,
    type: 'systemSecurityPlan',
    origin: 'user',
    artifact: ssp,
  });
  return ssp.uuid;
}

/** jsdom's Blob has no text()/arrayBuffer(); read it through FileReader. */
function readBlob(blob: Blob, as: 'text'): Promise<string>;
function readBlob(blob: Blob, as: 'buffer'): Promise<ArrayBuffer>;
function readBlob(blob: Blob, as: 'text' | 'buffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string | ArrayBuffer);
    r.onerror = () => reject(r.error);
    if (as === 'text') r.readAsText(blob);
    else r.readAsArrayBuffer(blob);
  });
}

/** Capture every Blob handed to a download link. */
let blobs: Blob[] = [];
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  _resetComplianceForTests();
  useSspsStore.setState({ items: [], loading: false, error: null, selected: new Set() });
  blobs = [];
  globalThis.URL.createObjectURL = vi.fn((b: Blob) => {
    blobs.push(b);
    return 'blob:x';
  });
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDetail(uuid: string, language?: 'de' | 'en') {
  const tree = (
    <ToastProvider>
      <MemoryRouter initialEntries={[`/ssps/${uuid}`]}>
        <Routes>
          <Route path="/ssps/:uuid" element={<SspDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
  return render(language ? <I18nProvider language={language}>{tree}</I18nProvider> : tree);
}

describe('single-artifact export', () => {
  it('downloads a compliant SSP directly, with "$schema", and shows it as compliant', async () => {
    const user = userEvent.setup();
    renderDetail(await seedCompliantSsp());
    await screen.findByTestId('ssp-detail');
    await waitFor(() =>
      expect(screen.getByTestId('compliance-badge')).toHaveAttribute('data-status', 'compliant'),
    );
    await user.click(screen.getByTestId('download-artifact'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    const json = JSON.parse(await readBlob(blobs[0]!, 'text')) as Record<string, unknown>;
    expect(json.$schema).toBe(OSCAL_SCHEMA_IDS.systemSecurityPlan);
  });

  it('a non-compliant SSP opens the draft dialog naming every non-compliant field; download only on confirm', async () => {
    const user = userEvent.setup();
    renderDetail(await seedDraftSsp());
    await screen.findByTestId('ssp-detail');
    await waitFor(() =>
      expect(screen.getByTestId('compliance-badge')).toHaveAttribute(
        'data-status',
        'non-compliant',
      ),
    );
    await user.click(screen.getByTestId('download-artifact'));

    const dialog = await screen.findByTestId('export-dialog');
    const items = within(dialog).getAllByTestId('compliance-issue');
    expect(items.map((li) => li.textContent)).toEqual([
      'System characteristics › System name: Must not be empty.',
      'System characteristics › System information › Information types: Required field is missing.',
      'System implementation › Components: Required field is missing.',
      'Control implementation › Implemented requirements: Required field is missing.',
    ]);
    expect(blobs).toHaveLength(0);

    await user.click(within(dialog).getByTestId('export-draft-download'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    const json = JSON.parse(await readBlob(blobs[0]!, 'text')) as Record<string, unknown>;
    expect(json.$schema).toBe(OSCAL_SCHEMA_IDS.systemSecurityPlan);
    expect(getComplianceStats().draftExports).toBe(1);
  });

  it('cancel closes the draft dialog without downloading', async () => {
    const user = userEvent.setup();
    renderDetail(await seedDraftSsp());
    await screen.findByTestId('ssp-detail');
    await user.click(screen.getByTestId('download-artifact'));
    await user.click(await screen.findByTestId('export-cancel'));
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    expect(blobs).toHaveLength(0);
  });

  it('names the fields in German in the German UI', async () => {
    const user = userEvent.setup();
    renderDetail(await seedDraftSsp(), 'de');
    await screen.findByTestId('ssp-detail');
    await user.click(screen.getByTestId('download-artifact'));
    const dialog = await screen.findByTestId('export-dialog');
    expect(within(dialog).getAllByTestId('compliance-issue')[0]).toHaveTextContent(
      'Systemmerkmale › Systemname: Darf nicht leer sein.',
    );
    expect(within(dialog).getByTestId('export-draft-download')).toHaveTextContent(
      'Als Entwurf herunterladen',
    );
  });

  it('the creator rule (ADR-0019) still blocks: error toast, no dialog, no download', async () => {
    const user = userEvent.setup();
    renderDetail(await seedDraftSsp(false));
    await screen.findByTestId('ssp-detail');
    await user.click(screen.getByTestId('download-artifact'));
    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveAttribute('data-level', 'error');
    expect(toast).toHaveTextContent(/Cannot export.*creator/i);
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
    expect(blobs).toHaveLength(0);
  });

  it('the detail page lists the issues behind the compliance badge', async () => {
    const user = userEvent.setup();
    renderDetail(await seedDraftSsp());
    const badge = await screen.findByTestId('compliance-badge');
    await waitFor(() => expect(badge).toHaveAttribute('data-status', 'non-compliant'));
    expect(badge).toHaveTextContent('4');
    await user.click(badge);
    expect(await screen.findAllByTestId('compliance-issue')).toHaveLength(4);
  });
});

describe('bulk zip export (ADR-0027)', () => {
  function renderList() {
    return render(
      <ToastProvider>
        <MemoryRouter>
          <SspListPage />
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  it('shows per-row status; drafts are included in the zip only after confirming the dialog', async () => {
    await seedCompliantSsp();
    await seedDraftSsp();
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getAllByTestId('ssp-select-item')).toHaveLength(2));
    await waitFor(() =>
      expect(
        screen
          .getAllByTestId('compliance-badge')
          .map((b) => b.getAttribute('data-status'))
          .sort(),
      ).toEqual(['compliant', 'non-compliant']),
    );
    await user.click(screen.getByTestId('ssp-select-all'));
    await user.click(screen.getByTestId('ssp-download-selected'));

    const dialog = await screen.findByTestId('export-dialog');
    expect(dialog).toHaveTextContent('Draft SSP');
    expect(within(dialog).getAllByTestId('compliance-issue')).toHaveLength(4);
    expect(blobs).toHaveLength(0);
    await user.click(within(dialog).getByTestId('export-draft-download'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    const files = unzipSync(new Uint8Array(await readBlob(blobs[0]!, 'buffer')));
    expect(Object.keys(files)).toHaveLength(2);
    for (const bytes of Object.values(files)) {
      expect((JSON.parse(strFromU8(bytes)) as Record<string, unknown>).$schema).toBe(
        OSCAL_SCHEMA_IDS.systemSecurityPlan,
      );
    }
  });

  it('all compliant → direct download, no dialog', async () => {
    await seedCompliantSsp();
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getAllByTestId('ssp-select-item')).toHaveLength(1));
    await user.click(screen.getByTestId('ssp-select-all'));
    await user.click(screen.getByTestId('ssp-download-selected'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });
});
