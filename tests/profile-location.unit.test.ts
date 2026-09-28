import { describe, expect, it } from 'vitest';
import type { CareerProfileRow } from '../src/models/career-profile.model.js';
import { registerSchema } from '../src/modules/auth/auth.schemas.js';
import { upsertProfileSchema } from '../src/modules/profiles/profile.schemas.js';
import { toProfileView } from '../src/modules/profiles/profile.types.js';

const baseProfile: CareerProfileRow = {
  id: '11111111-1111-4111-8111-111111111111',
  participantProfileId: '22222222-2222-4222-8222-222222222222',
  currentOccupation: 'POS Business Owner',
  industry: 'Financial Services',
  yearsOfExperience: 4,
  education: 'Secondary School',
  employmentType: 'INFORMAL_WORKER',
  careerInterests: null,
  targetCareerId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const baseBody = {
  currentOccupation: 'POS Business Owner',
  industry: 'Financial Services',
  yearsOfExperience: 4,
  employmentType: 'INFORMAL_WORKER',
};

describe('registerSchema location fields', () => {
  it('accepts a country with a state', () => {
    const parsed = registerSchema.parse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@example.com',
      password: 'SecurePassword123!',
      country: 'Nigeria',
      state: 'Lagos',
    });
    expect(parsed.country).toBe('Nigeria');
    expect(parsed.state).toBe('Lagos');
  });

  it('keeps working for clients that omit state entirely', () => {
    const parsed = registerSchema.parse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@example.com',
      password: 'SecurePassword123!',
      country: 'Nigeria',
    });
    expect(parsed.country).toBe('Nigeria');
    expect(parsed.state).toBeUndefined();
  });

  it('trims the state and rejects a blank one', () => {
    const parsed = registerSchema.parse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@example.com',
      password: 'SecurePassword123!',
      country: 'Nigeria',
      state: '  Ogun  ',
    });
    expect(parsed.state).toBe('Ogun');

    expect(() =>
      registerSchema.parse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        password: 'SecurePassword123!',
        country: 'Nigeria',
        state: '   ',
      }),
    ).toThrow();
  });

  it('still requires country', () => {
    expect(() =>
      registerSchema.parse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        password: 'SecurePassword123!',
        state: 'Lagos',
      }),
    ).toThrow();
  });

  it('caps the state length at 100 characters', () => {
    expect(() =>
      registerSchema.parse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        password: 'SecurePassword123!',
        country: 'Nigeria',
        state: 'x'.repeat(101),
      }),
    ).toThrow();
  });
});

describe('upsertProfileSchema location fields', () => {
  it('accepts country and state', () => {
    const parsed = upsertProfileSchema.parse({ ...baseBody, country: 'Nigeria', state: 'Lagos' });
    expect(parsed.country).toBe('Nigeria');
    expect(parsed.state).toBe('Lagos');
  });

  it('accepts an explicit null state to clear it', () => {
    const parsed = upsertProfileSchema.parse({ ...baseBody, country: 'Ghana', state: null });
    expect(parsed.country).toBe('Ghana');
    expect(parsed.state).toBeNull();
  });

  it('leaves both undefined when omitted, so stored values are untouched', () => {
    const parsed = upsertProfileSchema.parse(baseBody);
    expect('country' in parsed).toBe(false);
    expect('state' in parsed).toBe(false);
  });

  it('rejects a blank country and an over-long state', () => {
    expect(() => upsertProfileSchema.parse({ ...baseBody, country: '   ' })).toThrow();
    expect(() => upsertProfileSchema.parse({ ...baseBody, state: 'x'.repeat(101) })).toThrow();
  });

  it('still rejects unknown fields', () => {
    expect(() => upsertProfileSchema.parse({ ...baseBody, userId: 'x' })).toThrow();
  });
});

describe('toProfileView location mapping', () => {
  it('surfaces the user location alongside the career profile', () => {
    const view = toProfileView(baseProfile, null, [], { country: 'Nigeria', state: 'Lagos' });
    expect(view.country).toBe('Nigeria');
    expect(view.state).toBe('Lagos');
    expect(view.currentOccupation).toBe('POS Business Owner');
  });

  it('returns a null state for existing users that never set one', () => {
    const view = toProfileView(baseProfile, null, [], { country: 'Nigeria', state: null });
    expect(view.country).toBe('Nigeria');
    expect(view.state).toBeNull();
  });
});
