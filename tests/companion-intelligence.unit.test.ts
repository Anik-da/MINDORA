import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyActivity, isWithinQuietHours, matchesExcludedApplication, SuggestionCooldown, suggestionForActivity } from '../electron/companion/activity.js';

describe('Companion contextual intelligence', () => {
  it('classifies evidence with confidence and offers only a tentative coding suggestion', () => {
    const classified = classifyActivity({ process: 'Code', title: 'project - Visual Studio Code', text: 'TypeError: undefined is not a function' });
    assert.equal(classified.category, 'debugging');
    assert.equal(classified.confidence, 0.84);
    const suggestion = suggestionForActivity(classified, 60_000);
    assert.match(suggestion?.message || '', /Would you like/i);
    assert.equal(suggestion?.reason, classified.evidence[0]);
  });

  it('suppresses private and sensitive contexts without returning their content', () => {
    for (const observation of [
      { process: 'chrome', title: 'Incognito - Example', text: 'password: secret-value' },
      { process: 'chrome', title: 'Example', text: 'Enter your verification code' }
    ]) {
      const result = classifyActivity(observation);
      assert.equal(result.category, 'idle_unknown');
      assert.equal(result.confidence, 0);
      assert.equal(suggestionForActivity(result), null);
    }
  });

  it('honors app exclusions, dismiss cooldown, and quiet periods across midnight', () => {
    assert.equal(matchesExcludedApplication('Code.exe', ['code']), true);
    const suggestion = suggestionForActivity(classifyActivity({ process: 'WINWORD', title: 'Draft - Word', text: 'Document paragraph' }), 100_000)!;
    const cooldown = new SuggestionCooldown(60_000);
    assert.equal(cooldown.offer(suggestion, 100_000), true);
    cooldown.dismiss(suggestion, 100_000);
    assert.equal(cooldown.offer(suggestion, 120_000), false);
    assert.equal(cooldown.offer(suggestion, 160_001), true);
    assert.equal(isWithinQuietHours(new Date('2026-10-31T23:30:00'), '22:00', '07:00'), true);
    assert.equal(isWithinQuietHours(new Date('2026-10-31T12:00:00'), '22:00', '07:00'), false);
  });
});
