interface ControllerResponse<T> {
  data?: T;
  message?: string;
  statusCode: number;
}
