import { describe, expect, it } from 'vitest';
import { reduceAgentUpdate } from '../agent-session';
import type { SessionNotification } from '@agentclientprotocol/sdk';
const update = (
  update: SessionNotification['update'],
): SessionNotification => ({ sessionId: 'session', update });
describe('ACP conversation projection', () => {
  it('coalesces chunks within one turn and retains thought/message boundaries', () => {
    let messages = reduceAgentUpdate(
      [],
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hello ' },
      }),
      'one',
    );
    messages = reduceAgentUpdate(
      messages,
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'world' },
      }),
      'one',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('hello world');
    messages = reduceAgentUpdate(
      messages,
      update({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'thinking' },
      }),
      'one',
    );
    messages = reduceAgentUpdate(
      messages,
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'next turn' },
      }),
      'two',
    );
    expect(messages).toHaveLength(3);
  });
  it('merges partial tool updates without losing previous details', () => {
    const first = reduceAgentUpdate(
      [],
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'tool',
        title: 'Read note',
        kind: 'read',
        status: 'in_progress',
        locations: [{ path: '/note.md' }],
      }),
      'one',
    );
    const result = reduceAgentUpdate(
      first,
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool',
        status: 'completed',
      }),
      'one',
    );
    expect(result).toHaveLength(1);
    expect(result[0].tool).toMatchObject({
      title: 'Read note',
      status: 'completed',
      locations: [{ path: '/note.md' }],
    });
  });
  it('keeps existing metadata on null updates while accepting empty collections and false results', () => {
    const first = reduceAgentUpdate(
      [],
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'call',
        title: 'Search notes',
        name: 'mcp__notes__search',
        kind: 'search',
        rawInput: { query: 'notes' },
        content: [
          { type: 'content', content: { type: 'text', text: 'result' } },
        ],
      }),
      'one',
    );
    const next = reduceAgentUpdate(
      first,
      update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call',
        title: null,
        name: null,
        kind: null,
        rawInput: null,
        rawOutput: false,
        content: [],
        status: 'completed',
      }),
      'one',
    );
    expect(next[0].tool).toMatchObject({
      title: 'Search notes',
      name: 'mcp__notes__search',
      kind: 'search',
      rawInput: { query: 'notes' },
      rawOutput: false,
      content: [],
      status: 'completed',
    });
    expect(next[0].text).toBe('Search notes');
  });
});
