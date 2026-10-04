import { describe, expect, it } from 'vitest';
import { mediaForConcept } from './media.js';

describe('instructional media intent', () => {
  it('prefers stable curated beginner assets and retains licensing', () => {
    for (const id of ['water', 'tea', 'coffee', 'rice-food']) {
      const media = mediaForConcept({
        id: `te.lex.${id}`,
        english: id,
        imageUrl: 'https://example.com/other.jpg',
      });
      expect(media?.url).toMatch(/^\/media\/telugu\/beginner\//);
      expect(media?.attribution?.licenseUrl).toBeTruthy();
      expect(media?.presentation?.fit).toBe('contain');
    }
  });
  it('describes full subject framing for objects, animals, and transport', () => {
    expect(
      mediaForConcept({ id: 'apple', english: 'apple', topic: 'food' })?.query,
    ).toContain('single apple');
    expect(
      mediaForConcept({ id: 'dog', english: 'dog', topic: 'animal' })?.query,
    ).toContain('full body');
    expect(
      mediaForConcept({ id: 'bus', english: 'bus', topic: 'transport' })?.query,
    ).toContain('side view');
  });
  it('uses contextual framing for actions rather than isolated objects', () => {
    const media = mediaForConcept({
      id: 'run',
      english: 'person running',
      topic: 'action',
    });
    expect(media?.intent?.allowPeople).toBe(true);
    expect(media?.intent?.isolated).toBe(false);
    expect(media?.presentation?.fit).toBe('cover');
    expect(media?.query).toContain('clear action');
  });
  it('does not manufacture photographs for abstract concepts', () => {
    expect(
      mediaForConcept({ id: 'because', english: 'because', topic: 'logic' }),
    ).toBeUndefined();
  });
});
