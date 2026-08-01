export interface PublicRequesterContextClientScope {
  clientId: string;
  membershipId: string;
  membershipStatus: string;
  allowedDepartmentIds: string[];
}

export interface PublicRequesterContextTokenData {
  version: 1;
  authUid: string;
  emailHash: string;
  agentId: string;
  agentType: string;
  expiresAtMs: number;
  clients: PublicRequesterContextClientScope[];
}

export interface PublicRequesterSelectionInput {
  authUid: string;
  emailHash: string;
  clientId: string;
  departmentId?: string;
  proposedDepartmentName?: string;
  nowMs: number;
}

export type PublicRequesterSelectionValidation = {
  ok: true;
  client: PublicRequesterContextClientScope;
  departmentId: string;
  proposedDepartmentName: string;
} | {
  ok: false;
  code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'CLIENT_NOT_ALLOWED' | 'DEPARTMENT_NOT_ALLOWED' | 'DEPARTMENT_CONFLICT' | 'DEPARTMENT_NAME_INVALID';
  message: string;
};

const text = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const normalizePublicDepartmentName = (value: unknown) => text(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const validatePublicRequesterSelection = (
  token: PublicRequesterContextTokenData,
  input: PublicRequesterSelectionInput,
): PublicRequesterSelectionValidation => {
  if (
    token.version !== 1
    || !token.authUid
    || token.authUid !== text(input.authUid)
    || !token.emailHash
    || token.emailHash !== text(input.emailHash)
  ) {
    return { ok: false, code: 'TOKEN_INVALID', message: 'The requester suggestion has expired or does not match this session.' };
  }
  if (!Number.isFinite(token.expiresAtMs) || token.expiresAtMs <= input.nowMs) {
    return { ok: false, code: 'TOKEN_EXPIRED', message: 'The requester suggestion has expired. Check the email again.' };
  }

  const requestedClientId = text(input.clientId);
  const client = token.clients.find(item => text(item.clientId) === requestedClientId);
  if (!requestedClientId || !client) {
    return { ok: false, code: 'CLIENT_NOT_ALLOWED', message: 'Select an organisation linked to this requester email.' };
  }

  const departmentId = text(input.departmentId);
  const proposedDepartmentName = text(input.proposedDepartmentName).slice(0, 160);
  if (departmentId && proposedDepartmentName) {
    return { ok: false, code: 'DEPARTMENT_CONFLICT', message: 'Select an existing department or request a new one, not both.' };
  }
  if (departmentId && !client.allowedDepartmentIds.map(text).includes(departmentId)) {
    return { ok: false, code: 'DEPARTMENT_NOT_ALLOWED', message: 'The selected department is outside this requester scope.' };
  }
  if (proposedDepartmentName && proposedDepartmentName.length < 2) {
    return { ok: false, code: 'DEPARTMENT_NAME_INVALID', message: 'Enter a valid department name.' };
  }
  return { ok: true, client, departmentId, proposedDepartmentName };
};
