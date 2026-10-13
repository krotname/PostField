export interface ReleaseIdentity { readonly version: string; readonly sha: string; readonly digest: string }
export type Stage = 'not_started' | 'requires_setup' | 'uploading' | 'uploaded' | 'submitting' | 'pending_review' | 'published' | 'rejected' | 'needs_readback';
export interface DeliveryState extends ReleaseIdentity { readonly stage: Stage; readonly uploadId?: string; readonly submissionId?: string; readonly checkedAt?: string }
export interface Journal { read(): Promise<DeliveryState | null>; write(state: DeliveryState): Promise<void> }
export interface StorePort {
  ready(): boolean;
  upload(): Promise<{ uploadId: string }>;
  uploadStatus(state: DeliveryState): Promise<'waiting' | 'ready' | 'rejected'>;
  submit(state: DeliveryState): Promise<{ submissionId: string }>;
  status(state: DeliveryState): Promise<'pending_review' | 'published' | 'rejected' | 'needs_readback'>;
}
