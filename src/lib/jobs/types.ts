export type ProcessDocumentJob = {
  name: "process-document";
  documentId: string;
  userId: string;
};

export type Job = ProcessDocumentJob;

export interface JobQueue {
  enqueue(job: Job): Promise<void>;
  start(): void;
}
