import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';

export type XeroIntegrationState = 'NOT_CONNECTED' | 'TENANT_SELECTION_REQUIRED' | 'CONNECTED' | 'ERROR';

export interface XeroTenant {
  connectionId: string;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  createdDateUtc?: string;
  updatedDateUtc?: string;
}

export interface XeroOrganisation {
  name?: string;
  legalName?: string;
  countryCode?: string;
  baseCurrency?: string;
  organisationType?: string;
  registrationNumber?: string;
  shortCode?: string;
}

export interface XeroIntegrationStatus {
  provider: 'XERO';
  configured: boolean;
  status: XeroIntegrationState;
  mode: 'READ_ONLY';
  syncEnabled: false;
  liveWriteEnabled: false;
  aiDataUseEnabled: false;
  scopes: string[];
  redirectUri: string;
  tenant: XeroTenant | null;
  organisation: XeroOrganisation | null;
  connectionOptions: XeroTenant[];
  connectedAt: string | null;
  connectedBy: string | null;
  lastHealthCheckAt: string | null;
  lastHealthCheckStatus: 'CONNECTED' | 'ERROR' | 'NOT_TESTED';
  lastHealthCheckMessage: string | null;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
  viewer: { role: 'ADMIN' | 'SUPER_ADMIN'; canManage: boolean };
}

const callable = <Request, Response>(name: string) => httpsCallable<Request, Response>(functions, name, { timeout: 60000 });

export const XeroIntegrationService = {
  getStatus: async () => {
    const response = await callable<Record<string, never>, XeroIntegrationStatus>('getXeroIntegrationStatus')({});
    return response.data;
  },

  startConnection: async (returnUrl: string) => {
    const response = await callable<{ returnUrl: string }, {
      authorizationUrl: string;
      expiresAt: string;
      redirectUri: string;
      scopes: string[];
    }>('startXeroConnection')({ returnUrl });
    return response.data;
  },

  selectOrganisation: async (connectionId: string) => {
    const response = await callable<{ connectionId: string }, XeroIntegrationStatus>('selectXeroOrganisation')({ connectionId });
    return response.data;
  },

  testConnection: async () => {
    const response = await callable<Record<string, never>, {
      connected: true;
      testedAt: string;
      tenant: XeroTenant;
      organisation: XeroOrganisation;
      mode: 'READ_ONLY';
      syncEnabled: false;
    }>('testXeroConnection')({});
    return response.data;
  },

  disconnect: async () => {
    const response = await callable<Record<string, never>, { success: true; disconnectedAt: string }>('disconnectXero')({});
    return response.data;
  },
};
