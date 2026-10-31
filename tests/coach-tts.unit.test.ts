import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

// @ts-ignore
import { createCoachTtsController } from '../electron/coach.js';

class MockSpeechSynthesisUtterance {
  text: string;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((err: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

class MockSpeechSynthesis {
  speaking = false;
  spokenUtterances: MockSpeechSynthesisUtterance[] = [];
  cancelledCount = 0;

  speak(utterance: MockSpeechSynthesisUtterance) {
    this.spokenUtterances.push(utterance);
    this.speaking = true;
    if (utterance.onstart) utterance.onstart();
  }

  cancel() {
    this.cancelledCount++;
    this.speaking = false;
    if (this.spokenUtterances.length > 0) {
      const last = this.spokenUtterances[this.spokenUtterances.length - 1];
      if (last.onerror) last.onerror({ error: 'canceled' });
    }
  }
}

interface TtsState {
  isSpeaking: boolean;
  label: string;
  notice: string | null;
}

describe('Coach Local Text-to-Speech (TTS) Unit Tests', () => {
  it('reads aloud only the current actionable instruction on user click', () => {
    const synth = new MockSpeechSynthesis();
    let latestState: TtsState = { isSpeaking: false, label: '', notice: null };

    const controller = createCoachTtsController({
      getInstruction: () => 'Click "Insert" on the top menu bar to open chart options.',
      onStateChange: (state: TtsState) => { latestState = state; },
      getSpeechSynthesis: () => synth,
      getUtteranceClass: () => MockSpeechSynthesisUtterance
    });

    assert.equal(controller.isSupported(), true);
    assert.equal(controller.isSpeaking(), false);

    // Initial click starts playback
    const success = controller.speak();
    assert.equal(success, true);
    assert.equal(controller.isSpeaking(), true);
    assert.equal(synth.spokenUtterances.length, 1);
    assert.equal(synth.spokenUtterances[0].text, 'Click "Insert" on the top menu bar to open chart options.');
    assert.equal(controller.getActiveText(), 'Click "Insert" on the top menu bar to open chart options.');
    assert.equal(latestState.isSpeaking, true);
    assert.equal(latestState.label, 'Stop speaking');
  });

  it('stops playback when clicked a second time', () => {
    const synth = new MockSpeechSynthesis();
    let latestState: TtsState = { isSpeaking: false, label: '', notice: null };

    const controller = createCoachTtsController({
      getInstruction: () => 'Select Horizontal Bar Chart.',
      onStateChange: (state: TtsState) => { latestState = state; },
      getSpeechSynthesis: () => synth,
      getUtteranceClass: () => MockSpeechSynthesisUtterance
    });

    // 1st click: start
    controller.toggle();
    assert.equal(controller.isSpeaking(), true);
    assert.equal(latestState.label, 'Stop speaking');

    // 2nd click: stop
    controller.toggle();
    assert.equal(controller.isSpeaking(), false);
    assert.equal(synth.cancelledCount >= 1, true);
    assert.equal(latestState.isSpeaking, false);
    assert.equal(latestState.label, 'Read instruction aloud');
    assert.equal(controller.getActiveText(), '');
  });

  it('cancels any prior speech before speaking new instruction when guidance changes', () => {
    const synth = new MockSpeechSynthesis();
    let currentInstruction = 'Step 1: Select cells A1:B5';

    const controller = createCoachTtsController({
      getInstruction: () => currentInstruction,
      onStateChange: () => {},
      getSpeechSynthesis: () => synth,
      getUtteranceClass: () => MockSpeechSynthesisUtterance
    });

    // Start reading step 1
    controller.speak();
    assert.equal(controller.getActiveText(), 'Step 1: Select cells A1:B5');
    assert.equal(synth.spokenUtterances.length, 1);

    // New instruction arrives and is spoken
    currentInstruction = 'Step 2: Click Insert on the menu';
    controller.speak();

    // Previous speech must have been cancelled
    assert.equal(synth.cancelledCount >= 1, true);
    assert.equal(synth.spokenUtterances.length, 2);
    assert.equal(controller.getActiveText(), 'Step 2: Click Insert on the menu');
  });

  it('stops speech immediately on session reset or stop call', () => {
    const synth = new MockSpeechSynthesis();
    let latestState: TtsState = { isSpeaking: false, label: '', notice: null };

    const controller = createCoachTtsController({
      getInstruction: () => 'Ongoing step instruction',
      onStateChange: (state: TtsState) => { latestState = state; },
      getSpeechSynthesis: () => synth,
      getUtteranceClass: () => MockSpeechSynthesisUtterance
    });

    controller.speak();
    assert.equal(controller.isSpeaking(), true);

    // Stop session / reset session triggers controller.stop()
    controller.stop();
    assert.equal(controller.isSpeaking(), false);
    assert.equal(synth.cancelledCount >= 1, true);
    assert.equal(latestState.isSpeaking, false);
    assert.equal(latestState.label, 'Read instruction aloud');
    assert.equal(controller.getActiveText(), '');
  });

  it('handles unsupported speech synthesis gracefully without throwing', () => {
    let latestState: TtsState = { isSpeaking: false, label: '', notice: null };

    const controller = createCoachTtsController({
      getInstruction: () => 'Some instruction',
      onStateChange: (state: TtsState) => { latestState = state; },
      getSpeechSynthesis: () => undefined, // SpeechSynthesis unavailable
      getUtteranceClass: () => undefined
    });

    assert.equal(controller.isSupported(), false);
    const result = controller.speak();
    assert.equal(result, false);
    assert.equal(controller.isSpeaking(), false);
    assert.equal(latestState.notice, 'Speech synthesis is unavailable on this device.');
    assert.equal(latestState.label, 'Read instruction aloud');
  });

  it('handles empty instruction text gracefully without attempting speech', () => {
    const synth = new MockSpeechSynthesis();
    let latestState: TtsState = { isSpeaking: false, label: '', notice: null };

    const controller = createCoachTtsController({
      getInstruction: () => '   ', // whitespace only
      onStateChange: (state: TtsState) => { latestState = state; },
      getSpeechSynthesis: () => synth,
      getUtteranceClass: () => MockSpeechSynthesisUtterance
    });

    const result = controller.speak();
    assert.equal(result, false);
    assert.equal(synth.spokenUtterances.length, 0);
    assert.equal(latestState.notice, 'No active instruction to read.');
  });

  it('verifies coach HTML and CSS structure for TTS control', () => {
    const root = process.cwd();
    const coachHtml = fs.readFileSync(path.resolve(root, 'electron', 'coach.html'), 'utf-8');
    const coachCss = fs.readFileSync(path.resolve(root, 'electron', 'coach.css'), 'utf-8');

    // HTML elements
    assert.match(coachHtml, /id="btn-tts"/i, 'TTS button element in coach.html');
    assert.match(coachHtml, /aria-label="Read instruction aloud"/i, 'Accessible label for reading aloud');
    assert.match(coachHtml, /class="tts-icon-speaker"/i, 'Speaker icon SVG');
    assert.match(coachHtml, /class="tts-icon-stop"/i, 'Stop icon SVG');
    assert.match(coachHtml, /id="tts-notice"/i, 'Non-disruptive TTS notice element');

    // CSS styling
    assert.match(coachCss, /\.btn-tts\s*\{/i, '.btn-tts class styled');
    assert.match(coachCss, /\.btn-tts\.speaking\s*\{/i, '.btn-tts.speaking active state styled');
    assert.match(coachCss, /\.tts-notice\s*\{/i, '.tts-notice styled');
    assert.match(coachCss, /prefers-reduced-motion/i, 'prefers-reduced-motion coverage');
  });
});
