import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock NestJS Injectable decorator before importing
vi.mock('@nestjs/common', () => ({
  Injectable: () => () => {},
}));

import { StreamService } from './stream.service';

describe('StreamService', () => {
  let service: StreamService;

  beforeEach(() => {
    service = new StreamService();
  });

  describe('run streams', () => {
    it('creates a stream for a new runId', () => {
      const stream = service.getRunStream('run-1');
      expect(stream).toBeDefined();
      expect(stream.subscribe).toBeTypeOf('function');
    });

    it('returns the same stream for the same runId', () => {
      const stream1 = service.getRunStream('run-1');
      const stream2 = service.getRunStream('run-1');
      // Both should be from the same Subject (same observable)
      const values1: unknown[] = [];
      const values2: unknown[] = [];
      stream1.subscribe((v) => values1.push(v));
      stream2.subscribe((v) => values2.push(v));

      service.emit('run-1', { test: true });
      expect(values1).toHaveLength(1);
      expect(values2).toHaveLength(1);
    });

    it('emits events to subscribers', () => {
      const received: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => received.push(evt));

      service.emit('run-1', { status: 'running', progress: 50 });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        data: JSON.stringify({ status: 'running', progress: 50 }),
      });
    });

    it('emits multiple events in order', () => {
      const received: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => received.push(evt));

      service.emit('run-1', { step: 1 });
      service.emit('run-1', { step: 2 });
      service.emit('run-1', { step: 3 });

      expect(received).toHaveLength(3);
      expect(JSON.parse((received[0] as any).data)).toEqual({ step: 1 });
      expect(JSON.parse((received[2] as any).data)).toEqual({ step: 3 });
    });

    it('does not emit to a different runId', () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => received1.push(evt));
      service.getRunStream('run-2').subscribe((evt) => received2.push(evt));

      service.emit('run-1', { target: 'run-1' });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(0);
    });

    it('does nothing when emitting to a non-existent runId', () => {
      // Should not throw
      expect(() => service.emit('nonexistent', { data: 'test' })).not.toThrow();
    });

    it('completes the stream and removes it', () => {
      let completed = false;
      service.getRunStream('run-1').subscribe({
        complete: () => { completed = true; },
      });

      service.complete('run-1');
      expect(completed).toBe(true);

      // After completion, emitting should not reach old subscribers
      const newReceived: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => newReceived.push(evt));
      service.emit('run-1', { after: 'complete' });
      expect(newReceived).toHaveLength(1); // New subject, new subscription
    });

    it('completes does nothing for non-existent runId', () => {
      expect(() => service.complete('nonexistent')).not.toThrow();
    });
  });

  describe('global stream', () => {
    it('emits to global subscribers', () => {
      const received: unknown[] = [];
      service.getGlobalStream().subscribe((evt) => received.push(evt));

      service.emitGlobal({ type: 'run_started', runId: 'run-1' });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        data: JSON.stringify({ type: 'run_started', runId: 'run-1' }),
      });
    });

    it('supports multiple global subscribers', () => {
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      service.getGlobalStream().subscribe((evt) => received1.push(evt));
      service.getGlobalStream().subscribe((evt) => received2.push(evt));

      service.emitGlobal({ msg: 'broadcast' });

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('global and run streams are independent', () => {
      const globalReceived: unknown[] = [];
      const runReceived: unknown[] = [];
      service.getGlobalStream().subscribe((evt) => globalReceived.push(evt));
      service.getRunStream('run-1').subscribe((evt) => runReceived.push(evt));

      service.emitGlobal({ scope: 'global' });
      service.emit('run-1', { scope: 'run' });

      expect(globalReceived).toHaveLength(1);
      expect(runReceived).toHaveLength(1);
      expect(JSON.parse((globalReceived[0] as any).data).scope).toBe('global');
      expect(JSON.parse((runReceived[0] as any).data).scope).toBe('run');
    });
  });

  describe('serialization', () => {
    it('serializes payload as JSON in data field', () => {
      const received: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => received.push(evt));

      const payload = { nested: { value: [1, 2, 3] }, str: 'hello' };
      service.emit('run-1', payload);

      const evt = received[0] as any;
      expect(JSON.parse(evt.data)).toEqual(payload);
    });

    it('handles null payload', () => {
      const received: unknown[] = [];
      service.getRunStream('run-1').subscribe((evt) => received.push(evt));

      service.emit('run-1', null);

      const evt = received[0] as any;
      expect(evt.data).toBe('null');
    });
  });
});
