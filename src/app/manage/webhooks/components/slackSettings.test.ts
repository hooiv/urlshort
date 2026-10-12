import { describe, expect, it } from 'vitest';
import { describeTestResult, getSlackUrlError, maskSlackUrl, toggleEvent } from './slackSettings';

const URL_OK = 'https://hooks.slack.com/services/T01ABCDEF/B02GHIJKL/abcdEFGH1234ijklMNOP5678';

describe('slack settings helpers', () => {
  it('validates Slack URLs', () => {
    expect(getSlackUrlError('')).toMatch(/Paste/);
    expect(getSlackUrlError('https://example.com/x')).toMatch(/Slack URL/);
    expect(getSlackUrlError(URL_OK)).toBeNull();
  });
  it('masks the secret path segment', () => {
    const masked = maskSlackUrl(URL_OK);
    expect(masked).not.toContain('abcdEFGH1234ijkl');
    expect(masked.endsWith('5678')).toBe(true);
    expect(maskSlackUrl('https://example.com/a')).toBe('https://example.com/a');
  });
  it('toggles events immutably', () => {
    const a = ['link.created'];
    expect(toggleEvent(a, 'link.clicked')).toEqual(['link.created', 'link.clicked']);
    expect(toggleEvent(a, 'link.created')).toEqual([]);
    expect(a).toEqual(['link.created']);
  });
  it('describes test results', () => {
    expect(describeTestResult({ success: true })).toMatch(/delivered/);
    expect(describeTestResult({ success: false, statusCode: 404, responseSnippet: 'no_service' })).toBe('Slack rejected the test (HTTP 404): no_service');
  });
});
