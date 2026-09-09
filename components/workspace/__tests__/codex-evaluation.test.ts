import { expect, it } from 'vitest';
import cases from '../../../evals/codex/cases.json';
import { resolveAiReference } from '../ai-citation-router';
import {
  createEmptyConversation,
  reduceCodexProtocolMessage,
} from '../ai-panel-state';
import { selectEvidenceSpans } from '../research-evidence';
import { splitAiMarkdownStream } from '../ai-markdown-stream';
it.each(cases)('$id ($kind)', (test) => {
  switch (test.kind) {
    case 'route': {
      const reference = resolveAiReference(test.input, test.root, test.source);
      expect(
        'relativePath' in reference ? reference.relativePath : reference.kind,
      ).toBe(test.expected);
      break;
    }
    case 'unsafe':
      expect(() => resolveAiReference(test.input, test.root)).toThrow();
      break;
    case 'authority': {
      let state = createEmptyConversation();
      const output = {
        accept(message: Parameters<typeof reduceCodexProtocolMessage>[1]) {
          state = reduceCodexProtocolMessage(state, message);
        },
      };
      const phase = test.expected === 'final' ? 'final_answer' : null;
      output.accept({
        method: 'item/started',
        params: { item: { id: 'a', type: 'agentMessage', phase, text: '' } },
      });
      output.accept({
        method: 'item/agentMessage/delta',
        params: { itemId: 'a', delta: '错误的临时文本' },
      });
      output.accept({
        method: 'item/completed',
        params: {
          item: { id: 'a', type: 'agentMessage', phase, text: test.input },
        },
      });
      output.accept({
        method: 'item/completed',
        params: {
          item: {
            id: 'comment',
            type: 'agentMessage',
            phase: 'commentary',
            text: '不应进入替换稿',
          },
        },
      });
      output.accept({
        method: 'turn/completed',
        params: { turn: { id: 'turn', status: 'completed' } },
      });
      expect(state.entries.find((entry) => entry.id === 'a')).toMatchObject({
        text: test.input,
        phase,
      });
      break;
    }
    case 'evidence': {
      const line = Number(test.expected);
      const source = Array.from({ length: 220 }, (_, i) =>
        i === line ? test.input + ' evidence' : '通用背景与介绍',
      ).join('\n');
      const selected = selectEvidenceSpans(source, test.input);
      expect(
        selected.some(
          (span) =>
            span.line <= line + 1 &&
            span.endLine >= line + 1 &&
            span.excerpt.includes(test.input),
        ),
      ).toBe(true);
      break;
    }
    case 'stream': {
      const result = splitAiMarkdownStream(test.input);
      expect(result.stable).toBe(test.expected);
      expect(result.stable + result.tail).toBe(test.input);
      break;
    }
    default:
      throw new Error('Unknown evaluation category');
  }
});
