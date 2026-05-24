import * as FileSystem from 'expo-file-system';
import { api } from './api';

export interface PostVideoResponse {
  videoId: string;
  uploadUrl: string;
  expiresIn: number;
}

export async function createVideoRecord(params: {
  exercise: string;
  notes: string;
  sessionDate: string;
  contentType: string;
}): Promise<PostVideoResponse> {
  return api.post<PostVideoResponse>('/videos', params);
}

export async function uploadVideoFile(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const task = FileSystem.createUploadTask(
    uploadUrl,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) {
        onProgress(totalBytesSent / totalBytesExpectedToSend);
      }
    },
  );
  const result = await task.uploadAsync();
  if (result && result.status >= 400) {
    throw new Error(`Upload failed: HTTP ${result.status}`);
  }
}
