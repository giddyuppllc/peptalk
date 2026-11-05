import { shouldCloudSyncMessage } from '../chatSync';

describe('shouldCloudSyncMessage', () => {
  it('skips the empty streaming placeholder', () => {
    expect(shouldCloudSyncMessage({ role: 'bot', content: '' })).toBe(false);
    expect(shouldCloudSyncMessage({ role: 'bot', content: '   \n' })).toBe(false);
  });
  it('syncs user messages and bot messages with text', () => {
    expect(shouldCloudSyncMessage({ role: 'user', content: 'hi' })).toBe(true);
    expect(shouldCloudSyncMessage({ role: 'bot', content: 'Here are your trends.' })).toBe(true);
  });
});
