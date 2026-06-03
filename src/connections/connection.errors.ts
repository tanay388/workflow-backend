import { HttpException, HttpStatus } from '@nestjs/common';

export class ConnectionUnavailableError extends Error {
  readonly code = 'CONNECTION_UNAVAILABLE';

  constructor(
    readonly connectionId: string,
    readonly status: string,
    message?: string,
  ) {
    super(
      message ??
        `Connection ${connectionId} is not available (status: ${status}). Reconnect the linked service.`,
    );
    this.name = 'ConnectionUnavailableError';
  }
}

export class ConnectionInUseError extends HttpException {
  constructor(usage: { workflowId: string; workflowName: string; nodeId: string; nodeLabel: string }[]) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'ConnectionInUse',
        message: 'Connection is referenced by workflow nodes',
        usage,
      },
      HttpStatus.CONFLICT,
    );
  }
}
