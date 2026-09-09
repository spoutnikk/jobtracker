import type { ExecutionContext } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { unlink } from 'node:fs/promises';
import { lastValueFrom, of, throwError } from 'rxjs';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';

jest.mock('node:fs/promises', () => ({ unlink: jest.fn() }));

describe('UploadCleanupInterceptor', () => {
  const interceptor = new UploadCleanupInterceptor();
  const filePath = '/tmp/jobtracker-upload-cleanup-test.txt';
  const originalError = new Error('DTO rejected');

  function context(withFile = true): ExecutionContext {
    return new ExecutionContextHost([
      {
        ...(withFile ? { file: { path: filePath } } : {}),
        body: { path: '/must-not-be-deleted', file: { path: '/also-ignored' } },
      },
    ]);
  }

  function rejectUpload(withFile = true) {
    return lastValueFrom(
      interceptor.intercept(context(withFile), {
        handle: () => throwError(() => originalError),
      }),
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(unlink).mockResolvedValue(undefined);
  });

  it('keeps the file on downstream success', async () => {
    const result = { id: 1 };
    await expect(
      lastValueFrom(
        interceptor.intercept(context(), { handle: () => of(result) }),
      ),
    ).resolves.toBe(result);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('removes only request.file.path and propagates the original error', async () => {
    await expect(rejectUpload()).rejects.toBe(originalError);
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledWith(filePath);
  });

  it('waits for removal before propagating the original error', async () => {
    let finishRemoval!: () => void;
    jest.mocked(unlink).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRemoval = resolve;
        }),
    );
    const settled = jest.fn();
    const result = rejectUpload().catch((error: unknown) => {
      settled();
      return error;
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    finishRemoval();
    await expect(result).resolves.toBe(originalError);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('preserves the original error when the service already removed the file', async () => {
    jest
      .mocked(unlink)
      .mockRejectedValue(
        Object.assign(new Error('Missing'), { code: 'ENOENT' }),
      );
    await expect(rejectUpload()).rejects.toBe(originalError);
  });

  it('ignores body paths when request.file is absent', async () => {
    await expect(rejectUpload(false)).rejects.toBe(originalError);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('exposes filesystem errors other than ENOENT', async () => {
    const fileError = Object.assign(new Error('Permission denied'), {
      code: 'EACCES',
    });
    jest.mocked(unlink).mockRejectedValue(fileError);
    await expect(rejectUpload()).rejects.toBe(fileError);
  });
});
