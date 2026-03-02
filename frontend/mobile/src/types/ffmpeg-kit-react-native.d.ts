declare module 'ffmpeg-kit-react-native' {
  export class FFmpegSession {
    getReturnCode(): Promise<ReturnCodeClass>;
    getAllLogsAsString(): Promise<string | null>;
  }

  export class ReturnCodeClass {
    static isSuccess(returnCode: ReturnCodeClass): boolean;
    static isCancel(returnCode: ReturnCodeClass): boolean;
  }

  export const ReturnCode: typeof ReturnCodeClass;

  export class FFmpegKit {
    static execute(command: string): Promise<FFmpegSession>;
    static executeAsync(
      command: string,
      completeCallback?: (session: FFmpegSession) => void,
      logCallback?: (log: unknown) => void,
      statisticsCallback?: (statistics: unknown) => void,
    ): Promise<FFmpegSession>;
    static cancel(): Promise<void>;
  }
}
