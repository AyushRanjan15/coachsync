import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';

export interface Video {
  videoId: string;
  userId: string;
  exercise: string;
  notes: string;
  sessionDate: string;
  uploadedAt: string;
  uploaded: boolean;
  s3Key: string;
  contentType: string;
  playbackUrl: string | null;
  durationSec?: number;
}

export interface PostVideoResponse {
  videoId: string;
  uploadUrl: string;
  expiresIn: number;
}

export async function listVideos(): Promise<Video[]> {
  const resp = await api.get<{ items: Video[] }>('/videos');
  return resp.items;
}

export async function fetchVideo(videoId: string): Promise<Video> {
  return api.get<Video>(`/videos/${videoId}`);
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
