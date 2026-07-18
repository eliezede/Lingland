import { describe, expect, it } from 'vitest';
import {
  DeepSeekClientError,
  parseDeepSeekCompletion,
  parseDeepSeekJsonObject,
} from './deepSeekClient';

describe('DeepSeek structured response parsing', () => {
  it('accepts strict JSON and transport wrappers without weakening the object contract', () => {
    expect(parseDeepSeekJsonObject('{"suggestions":[]}')).toEqual({ suggestions: [] });
    expect(parseDeepSeekJsonObject('```json\n{"suggestions":[]}\n```')).toEqual({ suggestions: [] });
    expect(parseDeepSeekJsonObject('Result:\n{"suggestions":[]}\nDone.')).toEqual({ suggestions: [] });
  });

  it('rejects empty, truncated and non-object content', () => {
    expect(() => parseDeepSeekJsonObject('')).toThrow(DeepSeekClientError);
    expect(() => parseDeepSeekJsonObject('{"suggestions":[')).toThrow(/invalid structured JSON/i);
    expect(() => parseDeepSeekJsonObject('[]')).toThrow(/invalid structured JSON/i);
  });

  it('reports provider truncation before attempting to consume partial JSON', () => {
    expect(() => parseDeepSeekCompletion({
      choices: [{
        finish_reason: 'length',
        message: { content: '{"suggestions":[' },
      }],
    })).toThrow(/truncated/i);
  });

  it('requires the suggestions array even when the JSON itself is valid', () => {
    expect(() => parseDeepSeekCompletion({
      choices: [{
        finish_reason: 'stop',
        message: { content: '{"result":"ok"}' },
      }],
    })).toThrow(/suggestions array/i);
  });

  it('accepts a complete structured completion', () => {
    expect(parseDeepSeekCompletion({
      choices: [{
        finish_reason: 'stop',
        message: { content: '{"suggestions":[{"action":"REVIEW_ASSIGNMENT"}]}' },
      }],
    })).toEqual({ suggestions: [{ action: 'REVIEW_ASSIGNMENT' }] });
  });
});
