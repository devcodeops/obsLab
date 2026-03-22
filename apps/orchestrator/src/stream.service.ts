import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface MessageEvent {
  data: string;
  id?: string;
  type?: string;
  retry?: number;
}

@Injectable()
export class StreamService {
  private readonly runSubjects = new Map<string, Subject<MessageEvent>>();
  private readonly globalSubject = new Subject<MessageEvent>();

  getRunStream(runId: string): Observable<MessageEvent> {
    if (!this.runSubjects.has(runId)) {
      this.runSubjects.set(runId, new Subject<MessageEvent>());
    }
    return this.runSubjects.get(runId)!.asObservable();
  }

  emit(runId: string, payload: unknown): void {
    const subject = this.runSubjects.get(runId);
    if (subject) {
      subject.next({ data: JSON.stringify(payload) });
    }
  }

  complete(runId: string): void {
    const subject = this.runSubjects.get(runId);
    if (subject) {
      subject.complete();
      this.runSubjects.delete(runId);
    }
  }

  getGlobalStream(): Observable<MessageEvent> {
    return this.globalSubject.asObservable();
  }

  emitGlobal(payload: unknown): void {
    this.globalSubject.next({ data: JSON.stringify(payload) });
  }
}
