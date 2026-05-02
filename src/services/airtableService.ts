
import { Interpreter } from '../types';

const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = 'appF50EzH7zVQdwAv'; // Lingland MASTER 2026
const INTERPRETERS_TABLE = 'Interpreters';

export interface AirtableInterpreterRaw {
  id: string;
  fields: {
    'NAME MASTER': string;
    'EMAIL'?: string;
    'PHONE'?: string;
    'LANGUAGE'?: string;
    'active!'?: string;
    'STREET'?: string;
    'TOWN'?: string;
    'COUNTY'?: string;
    'POSTCODE'?: string;
    'QUALIFICATIONS'?: string;
    'DBS'?: string;
    'L1'?: string | number;
    [key: string]: any;
  };
}

export const AirtableService = {
  /**
   * Fetches all active interpreters from Airtable and merges them by NAME MASTER
   */
  fetchActiveInterpreters: async (): Promise<Partial<Interpreter>[]> => {
    let allRecords: AirtableInterpreterRaw[] = [];
    let offset = '';

    try {
      do {
        const filterFormula = encodeURIComponent("{active!}='active'");
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${INTERPRETERS_TABLE}?filterByFormula=${filterFormula}${offset ? `&offset=${offset}` : ''}`;
        
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Airtable API error: ${response.statusText}`);
        }

        const data = await response.json();
        allRecords = [...allRecords, ...data.records];
        offset = data.offset;
      } while (offset);

      const normalize = (val: any) => {
        if (Array.isArray(val)) val = val[0];
        if (typeof val === 'string') return val.trim();
        return val || '';
      };

      const mergedMap = new Map<string, Partial<Interpreter>>();

      allRecords.forEach((record) => {
        const fields = record.fields;
        const nameMaster = normalize(fields['NAME MASTER']);
        
        if (!nameMaster) return;

        const language = normalize(fields['LANGUAGE']);
        const l1Value = normalize(fields['L1']);
        const priority = parseInt(String(l1Value)) || 18;

        if (mergedMap.has(nameMaster)) {
          // Merge language if existing
          const existing = mergedMap.get(nameMaster)!;
          if (language && !existing.languages?.some(l => l.toLowerCase() === language.toLowerCase())) {
            existing.languages = [...(existing.languages || []), language];
            existing.languageProficiencies = [
              ...(existing.languageProficiencies || []),
              { language, l1: priority, translateOrder: 'no' }
            ];
          }
        } else {
          // Create new merged record
          const town = normalize(fields['TOWN']);
          const interpreter: Partial<Interpreter> = {
            name: nameMaster,
            email: normalize(fields['EMAIL']).toLowerCase(),
            phone: normalize(fields['PHONE']),
            languages: language ? [language] : [],
            languageProficiencies: language ? [{ language, l1: priority, translateOrder: 'no' }] : [],
            address: {
              street: normalize(fields['STREET']),
              town: town,
              county: normalize(fields['COUNTY']),
              postcode: normalize(fields['POSTCODE']),
              country: 'UK'
            },
            status: 'IMPORTED',
            qualifications: fields['QUALIFICATIONS'] ? [normalize(fields['QUALIFICATIONS'])] : [],
            // Default required fields for schema compliance
            gender: 'O',
            hasCar: false,
            regions: town ? [town] : [], // Map town to regions for table visibility
            keyInterpreter: false,
            documentUrls: [],
            dbs: { level: 'N/A', autoRenew: false },
            nrpsi: { registered: false },
            badge: { idStatus: 'Not made yet' },
            organizationId: 'org1', // Default org
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          mergedMap.set(nameMaster, interpreter);
        }
      });

      return Array.from(mergedMap.values());
    } catch (error) {
      console.error('Error fetching from Airtable:', error);
      throw error;
    }
  }
};
