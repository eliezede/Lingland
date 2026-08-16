import { describe, expect, it } from 'vitest';
import { ServiceCategory, ServiceType, SessionMode } from '../types';
import { getServiceCategoryLabel, getServiceTypeLabel } from './serviceTypeDisplay';

describe('service type display', () => {
  it('separates the interpreting category from an onsite delivery mode', () => {
    const booking = {
      serviceCategory: ServiceCategory.INTERPRETATION,
      serviceType: 'Interpreting',
      locationType: 'ONSITE',
    } as const;

    expect(getServiceCategoryLabel(booking)).toBe('Interpreting');
    expect(getServiceTypeLabel(booking)).toBe(ServiceType.FACE_TO_FACE);
  });

  it('uses the canonical session mode before a location fallback', () => {
    expect(getServiceTypeLabel({
      serviceType: 'Interpreting',
      sessionMode: SessionMode.PHONE,
      locationType: 'ONLINE',
    })).toBe(ServiceType.TELEPHONE);
  });

  it('normalizes the raw Airtable service mode', () => {
    expect(getServiceTypeLabel({
      serviceType: 'Interpreting',
      sourceServiceType: 'Video / Teams',
      locationType: 'ONLINE',
    })).toBe(ServiceType.VIDEO);
  });

  it('keeps translation as both the category and service type', () => {
    const booking = {
      serviceCategory: ServiceCategory.TRANSLATION,
      serviceType: ServiceType.TRANSLATION,
      locationType: 'ONLINE',
    } as const;

    expect(getServiceCategoryLabel(booking)).toBe('Translation');
    expect(getServiceTypeLabel(booking)).toBe(ServiceType.TRANSLATION);
  });
});
