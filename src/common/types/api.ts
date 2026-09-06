export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}