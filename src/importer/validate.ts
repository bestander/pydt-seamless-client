import Ajv from 'ajv';
import type { CivaSchemaReply, SchemaIssue } from '../civa-types';

/**
 * Check an envelope against the JSON Schema civa serves, before anything is posted. Issues carry the same
 * `$.state.units[3].type` style path civa's `inspect` answers with.
 */
export function validateEnvelope(schema: Pick<CivaSchemaReply, 'envelopeSchema'>, envelope: unknown, maxIssues = 100): SchemaIssue[] {
  const ajv = new Ajv({ allErrors: true, strict: false, verbose: false });
  const validate = ajv.compile(schema.envelopeSchema);
  if (validate(envelope)) return [];
  const issues: SchemaIssue[] = [];
  for (const e of validate.errors ?? []) {
    const path = '$' + e.instancePath.split('/').slice(1).map(seg => (/^\d+$/.test(seg) ? `[${seg}]` : `.${seg.replace(/~1/g, '/').replace(/~0/g, '~')}`)).join('');
    const extra = e.keyword === 'required' ? `.${(e.params as { missingProperty: string }).missingProperty}` : e.keyword === 'additionalProperties' ? `.${(e.params as { additionalProperty: string }).additionalProperty}` : '';
    issues.push({ path: path + extra, message: e.keyword === 'required' ? 'is required' : e.keyword === 'additionalProperties' ? 'is not an allowed field' : e.message ?? 'is invalid' });
    if (issues.length >= maxIssues) break;
  }
  return issues;
}
