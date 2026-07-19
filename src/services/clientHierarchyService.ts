import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { functions } from './firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { ClientAgent, ClientDepartment, ClientMembership } from '../types';
import { convertDoc } from './utils';

export interface ClientHierarchyBundle {
  departments: ClientDepartment[];
  agents: ClientAgent[];
  memberships: ClientMembership[];
}

export interface SaveClientDepartmentInput {
  clientId: string;
  departmentId?: string;
  name: string;
  locationName?: string;
  billingAddress?: string;
  status?: ClientDepartment['status'];
}

export interface SaveClientAgentMembershipInput {
  clientId: string;
  agentId?: string;
  displayName: string;
  email: string;
  agentType: ClientAgent['agentType'];
  accessLevel: ClientMembership['accessLevel'];
  roles: ClientAgent['roles'];
  departmentIds: string[];
}

export interface ClientPortalContext {
  client: { id: string; companyName: string; organizationId: string; status: string };
  agent: { id: string; displayName: string; email: string; agentType: ClientAgent['agentType'] } | null;
  membership: {
    id: string;
    accessLevel: ClientMembership['accessLevel'];
    roles: ClientMembership['roles'];
    departmentIds: string[];
  } | null;
  departments: Array<{ id: string; name: string; locationName?: string }>;
  legacyFallback: boolean;
  canRequest: boolean;
  canViewBookings: boolean;
  canReadFinance: boolean;
}

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export const ClientHierarchyService = {
  getForClient: async (clientId: string): Promise<ClientHierarchyBundle> => {
    const [departmentSnapshot, membershipSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'clientDepartments'), where('clientId', '==', clientId))),
      getDocs(query(collection(db, 'clientMemberships'), where('clientId', '==', clientId))),
    ]);

    const departments = departmentSnapshot.docs
      .map(document => convertDoc<ClientDepartment>(document))
      .sort((left, right) => left.name.localeCompare(right.name));
    const memberships = membershipSnapshot.docs
      .map(document => convertDoc<ClientMembership>(document))
      .sort((left, right) => left.accessLevel.localeCompare(right.accessLevel));
    const agentIds = unique(memberships.map(membership => membership.agentId));
    const agentDocuments = await Promise.all(agentIds.map(agentId => getDoc(doc(db, 'clientAgents', agentId))));
    const baseAgents = agentDocuments
      .filter(document => document.exists())
      .map(document => convertDoc<ClientAgent>(document))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    const userIds = unique(baseAgents.map(agent => agent.userId || ''));
    const userDocuments = await Promise.all(userIds.map(userId => getDoc(doc(db, 'users', userId))));
    const userStatusById = new Map(userDocuments
      .filter(document => document.exists())
      .map(document => [document.id, String(document.data().status || 'PENDING') as ClientAgent['portalAccountStatus']]));
    const agents = baseAgents.map(agent => ({
      ...agent,
      portalAccountStatus: agent.userId ? userStatusById.get(agent.userId) : undefined,
    }));

    return { departments, agents, memberships };
  },

  saveDepartment: async (input: SaveClientDepartmentInput): Promise<ClientDepartment> => {
    const callable = httpsCallable<SaveClientDepartmentInput, ClientDepartment>(functions, 'saveClientDepartment');
    return (await callable(input)).data;
  },

  saveAgentMembership: async (input: SaveClientAgentMembershipInput): Promise<{
    agent: ClientAgent;
    membership: ClientMembership;
  }> => {
    const callable = httpsCallable<SaveClientAgentMembershipInput, {
      agent: ClientAgent;
      membership: ClientMembership;
    }>(functions, 'saveClientAgentMembership');
    return (await callable(input)).data;
  },

  prepareAgentAccount: async (clientId: string, agentId: string): Promise<{
    user: Record<string, unknown>;
    agentId: string;
    membershipId: string;
    activationRequired: boolean;
    communicationSent: false;
  }> => {
    const callable = httpsCallable<{ clientId: string; agentId: string }, {
      user: Record<string, unknown>;
      agentId: string;
      membershipId: string;
      activationRequired: boolean;
      communicationSent: false;
    }>(functions, 'prepareClientAgentAccount');
    return (await callable({ clientId, agentId })).data;
  },

  getMyPortalContext: async (): Promise<ClientPortalContext> => {
    const callable = httpsCallable<Record<string, never>, ClientPortalContext>(functions, 'getMyClientPortalContext');
    return (await callable({})).data;
  },
};
