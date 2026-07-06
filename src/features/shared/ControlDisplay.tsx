// Reusable control renderer. Decision IDs: ADR-0016, ADR-0008, ADR-0009, ADR-0010.
import { Markup } from '@/shared/Markup';
import {
  getControlHeadline,
  getControlAltIdentifier,
  getStatementSegments,
  flattenParts,
} from '@/models/controlDisplay';
import type { Control } from '@/models/control';
import './controlDisplay.css';

interface Props {
  control: Control;
  /** set-parameters from the referencing requirement, overriding param display values. */
  setParameters?: { paramId: string; values?: string[] }[];
  /** Href that opens the catalog in the external Stand-der-Technik-Viewer (ADR-0008). */
  viewerUrl?: string;
  statementMaxChars?: number;
}

export function ControlDisplay({ control, setParameters, viewerUrl, statementMaxChars }: Props) {
  const headline = getControlHeadline(control);
  const altId = getControlAltIdentifier(control);
  const segments = getStatementSegments(control, setParameters, statementMaxChars);
  const allParts = flattenParts(control.parts);

  return (
    <span className="control-display" data-testid="control-display" tabIndex={0}>
      {viewerUrl ? (
        <a
          className="control-headline"
          data-testid="control-headline"
          href={viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open catalog in the Stand-der-Technik-Viewer"
        >
          {headline}
        </a>
      ) : (
        <span className="control-headline" data-testid="control-headline">
          {headline}
        </span>
      )}

      <span className="control-statement" data-testid="control-statement">
        {' — '}
        {segments.map((seg, i) =>
          seg.type === 'param' ? (
            <span key={i} className="control-param" data-testid="control-param">
              {seg.text}
            </span>
          ) : (
            <Markup key={i} value={seg.text} />
          ),
        )}
      </span>

      <span className="control-tooltip" role="tooltip" data-testid="control-tooltip">
        <div>
          <strong>id:</strong> {control.id}
        </div>
        <div>
          <strong>uuid:</strong> {altId ?? '—'}
        </div>
        <div>
          <strong>class:</strong> {control.class ?? '—'}
        </div>
        {allParts.map((p, i) => (
          <div key={i} data-testid="control-tooltip-part">
            <strong>{p.name}:</strong> <Markup value={p.prose} />
          </div>
        ))}
      </span>
    </span>
  );
}
