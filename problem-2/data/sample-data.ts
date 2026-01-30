/**
 * Sample data for testing and development.
 * This data mirrors the structure provided in the assessment requirements.
 */

import { Person, Organization } from '../types';

export const samplePeople: Person[] = [
  {
    id: '1',
    fullName: 'Sarah Chen',
    title: 'Senior Software Engineer',
    company: 'Google',
    location: { city: 'San Francisco', state: 'CA', country: 'USA' },
    bio: 'Full-stack engineer with 10 years experience. Passionate about distributed systems.',
    tags: ['engineer', 'backend'],
    enrichedAt: new Date('2024-01-15'),
    factCount: 15,
  },
  {
    id: '2',
    fullName: 'Michael Rodriguez',
    title: 'Chief Technology Officer',
    company: 'TechStart Inc',
    location: { city: 'San Francisco', state: 'CA', country: 'USA' },
    bio: 'CTO and co-founder. Led engineering at 3 startups. Expert in scaling systems.',
    tags: ['cto', 'founder', 'engineer'],
    enrichedAt: new Date('2024-01-20'),
    factCount: 22,
  },
  {
    id: '3',
    fullName: 'Emily Johnson',
    title: 'Software Engineer',
    company: 'Meta',
    location: { city: 'Menlo Park', state: 'CA', country: 'USA' },
    bio: 'Frontend engineer specializing in React and TypeScript.',
    tags: ['engineer', 'frontend'],
    enrichedAt: new Date('2023-12-10'),
    factCount: 8,
  },
];

export const sampleOrganizations: Organization[] = [
  {
    id: 'org1',
    name: 'TechStart Inc',
    domain: 'techstart.com',
    industry: 'Software',
    location: { city: 'San Francisco', state: 'CA', country: 'USA' },
    funding: {
      totalRaised: 15000000,
      valuation: 50000000,
      latestRound: {
        type: 'Series A',
        amount: 10000000,
        date: '2023-06-15',
      },
      rounds: [
        {
          type: 'Series A',
          amount: 10000000,
          date: '2023-06-15',
          investors: ['Sequoia Capital', 'Andreessen Horowitz'],
        },
        {
          type: 'Seed',
          amount: 5000000,
          date: '2022-01-10',
          investors: ['Y Combinator'],
        },
      ],
    },
    investors: ['Sequoia Capital', 'Andreessen Horowitz', 'Y Combinator'],
    executives: [
      { name: 'Michael Rodriguez', title: 'CTO', email: 'michael@techstart.com' },
      { name: 'John Smith', title: 'CEO', email: 'john@techstart.com' },
    ],
    enrichedAt: new Date('2024-01-20'),
    factCount: 25,
  },
  {
    id: 'org2',
    name: 'StartupXYZ',
    domain: 'startupxyz.com',
    industry: 'SaaS',
    location: { city: 'New York', state: 'NY', country: 'USA' },
    funding: {
      totalRaised: 5000000,
      valuation: 15000000,
      latestRound: {
        type: 'Seed',
        amount: 5000000,
        date: '2023-12-01',
      },
    },
    investors: ['Y Combinator'],
    enrichedAt: new Date('2024-01-10'),
    factCount: 12,
  },
];
