import { httpsCallable } from 'firebase/functions';
import { functions } from './firebaseConfig';
import {
  ServiceCategory,
  SettlementCycle,
  SettlementCycleStatus,
  SettlementPayeeSummary,
} from '../types';

interface SettlementCycleResponse {
  success: boolean;
  cycle: SettlementCycle | null;
  payees: SettlementPayeeSummary[];
}

interface PreparedCycleResponse {
  success: boolean;
  cycleId: string;
  cycle: SettlementCycle;
}

const callable = <Request, Response>(name: string) => (
  httpsCallable<Request, Response>(functions, name)
);

export const FinanceWorkspaceService = {
  getSettlementCycle: async (
    periodKey: string,
    serviceCategory: ServiceCategory,
  ): Promise<SettlementCycleResponse> => {
    const response = await callable<
      { periodKey: string; serviceCategory: ServiceCategory },
      SettlementCycleResponse
    >('getSettlementCycle')({ periodKey, serviceCategory });
    return response.data;
  },

  prepareSettlementCycle: async (
    periodKey: string,
    serviceCategory: ServiceCategory,
  ): Promise<PreparedCycleResponse> => {
    const response = await callable<
      { periodKey: string; serviceCategory: ServiceCategory },
      PreparedCycleResponse
    >('prepareSettlementCycle')({ periodKey, serviceCategory });
    return response.data;
  },

  transitionSettlementCycle: async (
    cycleId: string,
    status: SettlementCycleStatus,
  ): Promise<{ success: boolean; status: SettlementCycleStatus; idempotent?: boolean }> => {
    const response = await callable<
      { cycleId: string; status: SettlementCycleStatus },
      { success: boolean; status: SettlementCycleStatus; idempotent?: boolean }
    >('transitionSettlementCycle')({ cycleId, status });
    return response.data;
  },

  generateProfessionalStatement: async (input: {
    interpreterId: string;
    periodStart: string;
    periodEnd: string;
    serviceCategory: ServiceCategory;
    settlementCycleId: string;
  }): Promise<{ success: boolean; invoiceId?: string; invoiceNumber?: string; count?: number; message?: string; idempotent?: boolean }> => {
    const response = await callable<typeof input, {
      success: boolean;
      invoiceId?: string;
      invoiceNumber?: string;
      count?: number;
      message?: string;
      idempotent?: boolean;
    }>('generateInterpreterInvoices')(input);
    return response.data;
  },
};
