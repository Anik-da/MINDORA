/**
 * MINDORA - Response Contract & Model Validation Module
 * 
 * Enforces the structured response contract defined in MINDORA_Blueprint.md.
 * Rejects invalid enum values, missing instructions, and ensures uncertain/complete
 * states never produce target highlights.
 */

import { NormalizedBox, validateNormalizedBox } from './coordinates.js';

export type ModelAssessment = 'not_started' | 'expected' | 'unexpected' | 'uncertain';
export type ModelStatus = 'guide' | 'recover' | 'uncertain' | 'complete';

export const VALID_ASSESSMENTS: ReadonlySet<string> = new Set<ModelAssessment>([
  'not_started',
  'expected',
  'unexpected',
  'uncertain'
]);

export const VALID_STATUSES: ReadonlySet<string> = new Set<ModelStatus>([
  'guide',
  'recover',
  'uncertain',
  'complete'
]);

export interface ValidatedGuidance {
  assessment: ModelAssessment;
  status: ModelStatus;
  observation: string;
  instruction: string;
  targetLabel: string | null;
  targetBox: NormalizedBox | null;
  selectedCandidateId: string | null;
  expectedOutcome: string;
  reason: string | null;
  hasTargetHighlight: boolean;
}

export type ContractValidationSuccess = { valid: true; guidance: ValidatedGuidance };
export type ContractValidationFailure = { valid: false; errors: string[] };
export type ContractValidationResult = ContractValidationSuccess | ContractValidationFailure;

/**
 * Validates a raw JSON object received from Gemini against the MINDORA blueprint contract.
 */
export function validateModelResponse(
  raw: unknown,
  availableCandidateIds?: ReadonlySet<string>
): ContractValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, errors: ['Response must be a non-null JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  // 1. Assessment validation
  if (typeof obj.assessment !== 'string' || !VALID_ASSESSMENTS.has(obj.assessment)) {
    errors.push(`Invalid or missing assessment: got '${obj.assessment}'. Must be one of: not_started, expected, unexpected, uncertain.`);
  }

  // 2. Status validation
  if (typeof obj.status !== 'string' || !VALID_STATUSES.has(obj.status)) {
    errors.push(`Invalid or missing status: got '${obj.status}'. Must be one of: guide, recover, uncertain, complete.`);
  }

  // 3. Observation validation
  if (typeof obj.observation !== 'string' || obj.observation.trim().length === 0) {
    errors.push('Observation must be a non-empty string.');
  }

  // 4. Instruction validation
  if (typeof obj.instruction !== 'string' || obj.instruction.trim().length === 0) {
    errors.push('Instruction must be a non-empty string describing the action.');
  }

  // 5. Expected outcome validation
  if (typeof obj.expectedOutcome !== 'string' || obj.expectedOutcome.trim().length === 0) {
    errors.push('Expected outcome must be a non-empty string.');
  }

  // If core string fields are invalid, stop early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const assessment = obj.assessment as ModelAssessment;
  const status = obj.status as ModelStatus;
  const observation = (obj.observation as string).trim();
  const instruction = (obj.instruction as string).trim();
  const expectedOutcome = (obj.expectedOutcome as string).trim();

  const targetLabel = typeof obj.targetLabel === 'string' && obj.targetLabel.trim().length > 0
    ? obj.targetLabel.trim()
    : null;

  const reason = typeof obj.reason === 'string' && obj.reason.trim().length > 0
    ? obj.reason.trim()
    : null;

  // 6. Selected Candidate ID validation (for OCR-grounded coaching)
  let selectedCandidateId: string | null = null;
  if (typeof obj.selectedCandidateId === 'string' && obj.selectedCandidateId.trim().length > 0) {
    selectedCandidateId = obj.selectedCandidateId.trim();
  }

  if (selectedCandidateId !== null && availableCandidateIds !== undefined) {
    if (!availableCandidateIds.has(selectedCandidateId)) {
      errors.push(`Selected candidate ID '${selectedCandidateId}' does not exist in the OCR candidate list for this capture.`);
    }
  }

  // 7. Target box validation & highlight constraint rules
  let validatedBox: NormalizedBox | null = null;
  let hasTargetHighlight = false;

  if (status === 'uncertain' || status === 'complete') {
    // Blueprint rule: Uncertain and completed states must not produce a target highlight
    validatedBox = null;
    selectedCandidateId = null;
    hasTargetHighlight = false;
  } else {
    // Status is 'guide' or 'recover'
    if (obj.targetBox !== null && obj.targetBox !== undefined) {
      const boxValidation = validateNormalizedBox(obj.targetBox);
      if (!boxValidation.valid) {
        errors.push(`Invalid targetBox: ${boxValidation.error}`);
      } else {
        validatedBox = boxValidation.value;
        hasTargetHighlight = true;
      }
    } else if (selectedCandidateId !== null) {
      hasTargetHighlight = true;
    } else {
      validatedBox = null;
      hasTargetHighlight = false;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    guidance: {
      assessment,
      status,
      observation,
      instruction,
      targetLabel,
      targetBox: validatedBox,
      selectedCandidateId,
      expectedOutcome,
      reason,
      hasTargetHighlight
    }
  };
}
